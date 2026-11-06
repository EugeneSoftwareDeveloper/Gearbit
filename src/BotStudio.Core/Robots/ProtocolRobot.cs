using BotStudio.Core.Components;
using BotStudio.Core.Descriptors;
using BotStudio.Core.Protocol;
using BotStudio.Core.Transport;

namespace BotStudio.Core.Robots;

/// <summary>
/// Универсальный робот: описание устройства + протокол + транспорт.
/// Хранит желаемое состояние и отправляет его циклом с ограничением частоты
/// (протокол SuperBot передаёт состояние целиком, а не отдельные команды).
/// </summary>
public sealed class ProtocolRobot : IRobot
{
    private readonly ITransport _transport;
    private readonly IRobotProtocol _protocol;
    private readonly TimeProvider _time;
    private readonly Lock _stateLock = new();
    private readonly SemaphoreSlim _writeLock = new(1, 1);
    private readonly RobotOutputState _desired = new();
    private readonly List<RobotComponentBase> _components = [];
    private IFrameReader? _reader;
    private CancellationTokenSource? _loopCts;
    private Task? _loopTask;
    private bool _dirty = true;
    private long _lastSentTimestamp;
    private bool _userDisconnect;
    private int _maxPowerPercent;

    public ProtocolRobot(
        string id,
        string name,
        DeviceDescriptor descriptor,
        BuildProfile? profile,
        ITransport transport,
        IRobotProtocol protocol,
        TimeProvider? timeProvider = null)
    {
        ArgumentNullException.ThrowIfNull(descriptor);
        ArgumentNullException.ThrowIfNull(transport);
        ArgumentNullException.ThrowIfNull(protocol);

        Id = id;
        Name = name;
        Descriptor = descriptor;
        Profile = profile;
        _transport = transport;
        _protocol = protocol;
        _time = timeProvider ?? TimeProvider.System;
        _maxPowerPercent = Math.Clamp(profile?.Limits.MaxPowerPercent ?? 100, 0, 100);

        foreach (var component in descriptor.Components)
        {
            RobotComponentBase? created = component.Type.ToUpperInvariant() switch
            {
                "MOTOR" => new MotorComponent(component, this),
                "LIGHT" => new LightComponent(component, this),
                "DISTANCE" => new DistanceComponent(component, protocol.DistanceMaxLevel, profile?.Calibration.Distance.GetValueOrDefault(component.Id)),
                "IMU" => new ImuComponent(component),
                "BATTERY" => new BatteryComponent(component),
                _ => null,
            };

            if (created is not null)
            {
                _components.Add(created);
                if (created is MotorComponent)
                {
                    _desired.SetMotor(created.Id, 0);
                }
                else if (created is LightComponent)
                {
                    _desired.SetLight(created.Id, RobotColor.Off);
                }
            }
        }

        Drive = DifferentialDrive.FromProfile(profile?.Drive, motorId => Find<IMotor>(motorId));
    }

    public string Id { get; }

    public string Name { get; }

    public DeviceDescriptor Descriptor { get; }

    public BuildProfile? Profile { get; }

    public RobotConnectionState State { get; private set; } = RobotConnectionState.Disconnected;

    public string? DeviceUid { get; private set; }

    public string? Firmware { get; private set; }

    public IReadOnlyList<IRobotComponent> Components => _components;

    public DifferentialDrive? Drive { get; }

    public RobotTelemetry? LastTelemetry { get; private set; }

    public int MaxPowerPercent
    {
        get => _maxPowerPercent;
        set
        {
            lock (_stateLock)
            {
                _maxPowerPercent = Math.Clamp(value, 0, 100);
                foreach (var (motor, power) in _desired.Motors.ToList())
                {
                    _desired.SetMotor(motor, Math.Clamp(power, -_maxPowerPercent, _maxPowerPercent));
                }

                _dirty = true;
            }
        }
    }

    public event EventHandler<RobotStateChangedEventArgs>? StateChanged;

    public event EventHandler<TelemetryEventArgs>? TelemetryReceived;

    public event EventHandler<ProtocolTraceEventArgs>? ProtocolTrace;

