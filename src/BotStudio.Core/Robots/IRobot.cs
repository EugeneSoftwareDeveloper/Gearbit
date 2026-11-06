using BotStudio.Core.Components;
using BotStudio.Core.Descriptors;
using BotStudio.Core.Protocol;

namespace BotStudio.Core.Robots;

public enum RobotConnectionState
{
    Disconnected,
    Connecting,
    Connected,

    /// <summary>Связь пропала без команды «отключить».</summary>
    Lost,
}

public sealed class RobotStateChangedEventArgs(RobotConnectionState state, string? reason) : EventArgs
{
    public RobotConnectionState State { get; } = state;

    public string? Reason { get; } = reason;
}

public sealed class TelemetryEventArgs(RobotTelemetry telemetry) : EventArgs
{
    public RobotTelemetry Telemetry { get; } = telemetry;
}

public sealed class ProtocolTraceEventArgs(bool outgoing, ReadOnlyMemory<byte> data, string? note) : EventArgs
{
    /// <summary>true — ПК → робот, false — робот → ПК.</summary>
    public bool Outgoing { get; } = outgoing;

    public ReadOnlyMemory<byte> Data { get; } = data;

    public string? Note { get; } = note;
}

/// <summary>
/// Подключённый робот глазами приложения: набор компонентов-возможностей.
/// Код пользователя и интерфейс работают только с этим интерфейсом, не с байтами.
/// </summary>
public interface IRobot : IAsyncDisposable
{
    string Id { get; }

    string Name { get; }

    DeviceDescriptor Descriptor { get; }

    BuildProfile? Profile { get; }

    RobotConnectionState State { get; }

    string? DeviceUid { get; }

    string? Firmware { get; }

    IReadOnlyList<IRobotComponent> Components { get; }

    /// <summary>Привод сборки, если сборка его описывает.</summary>
    DifferentialDrive? Drive { get; }

    RobotTelemetry? LastTelemetry { get; }

    /// <summary>Общий предел мощности моторов, % (детский режим, ползунок «скорость»).</summary>
    int MaxPowerPercent { get; set; }

    event EventHandler<RobotStateChangedEventArgs>? StateChanged;

    event EventHandler<TelemetryEventArgs>? TelemetryReceived;

    event EventHandler<ProtocolTraceEventArgs>? ProtocolTrace;

    Task ConnectAsync(CancellationToken cancellationToken);

    Task DisconnectAsync();

    /// <summary>Найти компонент по id (M1) или псевдониму сборки (left_wheel).</summary>
    T? Find<T>(string idOrAlias)
        where T : class, IRobotComponent;

    /// <summary>Остановить все моторы немедленно (кадр уходит вне очереди).</summary>
    Task StopAllAsync();
}
