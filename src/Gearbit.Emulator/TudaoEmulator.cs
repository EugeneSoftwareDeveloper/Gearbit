using Gearbit.Core.Transport;
using Gearbit.Protocols.Tudao;

namespace Gearbit.Emulator;

/// <summary>Состояние эмулятора для отрисовки в интерфейсе.</summary>
public sealed record EmulatorSnapshot(
    bool PoweredOn,
    Pose Pose,
    IReadOnlyList<int> Motors,
    IReadOnlyList<byte> Lights,
    IReadOnlyDictionary<string, double> SensorCm,
    IReadOnlyDictionary<string, int> SensorLevels,
    int Battery,
    bool Bumped,
    long FramesReceived,
    double RoomWidth,
    double RoomHeight,
    double RobotRadius,
    IReadOnlyDictionary<string, double> SensorAngles,
    IReadOnlyList<Obstacle> Obstacles,
    IReadOnlyDictionary<string, double> SensorDown,
    double DownSensorForward,
    EmulatorScene Scene,
    LineTrack? Line,
    int TiltX = 0,
    int TiltY = 0);

/// <summary>
/// Эмулятор прошивки TUDAO: принимает те же байты, что и настоящий робот, двигает машинку
/// в 2D-комнате и шлёт телеметрию в формате v1/v2. Подключается через <see cref="LoopbackTransport"/>.
/// </summary>
public sealed class TudaoEmulator : IVirtualDevice, IDisposable
{
    private readonly TudaoOptions _options;
    private readonly TudaoDeviceCodec _codec;
    private readonly TimeProvider _time;
    private readonly Lock _lock = new();
    private readonly byte[] _uid = [0xE1, 0x00, 0x7A, 0x0D, 0xB0, 0x75, 0x00, 0x01];
    private int[] _motors;
    private byte[] _lights;
    private Pose _pose;
    private int _tiltX;
    private int _tiltY;
    private double _battery = 100;
    private bool _bumped;
    private bool _authorized;
    private long _framesReceived;
    private long _lastFrameTimestamp;
    private ITimer? _physicsTimer;
    private ITimer? _telemetryTimer;
    private long _lastPhysicsTimestamp;

    public TudaoEmulator(TudaoOptions options, EmulatorWorld world, TimeProvider? timeProvider = null)
    {
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(world);
        _options = options;
        _codec = new TudaoDeviceCodec(options);
        _time = timeProvider ?? TimeProvider.System;
        World = world;
        _motors = new int[options.MotorSlots.Count];
        _lights = new byte[options.LightSlots.Count];
        _pose = world.StartPose;
    }

    public event EventHandler<DataReceivedEventArgs>? SendToHost;

    public EmulatorWorld World { get; }

    public bool PoweredOn { get; private set; }

    /// <summary>Требовать авторизацию 55 AA перед командами (как, возможно, делает прошивка).</summary>
    public bool RequireAuth { get; init; }

    public void PowerOn()
    {
        lock (_lock)
        {
            if (PoweredOn)
            {
                return;
            }

            PoweredOn = true;
            _authorized = false;
            _motors = new int[_motors.Length];
            _lastPhysicsTimestamp = _time.GetTimestamp();
            _lastFrameTimestamp = _lastPhysicsTimestamp;
            _physicsTimer = _time.CreateTimer(_ => PhysicsTick(), null, World.Settings.PhysicsStep, World.Settings.PhysicsStep);
            _telemetryTimer = _time.CreateTimer(_ => SendTelemetry(), null, World.Settings.TelemetryInterval, World.Settings.TelemetryInterval);
        }
    }

    public void PowerOff()
    {
        lock (_lock)
        {
            PoweredOn = false;
            _tiltX = _tiltY = 0;
            _physicsTimer?.Dispose();
            _telemetryTimer?.Dispose();
            _physicsTimer = null;
            _telemetryTimer = null;
            _motors = new int[_motors.Length];
        }
    }