    /// <summary>Снимок желаемого состояния (для интерфейса и тестов).</summary>
    public RobotOutputState GetOutputState()
    {
        lock (_stateLock)
        {
            return _desired.Clone();
        }
    }

    public T? Find<T>(string idOrAlias)
        where T : class, IRobotComponent
    {
        ArgumentNullException.ThrowIfNull(idOrAlias);
        var id = ResolveAlias(idOrAlias);
        return _components.FirstOrDefault(c => string.Equals(c.Id, id, StringComparison.OrdinalIgnoreCase)) as T;
    }

    public string ResolveAlias(string idOrAlias)
    {
        if (Profile is null)
        {
            return idOrAlias;
        }

        foreach (var (alias, target) in Profile.Aliases)
        {
            if (string.Equals(alias, idOrAlias, StringComparison.OrdinalIgnoreCase))
            {
                return target;
            }
        }

        return idOrAlias;
    }

    public async Task ConnectAsync(CancellationToken cancellationToken)
    {
        if (State is RobotConnectionState.Connected or RobotConnectionState.Connecting)
        {
            return;
        }

        _userDisconnect = false;
        SetState(RobotConnectionState.Connecting, null);
        _reader = _protocol.CreateReader();
        _transport.DataReceived += OnDataReceived;
        _transport.StateChanged += OnTransportStateChanged;

        try
        {
            await _transport.ConnectAsync(cancellationToken).ConfigureAwait(false);
            foreach (var step in _protocol.ConnectSequence)
            {
                await WriteAsync(step.Data, step.Name, cancellationToken).ConfigureAwait(false);
                if (step.DelayAfter > TimeSpan.Zero)
                {
                    await Task.Delay(step.DelayAfter, _time, cancellationToken).ConfigureAwait(false);
                }
            }
        }
        catch
        {
            _transport.DataReceived -= OnDataReceived;
            _transport.StateChanged -= OnTransportStateChanged;
            SetState(RobotConnectionState.Disconnected, "Не удалось подключиться");
            throw;
        }

        lock (_stateLock)
        {
            // После подключения робот всегда стоит: не продолжаем «старое» движение.
            _desired.StopMotors();
            _dirty = true;
        }

        _loopCts = new CancellationTokenSource();
        _loopTask = Task.Run(() => SendLoopAsync(_loopCts.Token), CancellationToken.None);
        SetState(RobotConnectionState.Connected, null);
    }

    public async Task DisconnectAsync()
    {
        if (State == RobotConnectionState.Disconnected)
        {
            return;
        }

        _userDisconnect = true;
        if (State == RobotConnectionState.Connected)
        {
            try
            {
                await StopAllAsync().ConfigureAwait(false);
            }
            catch (InvalidOperationException)
            {
                // Связь уже пропала — останавливать нечего.
            }
        }

        await StopLoopAsync().ConfigureAwait(false);
        _transport.DataReceived -= OnDataReceived;
        _transport.StateChanged -= OnTransportStateChanged;
        await _transport.DisconnectAsync().ConfigureAwait(false);
        SetState(RobotConnectionState.Disconnected, "Отключено");
    }

    public async Task StopAllAsync()
    {
        byte[] frame;
        lock (_stateLock)
        {
            _desired.StopMotors();
            frame = _protocol.EncodeState(_desired);
            _dirty = false;
        }

        if (_transport.State == TransportState.Connected)
        {
            await WriteAsync(frame, "СТОП", CancellationToken.None).ConfigureAwait(false);
        }
    }

    public async ValueTask DisposeAsync()
    {
        await DisconnectAsync().ConfigureAwait(false);
        _writeLock.Dispose();
    }

    internal int GetMotorPower(string id)
    {
        lock (_stateLock)
        {
            return _desired.GetMotor(id);
        }
    }

    internal void SetMotorPower(string id, int percent)
    {
        lock (_stateLock)
        {
            var limited = Math.Clamp(percent, -_maxPowerPercent, _maxPowerPercent);
            if (_desired.GetMotor(id) != limited)
            {
                _desired.SetMotor(id, limited);
                _dirty = true;
            }
        }
    }

