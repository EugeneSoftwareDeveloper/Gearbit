using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging;

namespace BotStudio.Hub.Rpc;

public delegate Task<object?> RpcHandler(HubClient client, RpcParams parameters, CancellationToken cancellationToken);

/// <summary>Таблица методов JSON-RPC и их вызов с переводом исключений в ошибки протокола.</summary>
public sealed class RpcDispatcher(ILogger<RpcDispatcher> logger)
{
    private readonly Dictionary<string, (RpcHandler Handler, bool Concurrent, string Summary)> _methods = new(StringComparer.Ordinal);

    public IEnumerable<(string Name, string Summary)> Methods => _methods.Select(m => (m.Key, m.Value.Summary)).OrderBy(m => m.Key, StringComparer.Ordinal);

    public void Register(string method, string summary, RpcHandler handler, bool concurrent = false) =>
        _methods[method] = (handler, concurrent, summary);

    public void Register(string method, string summary, Func<HubClient, RpcParams, object?> handler) =>
        Register(method, summary, (client, p, _) => Task.FromResult(handler(client, p)));

    public bool IsConcurrent(string method) => _methods.TryGetValue(method, out var m) && m.Concurrent;

    public async Task DispatchAsync(HubClient client, JsonNode? id, string method, RpcParams parameters, CancellationToken cancellationToken)
    {
        // Уведомления (без id) не требуют ответа, но ошибки всё равно пишем в журнал.
        var wantsReply = id is not null;
        if (!_methods.TryGetValue(method, out var entry))
        {
            if (wantsReply)
            {
                client.Send(JsonRpc.Error(id, HubErrors.MethodNotFound, $"Нет метода «{method}»."));
            }

            return;
        }

        try
        {
            var result = await entry.Handler(client, parameters, cancellationToken).ConfigureAwait(false);
            if (wantsReply)
            {
                client.Send(JsonRpc.Response(id, result));
            }
        }
        catch (HubException ex)
        {
            if (wantsReply)
            {
                client.Send(JsonRpc.Error(id, ex.Code, ex.Message));
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Клиент ушёл — отвечать некому.
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Ошибка в методе {Method}", method);
            if (wantsReply)
            {
                client.Send(JsonRpc.Error(id, HubErrors.Internal, $"Внутренняя ошибка: {ex.Message}"));
            }
        }
    }
}
