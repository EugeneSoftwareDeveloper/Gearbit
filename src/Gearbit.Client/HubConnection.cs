using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Gearbit.Client;

/// <summary>
/// Соединение с хабом: JSON-RPC 2.0 через WebSocket (docs/dev/hub-api.md).
/// Читатель в фоне принимает ответы и уведомления (телеметрию, <c>safety.event</c>), вызовы ждут свой ответ.
/// Синхронные обёртки безопасны и там, где есть контекст синхронизации: внутри везде <c>ConfigureAwait(false)</c>.
/// </summary>
internal sealed class HubConnection : IDisposable
{
    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(5);

    private readonly ClientWebSocket _socket;
    private readonly ConcurrentDictionary<int, TaskCompletionSource<JsonNode?>> _pending = new();
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private readonly CancellationTokenSource _closing = new();
    private readonly CancellationTokenSource _interrupted = new();
    private readonly Task _reader;
    private readonly IClientText _text;
    private int _nextId;
    private volatile JsonObject? _telemetry;
    private volatile JsonObject? _robot;
    private volatile string _interruptMessage;
    private volatile bool _closed;

    private HubConnection(ClientWebSocket socket, IClientText text)
    {
        _socket = socket;
        _text = text;
        _interruptMessage = text.Stopped;
        _reader = Task.Run(ReadLoopAsync);
    }

    /// <summary>Последняя телеметрия робота или null, если робота нет.</summary>
    public JsonObject? Telemetry => _telemetry;

    /// <summary>Сведения о роботе (<c>robot.info</c>) или null.</summary>
    public JsonObject? Robot => _robot;

    public string? ClientId { get; private set; }

    /// <summary>Сработал СТОП, страж или пропала связь: программа должна закончиться.</summary>
    public CancellationToken Interrupted => _interrupted.Token;

    public string InterruptMessage => _interruptMessage;

    public bool Closed => _closed;

    /// <param name="text">Язык сообщений: на нём же хаб присылает ошибки и <c>safety.event</c>.</param>
    public static HubConnection Connect(Uri url, string name, string? runId, IClientText text)
    {
        var socket = new ClientWebSocket();
        try
        {
            using var timeout = new CancellationTokenSource(ConnectTimeout);
            socket.ConnectAsync(url, timeout.Token).ConfigureAwait(false).GetAwaiter().GetResult();
        }
        catch (Exception ex) when (ex is WebSocketException or OperationCanceledException or HttpRequestException)
        {
            socket.Dispose();
            throw new GearbitException(text.CannotConnect(url, ex.Message), ex);
        }

        var connection = new HubConnection(socket, text);
        try
        {
            var hello = new JsonObject { ["name"] = name, ["lang"] = text.Language };
            if (!string.IsNullOrEmpty(runId))
            {
                hello["runId"] = runId;
            }

            var result = connection.Call("hub.hello", hello);
            connection.ClientId = (string?)result?["clientId"];
            connection._robot = result?["robot"] as JsonObject;
            if ((string?)connection._robot?["state"] == "connected")
            {
                try
                {
                    connection._telemetry = connection.Call("robot.telemetry") as JsonObject;
                }
                catch (GearbitException)
                {
                    // Телеметрия придёт уведомлением.
                }
            }

            return connection;
        }
        catch
        {
            connection.Dispose();
            throw;
        }
    }

    public JsonNode? Call(string method, JsonObject? parameters = null, TimeSpan? timeout = null) =>
        CallAsync(method, parameters, timeout).ConfigureAwait(false).GetAwaiter().GetResult();

    public async Task<JsonNode?> CallAsync(string method, JsonObject? parameters = null, TimeSpan? timeout = null)
    {
        if (_closed)
        {
            throw new GearbitException(_text.ConnectionLost);
        }

        var id = Interlocked.Increment(ref _nextId);
        var answer = new TaskCompletionSource<JsonNode?>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[id] = answer;
        var request = new JsonObject { ["jsonrpc"] = "2.0", ["id"] = id, ["method"] = method, ["params"] = parameters ?? [] };
        var bytes = Encoding.UTF8.GetBytes(request.ToJsonString());
        try
        {
            await _sendLock.WaitAsync().ConfigureAwait(false);
            try
            {
                await _socket.SendAsync(bytes, WebSocketMessageType.Text, true, _closing.Token).ConfigureAwait(false);
            }
            finally
            {
                _sendLock.Release();
            }
        }
        catch (Exception ex) when (ex is WebSocketException or OperationCanceledException or ObjectDisposedException)
        {
            _pending.TryRemove(id, out _);
            throw new GearbitException(_text.ConnectionLost, ex);
        }

        try
        {
            return await answer.Task.WaitAsync(timeout ?? TimeSpan.FromSeconds(5)).ConfigureAwait(false);
        }
        catch (TimeoutException)
        {
            _pending.TryRemove(id, out _);
            throw new GearbitException(_text.NoAnswer(method));
        }
    }

