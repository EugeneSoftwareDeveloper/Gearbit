using Gearbit.Core.Components;
using Gearbit.Core.Descriptors;
using Gearbit.Core.Protocol;

namespace Gearbit.Protocols.Tudao;

/// <summary>
/// Протокол TUDAO на стороне ПК. Состояние передаётся целиком одним кадром:
/// <c>FF FE 09 01 02 [M1][M2][M3][L1][L2][L3][L4] FD FC</c>, мощность — int8 со знаком.
/// </summary>
public sealed class TudaoProtocol(TudaoOptions options) : IRobotProtocol
{
    public TudaoOptions Options { get; } = options ?? throw new ArgumentNullException(nameof(options));

    public string Name => TudaoOptions.ProtocolName;

    public ProtocolTiming Timing { get; } = new(options.MaxRateHz, TimeSpan.FromMilliseconds(options.ResendIntervalMs));

    public int DistanceMaxLevel => Options.DistanceMax;

    public IReadOnlyList<ConnectStep> ConnectSequence { get; } =
    [
        new("Авторизация", options.Auth, TimeSpan.FromMilliseconds(100)),
        new("Запрос UID", options.Handshake, TimeSpan.FromMilliseconds(100)),
    ];

    public byte[] EncodeState(RobotOutputState state)
    {
        ArgumentNullException.ThrowIfNull(state);

        var payload = new byte[TudaoFrames.StatePrefix.Length + Options.MotorSlots.Count + Options.LightSlots.Count];
        TudaoFrames.StatePrefix.CopyTo(payload);
        var index = TudaoFrames.StatePrefix.Length;

        foreach (var motor in Options.MotorSlots)
        {
            payload[index++] = unchecked((byte)(sbyte)ScalePower(state.GetMotor(motor)));
        }

        foreach (var light in Options.LightSlots)
        {
            payload[index++] = Options.LightCodes.GetValueOrDefault(state.GetLight(light));
        }

        return TudaoFrames.Wrap(payload);
    }

    /// <summary>Проценты −100..100 → единицы устройства (DeviceMin..DeviceMax), округление от нуля.</summary>
    public int ScalePower(int percent)
    {
        percent = Math.Clamp(percent, -100, 100);
        var limit = percent >= 0 ? Options.DeviceMax : -Options.DeviceMin;
        var value = (int)Math.Round(percent * limit / 100.0, MidpointRounding.AwayFromZero);
        return Math.Clamp(value, Options.DeviceMin, Options.DeviceMax);
    }

    /// <summary>Единицы устройства → проценты (для эмулятора и журнала).</summary>
    public int UnscalePower(int deviceValue)
    {
        var limit = deviceValue >= 0 ? Options.DeviceMax : -Options.DeviceMin;
        return limit == 0 ? 0 : (int)Math.Round(deviceValue * 100.0 / limit, MidpointRounding.AwayFromZero);
    }

    public IFrameReader CreateReader() => new TudaoFrameReader(Options);
}

/// <summary>Разбор потока «робот → ПК»: телеметрия и UID.</summary>
public sealed class TudaoFrameReader(TudaoOptions options) : IFrameReader
{
    private readonly TudaoStreamSplitter _splitter = new(
        options.TelemetryVariants.Select(v => v.Length).Append(TudaoFrames.UidLength + TudaoFrames.Overhead));

    public IReadOnlyList<ProtocolMessage> Feed(ReadOnlySpan<byte> data)
    {
        var messages = new List<ProtocolMessage>();
        foreach (var chunk in _splitter.Feed(data))
        {
            messages.Add(chunk.Kind == TudaoChunkKind.Frame ? Decode(chunk.Data) : new UnknownMessage(chunk.Data));
        }

        return messages;
    }

    public ProtocolMessage Decode(byte[] frame)
    {
        ArgumentNullException.ThrowIfNull(frame);

        if (frame.Length == TudaoFrames.UidLength + TudaoFrames.Overhead && frame[2] == TudaoFrames.UidLength)
        {
            return new DeviceInfoMessage(Convert.ToHexString(frame, 3, TudaoFrames.UidLength));
        }

        var variant = options.TelemetryVariants.FirstOrDefault(v => v.Length == frame.Length);
        return variant is null ? new UnknownMessage(frame) : new TelemetryMessage(DecodeTelemetry(frame, variant));
    }

    private RobotTelemetry DecodeTelemetry(byte[] frame, TudaoTelemetryVariant variant)
    {
        int? Field(string name) =>
            variant.Fields.TryGetValue(name, out var index) && index >= 0 && index < frame.Length && frame[index] != options.NoValue
                ? frame[index]
                : null;

        var distances = new Dictionary<string, int?>(StringComparer.OrdinalIgnoreCase);
        foreach (var name in variant.Fields.Keys.Where(k => !TudaoOptions.NonDistanceFields.Contains(k)))
        {
            distances[name] = Field(name) is { } level ? Math.Clamp(level, options.DistanceMin, options.DistanceMax) : null;
        }

        TiltReading? tilt = Field("imuX") is { } x && Field("imuY") is { } y
            ? new TiltReading(x - variant.ImuOffset, y - variant.ImuOffset, Field("imuAcc") ?? 0)
            : null;

        var battery = Field("battery");
        return new RobotTelemetry
        {
            Distances = distances,
            Tilt = tilt,
            BatteryRaw = battery,
            BatteryLow = battery is { } raw && options.BatteryLowThreshold is { } threshold ? raw <= threshold : null,
            Mode = Field("mode"),
            Firmware = variant.Firmware,
            Raw = frame,
        };
    }
}

public sealed class TudaoProtocolFactory : IRobotProtocolFactory
{
    public string Name => TudaoOptions.ProtocolName;

    public IRobotProtocol Create(DeviceDescriptor descriptor)
    {
        ArgumentNullException.ThrowIfNull(descriptor);
        return new TudaoProtocol(TudaoOptions.FromJson(descriptor.Protocol));
    }
}