    /// <summary>Вернуть машинку в начальную точку текущей сцены.</summary>
    public void Reset()
    {
        lock (_lock)
        {
            _pose = World.StartPose;
            _tiltX = _tiltY = 0;
            _bumped = false;
            _battery = 100;
        }
    }

    /// <summary>
    /// Наклонить машинку (гироскоп), градусы −90..90. Как у Makerzoid: Y больше 0 — вперёд, X больше 0 — вправо.
    /// Комната плоская, поэтому наклон держится, пока его не вернут в 0 (интерфейс — пока держат кнопку).
    /// </summary>
    public (int X, int Y) SetTilt(int x, int y)
    {
        lock (_lock)
        {
            _tiltX = Math.Clamp(x, -90, 90);
            _tiltY = Math.Clamp(y, -90, 90);
            return (_tiltX, _tiltY);
        }
    }

    public void ReceiveFromHost(ReadOnlySpan<byte> data)
    {
        List<byte[]> replies = [];
        lock (_lock)
        {
            if (!PoweredOn)
            {
                return;
            }

            foreach (var command in _codec.Feed(data))
            {
                switch (command)
                {
                    case TudaoAuthCommand auth:
                        _authorized = auth.Data.AsSpan().SequenceEqual(_options.Auth);
                        break;
                    case TudaoUidRequest:
                        replies.Add(TudaoDeviceCodec.EncodeUid(_uid));
                        break;
                    case TudaoStateCommand state when _authorized || !RequireAuth:
                        _framesReceived++;
                        _lastFrameTimestamp = _time.GetTimestamp();
                        _motors = state.Motors.Select(m => Math.Clamp(m, _options.DeviceMin, _options.DeviceMax)).ToArray();
                        _lights = [.. state.Lights];
                        break;
                }
            }
        }

        foreach (var reply in replies)
        {
            SendToHost?.Invoke(this, new DataReceivedEventArgs(reply));
        }
    }

    public EmulatorSnapshot GetSnapshot()
    {
        lock (_lock)
        {
            var settings = World.Settings;
            var angles = World.SensorAngles;
            var cm = new Dictionary<string, double>();
            var levels = new Dictionary<string, int>();
            foreach (var (sensor, angle) in angles)
            {
                var distance = MeasureCm(angle);
                cm[sensor] = Math.Round(distance, 1);
                levels[sensor] = ToLevel(distance);
            }

            var down = World.SensorDown;
            foreach (var (sensor, offset) in down)
            {
                levels[sensor] = MeasureFloor(offset);
            }

            return new EmulatorSnapshot(
                PoweredOn,
                _pose,
                [.. _motors],
                [.. _lights],
                cm,
                levels,
                (int)Math.Round(_battery),
                _bumped,
                _framesReceived,
                settings.RoomWidth,
                settings.RoomHeight,
                settings.RobotRadius,
                angles,
                World.Obstacles,
                down,
                settings.DownSensorForward,
                World.Scene,
                World.Line,
                _tiltX,
                _tiltY);
        }
    }

