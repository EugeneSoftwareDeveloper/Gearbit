using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json.Nodes;

namespace Gearbit.Tests;

internal static class TestHub
{
    public static int FreePort()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        return ((IPEndPoint)listener.LocalEndpoint).Port;
    }
}

internal sealed class RpcError(int code, string message) : Exception(message)
{
    public int Code { get; } = code;
}

/// <summary>Мини-клиент JSON-RPC для тестов (как будущий C#-SDK, только проще).</summary>
internal sealed class RpcClient : IAsyncDisposable
{
    private readonly ClientWebSocket _socket = new();
    private readonly Dictionary<int, TaskCompletionSource<JsonNode>> _pending = [];
    private readonly List<JsonNode> _notifications = [];
    private readonly Lock _lock = new();
    private readonly CancellationTokenSource _cts = new();
    private Task _receiver = Task.CompletedTask;
    private int _nextId;

    public static async Task<RpcClient> ConnectAsync(int port)
    {
        var client = new RpcClient();
        await client._socket.ConnectAsync(new Uri($"ws://localhost:{port}/ws"), CancellationToken.None);
        client._receiver = client.ReceiveLoopAsync();
        return client;
    }

    public async Task<JsonNode> CallAsync(string method, JsonObject? parameters = null)
    {
        var id = Interlocked.Increment(ref _nextId);
        var tcs = new TaskCompletionSource<JsonNode>(TaskCreationOptions.RunContinuationsAsynchronously);
        lock (_lock)
        {
            _pending[id] = tcs;
        }

        var request = new JsonObject { ["jsonrpc"] = "2.0", ["id"] = id, ["method"] = method, ["params"] = parameters ?? [] };
        await _socket.SendAsync(Encoding.UTF8.GetBytes(request.ToJsonString()), WebSocketMessageType.Text, true, CancellationToken.None);
        var response = await tcs.Task.WaitAsync(TimeSpan.FromSeconds(10));
        if (response["error"] is { } error)
        {
            throw new RpcError((int)error["code"]!, (string?)error["message"] ?? "");
        }

        return response["result"] ?? JsonValue.Create((string?)null)!;
    }

    public async Task<JsonNode> WaitNotificationAsync(string method, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            lock (_lock)
            {
                var found = _notifications.FirstOrDefault(n => (string?)n["method"] == method);
                if (found is not null)
                {
                    return found["params"]!;
                }
            }

            await Task.Delay(20);
        }

        throw new TimeoutException($"Не пришло уведомление {method}.");
    }

    /// <summary>Все уведомления с этим методом, по порядку.</summary>
    public List<JsonNode> Notifications(string method)
    {
        lock (_lock)
        {
            return [.. _notifications.Where(n => (string?)n["method"] == method).Select(n => n["params"]!)];
        }
    }

    /// <summary>Дождаться уведомления, подходящего под условие.</summary>
    public async Task<JsonNode> WaitNotificationAsync(string method, Func<JsonNode, bool> match, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            var found = Notifications(method).FirstOrDefault(match);
            if (found is not null)
            {
                return found;
            }

            await Task.Delay(20);
        }

        throw new TimeoutException($"Не пришло уведомление {method}.");
    }

    public async ValueTask DisposeAsync()
    {
        // Сначала закрываем вежливо и ждём ответный Close в цикле приёма, как HubConnection.
        // Отмена ждущего ReceiveAsync обрывает сокет, и если отменить раньше, обрыв гонится
        // с CloseAsync и тест падает на закрытии (так было на GitHub Actions).
        try
        {
            if (_socket.State == WebSocketState.Open)
            {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                await _socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, timeout.Token);
            }

            await _receiver.WaitAsync(TimeSpan.FromSeconds(2));
        }
        catch (Exception ex) when (ex is OperationCanceledException or WebSocketException or TimeoutException)
        {
            // Хаб уже закрыл соединение или не ответил: дальше отменим приём.
        }

        await _cts.CancelAsync();
        try
        {
            await _receiver;
        }
        catch (Exception ex) when (ex is OperationCanceledException or WebSocketException)
        {
        }

        _socket.Dispose();
        _cts.Dispose();
    }

    private async Task ReceiveLoopAsync()
    {
        var buffer = new byte[64 * 1024];
        using var stream = new MemoryStream();
        while (!_cts.IsCancellationRequested)
        {
            var result = await _socket.ReceiveAsync(buffer, _cts.Token);
            if (result.MessageType == WebSocketMessageType.Close)
            {
                return;
            }

            stream.Write(buffer, 0, result.Count);
            if (!result.EndOfMessage)
            {
                continue;
            }

            var message = JsonNode.Parse(stream.ToArray())!;
            stream.SetLength(0);
            lock (_lock)
            {
                if (message["id"] is JsonValue idValue && idValue.TryGetValue<int>(out var id) && _pending.Remove(id, out var tcs))
                {
                    tcs.TrySetResult(message);
                }
                else if (message["method"] is not null)
                {
                    _notifications.Add(message);
                }
            }
        }
    }
}
