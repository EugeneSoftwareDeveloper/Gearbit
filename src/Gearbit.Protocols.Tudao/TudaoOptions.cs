using System.Globalization;
using System.Text.Json;
using Gearbit.Core.Components;

namespace Gearbit.Protocols.Tudao;

/// <summary>Формат одного варианта кадра телеметрии (зависит от прошивки).</summary>
/// <param name="Length">Полная длина кадра в байтах, включая FF FE и FD FC.</param>
/// <param name="Fields">Имя поля → индекс байта в кадре. Имена D1/D2… — датчики расстояния.</param>
public sealed record TudaoTelemetryVariant(int Length, string Firmware, IReadOnlyDictionary<string, int> Fields, int ImuOffset);

/// <summary>
/// Параметры протокола TUDAO из секции <c>protocol</c> файла devices/*.json.
/// Всё, что может отличаться между прошивками и ещё не проверено, задаётся здесь, а не в коде.
/// </summary>
public sealed class TudaoOptions
{
    public const string ProtocolName = "tudao-uart";

    /// <summary>Поля телеметрии, которые не являются датчиками расстояния.</summary>
    public static readonly IReadOnlySet<string> NonDistanceFields =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "mode", "battery", "imuX", "imuY", "imuAcc" };

    public byte[] Auth { get; init; } = Convert.FromHexString("55AA112064796F7A574F50663035326757565034");

    public byte[] Handshake { get; init; } = Convert.FromHexString("FFFE0104FDFC");

    public IReadOnlyList<string> MotorSlots { get; init; } = ["M1", "M2", "M3"];

    public IReadOnlyList<string> LightSlots { get; init; } = ["L1", "L2", "L3", "L4"];

    /// <summary>Предел мощности устройства «назад» (отрицательное число).</summary>
    public int DeviceMin { get; init; } = -10;

    /// <summary>Предел мощности устройства «вперёд».</summary>
    public int DeviceMax { get; init; } = 10;

    public IReadOnlyDictionary<RobotColor, byte> LightCodes { get; init; } = new Dictionary<RobotColor, byte>
    {
        [RobotColor.Off] = 0,
        [RobotColor.Red] = 1,
        [RobotColor.Orange] = 2,
        [RobotColor.Yellow] = 3,
        [RobotColor.Green] = 4,
        [RobotColor.Cyan] = 5,
        [RobotColor.Blue] = 6,
        [RobotColor.Purple] = 7,
        [RobotColor.White] = 10,
    };

    public int MaxRateHz { get; init; } = 20;

    public int ResendIntervalMs { get; init; } = 500;

    public IReadOnlyList<TudaoTelemetryVariant> TelemetryVariants { get; init; } =
    [
        new(11, "v1", new Dictionary<string, int> { ["mode"] = 3, ["battery"] = 5, ["D1"] = 7, ["D2"] = 8 }, 0),
        new(19, "v2", new Dictionary<string, int> { ["battery"] = 5, ["D1"] = 6, ["D2"] = 7, ["imuX"] = 8, ["imuY"] = 9, ["imuAcc"] = 10 }, 90),
    ];

    /// <summary>Значение байта «нет данных».</summary>
    public int NoValue { get; init; } = 255;

    public int DistanceMin { get; init; }

    public int DistanceMax { get; init; } = 6;

    public int? BatteryLowThreshold { get; init; }

    /// <summary>Разобрать секцию <c>protocol</c>. Отсутствующие поля получают значения по умолчанию.</summary>
    public static TudaoOptions FromJson(JsonElement protocol)
    {
        var defaults = new TudaoOptions();
        if (protocol.ValueKind != JsonValueKind.Object)
        {
            return defaults;
        }

        var stateFrame = Section(protocol, "stateFrame");
        var power = Section(protocol, "power");
        var sendLoop = Section(protocol, "sendLoop");
        var telemetry = Section(protocol, "telemetry");
        var distance = Section(protocol, "distance");
        var battery = Section(protocol, "battery");
        var levels = Section(distance, "levels");

        return new TudaoOptions
        {
            Auth = Hex(Section(protocol, "auth"), "hex") ?? defaults.Auth,
            Handshake = Hex(Section(protocol, "handshake"), "hex") ?? defaults.Handshake,
            MotorSlots = Strings(stateFrame, "motorSlots") ?? defaults.MotorSlots,
            LightSlots = Strings(stateFrame, "lightSlots") ?? defaults.LightSlots,
            DeviceMin = Int(power, "deviceMin") ?? defaults.DeviceMin,
            DeviceMax = Int(power, "deviceMax") ?? defaults.DeviceMax,
            LightCodes = LightCodesFrom(Section(protocol, "lightColors")) ?? defaults.LightCodes,
            MaxRateHz = Int(sendLoop, "maxRateHz") ?? defaults.MaxRateHz,
            ResendIntervalMs = Int(sendLoop, "resendIntervalMs") ?? defaults.ResendIntervalMs,
            TelemetryVariants = VariantsFrom(telemetry) ?? defaults.TelemetryVariants,
            NoValue = Int(telemetry, "noValue") ?? defaults.NoValue,
            DistanceMin = Int(levels, "min") ?? defaults.DistanceMin,
            DistanceMax = Int(levels, "max") ?? defaults.DistanceMax,
            BatteryLowThreshold = Int(battery, "lowThreshold"),
        };
    }

    private static JsonElement Section(JsonElement parent, string name) =>
        parent.ValueKind == JsonValueKind.Object && parent.TryGetProperty(name, out var value) ? value : default;

    private static int? Int(JsonElement parent, string name)
    {
        var value = Section(parent, name);
        return value.ValueKind switch
        {
            JsonValueKind.Number => value.GetInt32(),
            JsonValueKind.String when value.GetString() is { } s => ParseIntOrHex(s),
            _ => null,
        };
    }

    private static string? Str(JsonElement parent, string name)
    {
        var value = Section(parent, name);
        return value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    }

    private static byte[]? Hex(JsonElement parent, string name)
    {
        var value = Section(parent, name);
        return value.ValueKind == JsonValueKind.String
            ? Convert.FromHexString((value.GetString() ?? "").Replace(" ", "", StringComparison.Ordinal))
            : null;
    }

    private static List<string>? Strings(JsonElement parent, string name)
    {
        var value = Section(parent, name);
        return value.ValueKind == JsonValueKind.Array ? value.EnumerateArray().Select(e => e.GetString() ?? "").ToList() : null;
    }

    private static Dictionary<RobotColor, byte>? LightCodesFrom(JsonElement section)
    {
        if (section.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var result = new Dictionary<RobotColor, byte>();
        foreach (var property in section.EnumerateObject())
        {
            if (property.Value.ValueKind == JsonValueKind.Number &&
                Enum.TryParse<RobotColor>(property.Name, ignoreCase: true, out var color))
            {
                result[color] = property.Value.GetByte();
            }
        }

        return result.Count > 0 ? result : null;
    }

    private static List<TudaoTelemetryVariant>? VariantsFrom(JsonElement telemetry)
    {
        var variants = Section(telemetry, "variants");
        if (variants.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        var result = new List<TudaoTelemetryVariant>();
        foreach (var variant in variants.EnumerateArray())
        {
            var fields = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var fieldsSection = Section(variant, "fields");
            if (fieldsSection.ValueKind == JsonValueKind.Object)
            {
                foreach (var field in fieldsSection.EnumerateObject())
                {
                    fields[field.Name] = field.Value.GetInt32();
                }
            }

            result.Add(new TudaoTelemetryVariant(
                Int(variant, "length") ?? 0,
                Str(variant, "firmware") ?? "",
                fields,
                Int(variant, "imuOffset") ?? 0));
        }

        return result;
    }

    private static int? ParseIntOrHex(string text) =>
        text.StartsWith("0x", StringComparison.OrdinalIgnoreCase)
            ? int.Parse(text.AsSpan(2), NumberStyles.HexNumber, CultureInfo.InvariantCulture)
            : int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number) ? number : null;
}