    /// <summary>Шаг физики: вызывается таймером, в тестах — напрямую.</summary>
    internal void PhysicsTick()
    {
        lock (_lock)
        {
            if (!PoweredOn)
            {
                return;
            }

            var now = _time.GetTimestamp();
            var dt = _time.GetElapsedTime(_lastPhysicsTimestamp, now).TotalSeconds;
            _lastPhysicsTimestamp = now;
            dt = Math.Min(dt, 0.1);

            var settings = World.Settings;
            if (settings.SilenceStop is { } silence && _time.GetElapsedTime(_lastFrameTimestamp, now) > silence)
            {
                _motors = new int[_motors.Length];
            }

            var left = WheelSpeed(settings.LeftMotorSlot, settings.LeftMirrored);
            var right = WheelSpeed(settings.RightMotorSlot, settings.RightMirrored);
            if (left == 0 && right == 0)
            {
                return;
            }

            var speed = (left + right) / 2;
            var turnRate = (left - right) / settings.WheelBase; // рад/с, плюс — по часовой
            var heading = _pose.Heading + (turnRate * dt * 180 / Math.PI);
            var rad = heading * Math.PI / 180;
            var x = _pose.X + (Math.Cos(rad) * speed * dt);
            var y = _pose.Y + (Math.Sin(rad) * speed * dt);

            if (World.Collides(x, y, settings.RobotRadius))
            {
                _bumped = true;
                _pose = _pose with { Heading = Normalize(heading) };
            }
            else
            {
                _bumped = false;
                _pose = new Pose(x, y, Normalize(heading));
            }

            _battery = Math.Max(0, _battery - (dt * 0.02 * (Math.Abs(left) + Math.Abs(right)) / settings.MaxWheelSpeed));
        }
    }

    internal void SendTelemetry()
    {
        byte[] frame;
        lock (_lock)
        {
            if (!PoweredOn)
            {
                return;
            }

            var values = new Dictionary<string, int?>
            {
                ["mode"] = 1,
                ["battery"] = (int)Math.Round(_battery),
                ["imuX"] = _tiltX,
                ["imuY"] = _tiltY,
                ["imuAcc"] = _motors.Any(m => m != 0) ? 12 : 10,
            };

            foreach (var (sensor, angle) in World.SensorAngles)
            {
                values[sensor] = ToLevel(MeasureCm(angle));
            }

            foreach (var (sensor, offset) in World.SensorDown)
            {
                values[sensor] = MeasureFloor(offset);
            }

            frame = _codec.EncodeTelemetry(World.Settings.Firmware, values);
        }

        SendToHost?.Invoke(this, new DataReceivedEventArgs(frame));
    }

    public void Dispose() => PowerOff();

    private double WheelSpeed(int slot, bool mirrored)
    {
        if (slot < 0 || slot >= _motors.Length)
        {
            return 0;
        }

        var limit = _motors[slot] >= 0 ? _options.DeviceMax : -_options.DeviceMin;
        var value = limit == 0 ? 0 : (double)_motors[slot] / limit * World.Settings.MaxWheelSpeed;
        return mirrored ? -value : value;
    }

    private double MeasureCm(double relativeAngle)
    {
        var settings = World.Settings;
        var angle = _pose.Heading + relativeAngle;
        var rad = angle * Math.PI / 180;
        var sx = _pose.X + (Math.Cos(rad) * settings.RobotRadius);
        var sy = _pose.Y + (Math.Sin(rad) * settings.RobotRadius);
        return World.CastRay(sx, sy, angle);
    }

    /// <summary>
    /// Датчик смотрит вниз: белый пол отражает много ИК-света (уровень 0, «близко»),
    /// чёрная линия почти ничего (уровень 6, «далеко»). Это гипотеза до замера на настоящем роботе.
    /// </summary>
    private int MeasureFloor(double offset)
    {
        var settings = World.Settings;
        var rad = _pose.Heading * Math.PI / 180;
        var (sin, cos) = Math.SinCos(rad);
        var x = _pose.X + (cos * settings.DownSensorForward) - (sin * offset);
        var y = _pose.Y + (sin * settings.DownSensorForward) + (cos * offset);
        var darkness = World.FloorDarkness(x, y);
        return _options.DistanceMin + (int)Math.Round(darkness * (_options.DistanceMax - _options.DistanceMin), MidpointRounding.AwayFromZero);
    }

    private int ToLevel(double cm) =>
        Math.Clamp((int)Math.Floor(cm / World.Settings.CentimetersPerLevel), _options.DistanceMin, _options.DistanceMax);

    private static double Normalize(double degrees)
    {
        degrees %= 360;
        return degrees < 0 ? degrees + 360 : degrees;
    }
}
