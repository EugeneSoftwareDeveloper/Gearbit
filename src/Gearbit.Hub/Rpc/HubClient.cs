using System.Buffers;
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Channels;
using Microsoft.Extensions.Logging;

namespace Gearbit.Hub.Rpc;

/// <summary>Одно WebSocket-подключение (вкладка интерфейса, программа на Python, C#-клиент…).</summary>
public sealed class HubClient
{
    private const int MaxMessageBytes = 1024 * 1024;

    private readonly WebSocket _socket;
    private readonly ILogger _logger;
    private readonly Channel<byte[]> _outbox = Channel.CreateBounded<byte[]>(new BoundedChannelOptions(512)
    {
        FullMode = BoundedChannelFullMode.DropOldest,
        SingleReader = true,
    });

    internal HubClient(WebSocket socket, ILogger logger)
    {
        _socket = socket;
        _logger = logger;
    }

    public string Id { get; } = Guid.NewGuid().ToString("N")[..8];

    /// <summary>Как клиент представился (hub.hello): «Пульт», «Python: obstacle.py»…</summary>
    public string Name { get; set; } = "клиент";

    /// <summary>Присылать ли журнал байтов протокола.</summary>
    public bool TraceEnabled { get; set; }

    /// <summary>Присылать ли состояние эмулятора (для 2D-вида).</summary>
    public bool EmulatorViewEnabled { get; set; }

    public void Send(byte[] message) => _outbox.Writer.TryWrite(message);

    internal async Task RunAsync(RpcDispatcher dispatcher, CancellationToken cancellationToken)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var sender = SendLoopAsync(cts.Token);
        var pending = new ConcurrentBag<Task>();

        try
        {
            // Обычные вызовы выполняются по порядку (важно для команд движения),
            // долгие (поиск, подключение) — параллельно, чтобы не задерживать СТОП.
            var sequential = Task.CompletedTask;
            while (!cts.IsCancellationRequested)
            {
                var message = await ReceiveAsync(cts.Token).ConfigureAwait(false);
                if (message is null)
                {
                    break;
                }

                JsonNode? request;
                try
                {
                    request = JsonNode.Parse(message);
                }
                catch (JsonException)
                {
                    Send(JsonRpc.Error(null, HubErrors.ParseError, "Некорректный JSON."));
                    continue;
                }

                if (request is not JsonObject obj || obj["method"] is not JsonValue methodValue || !methodValue.TryGetValue<string>(out var method))
                {
                    Send(JsonRpc.Error(request?["id"], HubErrors.InvalidRequest, "Ожидался объект JSON-RPC с полем method."));
                    continue;
                }

                var id = obj["id"];
                var parameters = new RpcParams(obj["params"]);
                if (dispatcher.IsConcurrent(method))
                {
                    pending.Add(dispatcher.DispatchAsync(this, id, method, parameters, cts.Token));
                }
                else
                {
                    await sequential.ConfigureAwait(false);
                    sequential = dispatcher.DispatchAsync(this, id, method, parameters, cts.Token);
                }
            }
        }
        catch (Exception ex) when (ex is WebSocketException or OperationCanceledException)
        {
            _logger.LogDebug(ex, "Клиент {Id} отключился", Id);
        }
        finally
        {
            _outbox.Writer.TryComplete();
            await cts.CancelAsync().ConfigureAwait(false);
            await Task.WhenAll(pending.Append(sender)).ContinueWith(_ => { }, TaskScheduler.Default).ConfigureAwait(false);
        }
    }

    private async Task<byte[]?> ReceiveAsync(CancellationToken cancellationToken)
    {
        var buffer = ArrayPool<byte>.Shared.Rent(16 * 1024);
        try
        {
            using var stream = new MemoryStream();
            while (true)
            {
                var result = await _socket.ReceiveAsync(buffer, cancellationToken).ConfigureAwait(false);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    if (_socket.State == WebSocketState.CloseReceived)
                    {
                        await _socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, cancellationToken).ConfigureAwait(false);
                    }

                    return null;
                }

                stream.Write(buffer, 0, result.Count);
                if (stream.Length > MaxMessageBytes)
                {
                    await _socket.CloseAsync(WebSocketCloseStatus.MessageTooBig, "Слишком большое сообщение", cancellationToken).ConfigureAwait(false);
                    return null;
                }

                if (result.EndOfMessage)
                {
                    return stream.ToArray();
                }
            }
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }
    }

    private async Task SendLoopAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var message in _outbox.Reader.ReadAllAsync(cancellationToken).ConfigureAwait(false))
            {
                if (_socket.State != WebSocketState.Open)
                {
                    break;
                }

                await _socket.SendAsync(message, WebSocketMessageType.Text, endOfMessage: true, cancellationToken).ConfigureAwait(false);
            }
        }
        catch (Exception ex) when (ex is WebSocketException or OperationCanceledException)
        {
            _logger.LogDebug(ex, "Отправка клиенту {Id} прервана", Id);
        }
    }
}

/// <summary>Все подключённые клиенты — для рассылки уведомлений.</summary>
public sealed class ClientRegistry
{
    private readonly ConcurrentDictionary<string, HubClient> _clients = new();

    public event EventHandler<HubClient>? Disconnected;

    public IEnumerable<HubClient> All => _clients.Values;

    public int Count => _clients.Count;

    internal void Add(HubClient client) => _clients[client.Id] = client;

    internal void Remove(HubClient client)
    {
        if (_clients.TryRemove(client.Id, out _))
        {
            Disconnected?.Invoke(this, client);
        }
    }

    public void Broadcast(string method, object? payload, Func<HubClient, bool>? filter = null)
    {
        byte[]? message = null;
        foreach (var client in _clients.Values)
        {
            if (filter is null || filter(client))
            {
                message ??= JsonRpc.Notification(method, payload);
                client.Send(message);
            }
        }
    }
}
