using System.Text.Json;
using System.Text.Json.Serialization;

namespace BotStudio.Core.Descriptors;

/// <summary>
/// Описание модели робота (devices/*.json): как найти устройство, как к нему подключаться,
/// какой протокол и какие компоненты у него есть. Секция <see cref="Protocol"/> специфична
/// для протокола и разбирается его адаптером.
/// </summary>
public sealed class DeviceDescriptor
{
    public required string Id { get; init; }

    public string Title { get; init; } = "";

    /// <summary>draft — значения не проверены на устройстве; stable — проверены.</summary>
    public string Status { get; init; } = "draft";

    public DeviceMatch Match { get; init; } = new();

    public TransportDescriptor Transport { get; init; } = new();

    /// <summary>Параметры протокола (сырой JSON). Обязательное поле внутри — <c>name</c>.</summary>
    public JsonElement Protocol { get; init; }

    public IReadOnlyList<ComponentDescriptor> Components { get; init; } = [];

    [JsonIgnore]
    public string ProtocolName =>
        Protocol.ValueKind == JsonValueKind.Object && Protocol.TryGetProperty("name", out var name)
            ? name.GetString() ?? ""
            : "";
}

public sealed class DeviceMatch
{
    public IReadOnlyList<string> NamePrefixes { get; init; } = [];

    public IReadOnlyList<string> Services { get; init; } = [];

    /// <summary>Устройство подходит, если имя начинается с одного из префиксов или в рекламе есть один из сервисов.</summary>
    public bool Matches(string? advertisedName, IEnumerable<Guid> advertisedServices)
    {
        ArgumentNullException.ThrowIfNull(advertisedServices);

        if (!string.IsNullOrEmpty(advertisedName) &&
            NamePrefixes.Any(p => advertisedName.StartsWith(p, StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        var wanted = Services.Select(s => Guid.TryParse(s, out var g) ? g : Guid.Empty).Where(g => g != Guid.Empty).ToHashSet();
        return advertisedServices.Any(wanted.Contains);
    }
}

public sealed class TransportDescriptor
{
    /// <summary>ble-gatt, позже serial, tcp…</summary>
    public string Type { get; init; } = "ble-gatt";

    public string? Service { get; init; }

    public string? Write { get; init; }

    public string? Notify { get; init; }

    /// <summary>Максимальный размер одной записи (BLE без расширенного MTU — 20 байт).</summary>
    public int ChunkSize { get; init; } = 20;

    public bool WriteWithResponse { get; init; }
}

public sealed class ComponentDescriptor
{
    public required string Id { get; init; }

    /// <summary>motor, distance, imu, light, battery.</summary>
    public required string Type { get; init; }

    public string? Title { get; init; }

    /// <summary>Компонент появляется только при этой прошивке (определяется по телеметрии).</summary>
    public string? RequiresFirmware { get; init; }
}
