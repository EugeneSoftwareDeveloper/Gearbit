using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace BotStudio.Hub;

/// <summary>Коды ошибок JSON-RPC. Отрицательные до −32000 — стандартные, остальные — наши.</summary>
public static class HubErrors
{
    public const int ParseError = -32700;
    public const int InvalidRequest = -32600;
    public const int MethodNotFound = -32601;
    public const int InvalidParams = -32602;
    public const int Internal = -32603;

    public const int NotConnected = -32001;
    public const int ControlBusy = -32002;
    public const int NotFound = -32003;
    public const int NotSupported = -32004;
    public const int ConnectFailed = -32005;
}

/// <summary>Ошибка, которую можно показать пользователю: уходит клиенту как error JSON-RPC.</summary>
public sealed class HubException(int code, string message) : Exception(message)
{
    public int Code { get; } = code;
}

internal static class JsonRpc
{
    public static readonly JsonSerializerOptions Options = CreateOptions();

    public static byte[] Response(JsonNode? id, object? result) =>
        JsonSerializer.SerializeToUtf8Bytes(new JsonObject
        {
            ["jsonrpc"] = "2.0",
            ["id"] = id?.DeepClone(),
            ["result"] = JsonSerializer.SerializeToNode(result, Options),
        }, Options);

    public static byte[] Error(JsonNode? id, int code, string message) =>
        JsonSerializer.SerializeToUtf8Bytes(new JsonObject
        {
            ["jsonrpc"] = "2.0",
            ["id"] = id?.DeepClone(),
            ["error"] = new JsonObject { ["code"] = code, ["message"] = message },
        }, Options);

    public static byte[] Notification(string method, object? payload) =>
        JsonSerializer.SerializeToUtf8Bytes(new JsonObject
        {
            ["jsonrpc"] = "2.0",
            ["method"] = method,
            ["params"] = JsonSerializer.SerializeToNode(payload, Options),
        }, Options);

    private static JsonSerializerOptions CreateOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        };
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
        return options;
    }
}

/// <summary>Параметры вызова с удобным доступом и понятными ошибками.</summary>
public sealed class RpcParams(JsonNode? node)
{
    public JsonNode? Node { get; } = node;

    public string String(string name) =>
        OptionalString(name) ?? throw new HubException(HubErrors.InvalidParams, $"Не задан параметр «{name}».");

    public string? OptionalString(string name) =>
        Node?[name] is JsonValue value && value.TryGetValue<string>(out var s) && !string.IsNullOrWhiteSpace(s) ? s : null;

    public int Int(string name) =>
        OptionalInt(name) ?? throw new HubException(HubErrors.InvalidParams, $"Не задан числовой параметр «{name}».");

    public int? OptionalInt(string name)
    {
        if (Node?[name] is not JsonValue value)
        {
            return null;
        }

        if (value.TryGetValue<int>(out var i))
        {
            return i;
        }

        return value.TryGetValue<double>(out var d) && double.IsFinite(d) ? (int)Math.Round(d) : null;
    }

    public bool Bool(string name, bool fallback = false) =>
        Node?[name] is JsonValue value && value.TryGetValue<bool>(out var b) ? b : fallback;

    public T Enum<T>(string name)
        where T : struct, Enum =>
        System.Enum.TryParse<T>(String(name), ignoreCase: true, out var result) && System.Enum.IsDefined(result)
            ? result
            : throw new HubException(HubErrors.InvalidParams, $"Недопустимое значение «{name}». Возможные: {string.Join(", ", System.Enum.GetNames<T>()).ToLowerInvariant()}.");
}
