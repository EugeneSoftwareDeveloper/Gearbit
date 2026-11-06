using BotStudio.Core.Components;
using BotStudio.Core.Descriptors;

namespace BotStudio.Core.Protocol;

/// <summary>
/// Протокол конкретной прошивки: превращает желаемое состояние в байты и байты в телеметрию.
/// Реализация — чистые функции без ввода-вывода, поэтому покрывается тестами на эталонных кадрах.
/// </summary>
public interface IRobotProtocol
{
    string Name { get; }

    ProtocolTiming Timing { get; }

    /// <summary>Максимальный уровень датчика расстояния (у SuperBot 6).</summary>
    int DistanceMaxLevel { get; }

    /// <summary>Что отправить сразу после подключения (авторизация, запрос UID…).</summary>
    IReadOnlyList<ConnectStep> ConnectSequence { get; }

    /// <summary>Закодировать полное желаемое состояние (мощности в процентах −100..100).</summary>
    byte[] EncodeState(RobotOutputState state);

    /// <summary>Новый разборщик входящего потока (у каждого подключения свой — он хранит буфер).</summary>
    IFrameReader CreateReader();
}

/// <summary>Создаёт протокол по описанию устройства. Ищется по <see cref="DeviceDescriptor.ProtocolName"/>.</summary>
public interface IRobotProtocolFactory
{
    string Name { get; }

    IRobotProtocol Create(DeviceDescriptor descriptor);
}

/// <summary>Разбирает поток байт (приходящий кусками) на сообщения.</summary>
public interface IFrameReader
{
    IReadOnlyList<ProtocolMessage> Feed(ReadOnlySpan<byte> data);
}

/// <param name="MaxRateHz">Не чаще стольких кадров в секунду.</param>
/// <param name="ResendInterval">Повторять последний кадр с таким интервалом, даже если ничего не менялось.</param>
public sealed record ProtocolTiming(int MaxRateHz, TimeSpan ResendInterval)
{
    public TimeSpan MinInterval => TimeSpan.FromSeconds(1.0 / Math.Max(1, MaxRateHz));
}

/// <summary>Шаг подключения: отправить байты и подождать.</summary>
public sealed record ConnectStep(string Name, byte[] Data, TimeSpan DelayAfter);

public abstract record ProtocolMessage;

public sealed record TelemetryMessage(RobotTelemetry Telemetry) : ProtocolMessage;

public sealed record DeviceInfoMessage(string Uid) : ProtocolMessage;

/// <summary>Кадр распознан по рамке, но его смысл неизвестен. Пишется в журнал протокола.</summary>
public sealed record UnknownMessage(byte[] Raw) : ProtocolMessage;

/// <summary>Показания робота в один момент времени. null — значение не пришло или «нет данных».</summary>
public sealed record RobotTelemetry
{
    public IReadOnlyDictionary<string, int?> Distances { get; init; } = new Dictionary<string, int?>();

    public TiltReading? Tilt { get; init; }

    public int? BatteryRaw { get; init; }

    /// <summary>Батарея разряжена (порог знает протокол); null — порог неизвестен.</summary>
    public bool? BatteryLow { get; init; }

    public int? Mode { get; init; }

    /// <summary>Версия прошивки, определённая по формату кадра (v1/v2).</summary>
    public string? Firmware { get; init; }

    public byte[] Raw { get; init; } = [];
}

/// <summary>Желаемое состояние выходов робота. Мощность — в процентах −100..100 (уже с учётом лимитов).</summary>
public sealed class RobotOutputState
{
    private readonly Dictionary<string, int> _motors = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, RobotColor> _lights = new(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyDictionary<string, int> Motors => _motors;

    public IReadOnlyDictionary<string, RobotColor> Lights => _lights;

    public int GetMotor(string id) => _motors.GetValueOrDefault(id);

    public RobotColor GetLight(string id) => _lights.GetValueOrDefault(id);

    public void SetMotor(string id, int percent) => _motors[id] = Math.Clamp(percent, -100, 100);

    public void SetLight(string id, RobotColor color) => _lights[id] = color;

    public void StopMotors()
    {
        foreach (var key in _motors.Keys.ToList())
        {
            _motors[key] = 0;
        }
    }

    public RobotOutputState Clone()
    {
        var copy = new RobotOutputState();
        foreach (var (key, value) in _motors)
        {
            copy._motors[key] = value;
        }

        foreach (var (key, value) in _lights)
        {
            copy._lights[key] = value;
        }

        return copy;
    }
}