    public void Dispose()
    {
        if (_closed && _closing.IsCancellationRequested)
        {
            return;
        }

        _closed = true;
        try
        {
            if (_socket.State == WebSocketState.Open)
            {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(1));
                _socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", timeout.Token).ConfigureAwait(false).GetAwaiter().GetResult();
            }
        }
        catch (Exception ex) when (ex is WebSocketException or OperationCanceledException or ObjectDisposedException)
        {
            // Хаб уже закрыл соединение.
        }

        _closing.Cancel();
        try
        {
            _reader.Wait(TimeSpan.FromSeconds(1));
        }
        catch (AggregateException)
        {
            // Читатель сам сообщает об обрыве; здесь он уже не нужен.
        }

        _socket.Dispose();
        _sendLock.Dispose();
    }

    private async Task ReadLoopAsync()
    {
        var buffer = new byte[64 * 1024];
        using var message = new MemoryStream();
        try
        {
            while (!_closing.IsCancellationRequested)
            {
                var received = await _socket.ReceiveAsync(buffer, _closing.Token).ConfigureAwait(false);
                if (received.MessageType == WebSocketMessageType.Close)
                {
                    break;
                }

                message.Write(buffer, 0, received.Count);
                if (!received.EndOfMessage)
                {
                    continue;
                }

                var text = Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length);
                message.SetLength(0);
                Handle(text);
            }
        }
        catch (Exception ex) when (ex is WebSocketException or OperationCanceledException or ObjectDisposedException)
        {
            // Обрыв или закрытие — ниже.
        }
        finally
        {
            _closed = true;
            foreach (var id in _pending.Keys)
            {
                if (_pending.TryRemove(id, out var waiting))
                {
                    waiting.TrySetException(new GearbitException(_text.ConnectionLost));
                }
            }

            if (!_closing.IsCancellationRequested)
            {
                Interrupt(_text.ConnectionLost);
            }
        }
    }

    private void Handle(string text)
    {
        JsonObject? message;
        try
        {
            message = JsonNode.Parse(text) as JsonObject;
        }
        catch (JsonException)
        {
            return;
        }

        if (message is null)
        {
            return;
        }

        if (message["method"] is null && message["id"] is JsonValue idValue && idValue.TryGetValue<int>(out var id))
        {
            if (_pending.TryRemove(id, out var waiting))
            {
                if (message["error"] is JsonObject error)
                {
                    var code = error["code"] is JsonValue c && c.TryGetValue<int>(out var number) ? number : (int?)null;
                    waiting.TrySetException(new GearbitException((string?)error["message"] ?? _text.HubError, code));
                }
                else
                {
                    waiting.TrySetResult(message["result"]?.DeepClone());
                }
            }

            return;
        }

        var parameters = message["params"];
        switch ((string?)message["method"])
        {
            case "robot.telemetry":
                _telemetry = parameters?.DeepClone() as JsonObject;
                break;
            case "robot.info":
                _robot = parameters?.DeepClone() as JsonObject;
                if (_robot is null)
                {
                    _telemetry = null;
                }

                break;
            case "robot.state":
                if (_robot?.DeepClone() is JsonObject robot)
                {
                    robot["state"] = (string?)parameters?["state"];
                    _robot = robot;
                }

                break;
            case "safety.event":
                // СТОП, страж, потеря связи с роботом: программа прекращается, как блоки в интерфейсе.
                Interrupt((string?)parameters?["message"] ?? _text.Stopped);
                break;
        }
    }

    private void Interrupt(string message)
    {
        if (_interrupted.IsCancellationRequested)
        {
            return;
        }

        _interruptMessage = message;
        try
        {
            _interrupted.Cancel();
        }
        catch (AggregateException)
        {
            // Ошибка в чужом обработчике отмены не должна ронять чтение.
        }
    }
}