    internal RobotColor GetLight(string id)
    {
        lock (_stateLock)
        {
            return _desired.GetLight(id);
        }
    }

    internal void SetLight(string id, RobotColor color)
    {
        lock (_stateLock)
        {
            if (_desired.GetLight(id) != color)
            {
                _desired.SetLight(id, color);
                _dirty = true;
            }
        }
    }

    private async Task SendLoopAsync(CancellationToken cancellationToken)
    {
        var timing = _protocol.Timing;
        using var timer = new PeriodicTimer(timing.MinInterval, _time);
        try
        {
            do
            {
                byte[]? frame = null;
                lock (_stateLock)
                {
                    var sinceLast = _time.GetElapsedTime(_lastSentTimestamp);
                    if (_dirty || sinceLast >= timing.ResendInterval)
                    {
                        frame = _protocol.EncodeState(_desired);
                        _dirty = false;
                    }
                }

                if (frame is not null)
                {
                    await WriteAsync(frame, null, cancellationToken).ConfigureAwait(false);
                }
            }
            while (await timer.WaitForNextTickAsync(cancellationToken).ConfigureAwait(false));
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Нормальное завершение цикла.
        }
        catch (InvalidOperationException)
        {
            // Транспорт отключился посреди записи — об этом сообщит OnTransportStateChanged.
        }
    }

    private async Task WriteAsync(byte[] data, string? note, CancellationToken cancellationToken)
    {
        await _writeLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            await _transport.WriteAsync(data, cancellationToken).ConfigureAwait(false);
            _lastSentTimestamp = _time.GetTimestamp();
        }
        finally
        {
            _writeLock.Release();
        }

        ProtocolTrace?.Invoke(this, new ProtocolTraceEventArgs(true, data, note));
    }

    private async Task StopLoopAsync()
    {
        if (_loopCts is null)
        {
            return;
        }

        await _loopCts.CancelAsync().ConfigureAwait(false);
        if (_loopTask is not null)
        {
            await _loopTask.ConfigureAwait(false);
        }

        _loopCts.Dispose();
        _loopCts = null;
        _loopTask = null;
    }

    private void OnDataReceived(object? sender, DataReceivedEventArgs e)
    {
        ProtocolTrace?.Invoke(this, new ProtocolTraceEventArgs(false, e.Data, null));
        var reader = _reader;
        if (reader is null)
        {
            return;
        }

        foreach (var message in reader.Feed(e.Data.Span))
        {
            switch (message)
            {
                case TelemetryMessage telemetry:
                    ApplyTelemetry(telemetry.Telemetry);
                    break;
                case DeviceInfoMessage info:
                    DeviceUid = info.Uid;
                    break;
                case UnknownMessage unknown:
                    ProtocolTrace?.Invoke(this, new ProtocolTraceEventArgs(false, unknown.Raw, "неизвестный кадр"));
                    break;
            }
        }
    }

    private void ApplyTelemetry(RobotTelemetry telemetry)
    {
        if (telemetry.Firmware is not null)
        {
            Firmware = telemetry.Firmware;
        }

        foreach (var component in _components)
        {
            component.UpdateAvailability(Firmware);
            switch (component)
            {
                case DistanceComponent distance:
                    distance.Update(telemetry);
                    break;
                case ImuComponent imu:
                    imu.Update(telemetry);
                    break;
                case BatteryComponent battery:
                    battery.Update(telemetry);
                    break;
            }
        }

        LastTelemetry = telemetry;
        TelemetryReceived?.Invoke(this, new TelemetryEventArgs(telemetry));
    }

    private void OnTransportStateChanged(object? sender, TransportStateChangedEventArgs e)
    {
        if (e.State is TransportState.Disconnected or TransportState.Faulted && !_userDisconnect && State == RobotConnectionState.Connected)
        {
            _loopCts?.Cancel();
            SetState(RobotConnectionState.Lost, e.Reason ?? "Связь потеряна");
        }
    }

    private void SetState(RobotConnectionState state, string? reason)
    {
        State = state;
        StateChanged?.Invoke(this, new RobotStateChangedEventArgs(state, reason));
    }
}
