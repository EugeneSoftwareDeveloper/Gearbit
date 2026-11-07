using Gearbit.Core.Components;
using Gearbit.Core.Robots;
using Gearbit.Emulator;
using Gearbit.Protocols.Tudao;

namespace Gearbit.Tests;

public class EmulatorTests
{
    private static readonly TudaoOptions Options = TudaoOptions.FromJson(TestData.SuperBot.Protocol);

    [Fact]
    public void Ray_hits_room_wall_and_obstacles()
    {
        var world = new EmulatorWorld(new EmulatorSettings { RoomWidth = 100, RoomHeight = 50, Obstacles = [new Obstacle(60, 0, 10, 50)] });

        Assert.Equal(40, world.CastRay(20, 25, 0), 3);     // до препятствия справа
        Assert.Equal(20, world.CastRay(20, 25, 180), 3);   // до левой стены
        Assert.Equal(25, world.CastRay(20, 25, 90), 3);    // вниз до стены
    }

    [Fact]
    public void Collision_detects_walls_and_obstacles()
    {
        var world = new EmulatorWorld(new EmulatorSettings { RoomWidth = 100, RoomHeight = 50, Obstacles = [new Obstacle(60, 20, 10, 10)] });

        Assert.False(world.Collides(30, 25, 9));
        Assert.True(world.Collides(5, 25, 9));
        Assert.True(world.Collides(55, 25, 9));
    }

    [Fact]
    public async Task Robot_drives_forward_through_the_real_driver()
    {
        var time = new ManualTime();
        var host = new EmulatorHost(new EmulatorSettings { Obstacles = [], StartPose = new Pose(50, 80, 0) }, time);
        var protocol = new TudaoProtocolFactory().Create(TestData.SuperBot);
        var device = (await host.ScanAsync(TimeSpan.Zero, CancellationToken.None))[0];
        var transport = host.Create(device, TestData.SuperBot);
        await using var robot = new ProtocolRobot(device.Id, device.Name, TestData.SuperBot, TestData.Car, transport, protocol, time);

        await RunUntil(time, robot.ConnectAsync(CancellationToken.None));

        robot.Drive!.Tank(100, 100);
        await AdvanceUntil(time, () => host.Current!.GetSnapshot().Motors[0] != 0);
        var start = host.Current!.GetSnapshot().Pose;

        for (var i = 0; i < 50; i++)
        {
            time.Advance(TimeSpan.FromMilliseconds(20));
        }

        var snapshot = host.Current!.GetSnapshot();
        // Лимит машинки 60 % → 6 из 10 → 0,6 × 35 см/с × 1 с ≈ 21 см прямо, без поворота.
        Assert.InRange(snapshot.Pose.X - start.X, 19, 23);
        Assert.InRange(snapshot.Pose.Y, 79.5, 80.5);
        Assert.Equal(new[] { -6, 6, 0 }, snapshot.Motors);  // левый мотор зеркальный
    }

    [Fact]
    public void Telemetry_reports_closer_obstacle_as_smaller_level()
    {
        var time = new ManualTime();
        var world = new EmulatorWorld(new EmulatorSettings { Obstacles = [new Obstacle(70, 0, 10, 160)], StartPose = new Pose(50, 80, 0) });
        using var emulator = new TudaoEmulator(Options, world, time);
        var reader = new TudaoProtocol(Options).CreateReader();
        var received = new List<byte[]>();
        emulator.SendToHost += (_, e) => received.Add(e.Data.ToArray());

        emulator.PowerOn();
        emulator.SendTelemetry();

        var telemetry = Assert.IsType<Core.Protocol.TelemetryMessage>(Assert.Single(reader.Feed(received.Single()))).Telemetry;
        // До препятствия 70 − 50 − 9 (радиус) = 11 см → уровень 2 (по 5 см).
        Assert.Equal(2, telemetry.Distances["D1"]);
        Assert.Equal("v2", telemetry.Firmware);
        Assert.Equal(new TiltReading(0, 0, 10), telemetry.Tilt);
    }

    [Fact]
    public void Tilt_goes_to_telemetry_until_reset()
    {
        var time = new ManualTime();
        using var emulator = new TudaoEmulator(Options, new EmulatorWorld(new EmulatorSettings()), time);
        var reader = new TudaoProtocol(Options).CreateReader();
        var received = new List<byte[]>();
        emulator.SendToHost += (_, e) => received.Add(e.Data.ToArray());
        emulator.PowerOn();

        // Больше 90° гироскоп не показывает.
        Assert.Equal((90, -30), emulator.SetTilt(120, -30));
        emulator.SendTelemetry();
        var telemetry = Assert.IsType<Core.Protocol.TelemetryMessage>(Assert.Single(reader.Feed(received.Single()))).Telemetry;
        Assert.Equal(new TiltReading(90, -30, 10), telemetry.Tilt);
        Assert.Equal((90, -30), (emulator.GetSnapshot().TiltX, emulator.GetSnapshot().TiltY));

        emulator.Reset();
        Assert.Equal((0, 0), (emulator.GetSnapshot().TiltX, emulator.GetSnapshot().TiltY));
    }

    [Fact]
    public void Sensors_can_be_moved_to_another_place()
    {
        var world = new EmulatorWorld(new EmulatorSettings { Obstacles = [new Obstacle(70, 0, 10, 160)], StartPose = new Pose(50, 80, 0) });
        using var emulator = new TudaoEmulator(Options, world, new ManualTime());
        emulator.PowerOn();

        // D2 смотрит вправо (в стену комнаты на 80 см ниже), D1 — вперёд, в препятствие.
        Assert.NotEqual(emulator.GetSnapshot().SensorLevels["D1"], emulator.GetSnapshot().SensorLevels["D2"]);

        var angles = world.SetSensorAngles(new Dictionary<string, double> { ["D2"] = -360, ["D9"] = 45 });

        Assert.Equal(0, angles["D2"]);
        Assert.False(angles.ContainsKey("D9"));
        Assert.Equal(emulator.GetSnapshot().SensorLevels["D1"], emulator.GetSnapshot().SensorLevels["D2"]);
        Assert.Equal(0, emulator.GetSnapshot().SensorAngles["D2"]);
    }

    [Fact]
    public void Stadium_track_goes_around_the_middle_of_the_room()
    {
        var line = LineTrack.Stadium(120, 80, 90, 45, 3);

        Assert.Equal(0, line.DistanceTo(120, 125), 1);   // нижняя прямая
        Assert.Equal(0, line.DistanceTo(120, 35), 1);    // верхняя прямая
        Assert.Equal(0, line.DistanceTo(210, 80), 1);    // правый поворот
        Assert.Equal(0, line.DistanceTo(30, 80), 1);     // левый поворот
        Assert.Equal(45, line.DistanceTo(120, 80), 1);   // середина овала
    }

    [Fact]
    public void Down_sensors_see_black_line_and_white_paper()
    {
        var world = new EmulatorWorld(new EmulatorSettings { Scene = EmulatorScene.Line });
        using var emulator = new TudaoEmulator(Options, world, new ManualTime());
        var reader = new TudaoProtocol(Options).CreateReader();
        var received = new List<byte[]>();
        emulator.SendToHost += (_, e) => received.Add(e.Data.ToArray());
        emulator.PowerOn();

        // Старт на нижней прямой: D1 посередине — над линией, D2 на 2,5 см правее — над белым.
        var mounts = world.SetSensorMounts(null, new Dictionary<string, double> { ["D1"] = 0, ["D2"] = 2.5 });
        emulator.SendTelemetry();

        Assert.Empty(mounts.Angles);
        var telemetry = Assert.IsType<Core.Protocol.TelemetryMessage>(Assert.Single(reader.Feed(received.Single()))).Telemetry;
        Assert.Equal(6, telemetry.Distances["D1"]);
        Assert.Equal(0, telemetry.Distances["D2"]);

        // На краю линии пятно датчика видит и белое, и чёрное: уровень где-то посередине.
        world.SetSensorMounts(null, new Dictionary<string, double> { ["D2"] = 1.5 });
        Assert.Equal(3, emulator.GetSnapshot().SensorLevels["D2"]);
        Assert.False(emulator.GetSnapshot().SensorCm.ContainsKey("D2"));
    }

    [Fact]
    public void Scene_sets_obstacles_start_and_floor()
    {
        var world = new EmulatorWorld(new EmulatorSettings());
        using var emulator = new TudaoEmulator(Options, world, new ManualTime());
        world.SetSensorMounts(null, new Dictionary<string, double> { ["D1"] = 0 });

        Assert.Equal(EmulatorScene.Room, world.Scene);
        Assert.Null(world.Line);
        Assert.Equal(0, emulator.GetSnapshot().SensorLevels["D1"]);   // в комнате пол светлый

        world.SetScene(EmulatorScene.Line);
        emulator.Reset();

        var snapshot = emulator.GetSnapshot();
        Assert.Empty(snapshot.Obstacles);
        Assert.NotNull(snapshot.Line);
        Assert.Equal(EmulatorScene.Line, snapshot.Scene);
        Assert.Equal(world.Settings.LineStartPose, snapshot.Pose);
        Assert.Equal(6, snapshot.SensorLevels["D1"]);

        world.SetScene(EmulatorScene.Room);
        emulator.Reset();
        Assert.Equal(3, emulator.GetSnapshot().Obstacles.Count);
        Assert.Equal(world.Settings.StartPose, emulator.GetSnapshot().Pose);
    }

    [Fact]
    public void Sensor_moves_between_floor_and_sides()
    {
        var world = new EmulatorWorld(new EmulatorSettings());

        var mounts = world.SetSensorMounts(null, new Dictionary<string, double> { ["D2"] = 20, ["D9"] = 0 });
        Assert.Equal(8, mounts.Down["D2"]);                // не дальше края корпуса
        Assert.False(mounts.Angles.ContainsKey("D2"));
        Assert.False(mounts.Down.ContainsKey("D9"));

        mounts = world.SetSensorMounts(new Dictionary<string, double> { ["D2"] = 270 }, null);
        Assert.Equal(270, mounts.Angles["D2"]);
        Assert.Empty(mounts.Down);
    }

    private static async Task RunUntil(ManualTime time, Task task)
    {
        for (var i = 0; i < 1000 && !task.IsCompleted; i++)
        {
            time.Advance(TimeSpan.FromMilliseconds(10));
            await Task.Delay(1);
        }

        await task;
    }

    private static async Task AdvanceUntil(ManualTime time, Func<bool> condition)
    {
        for (var i = 0; i < 1000 && !condition(); i++)
        {
            time.Advance(TimeSpan.FromMilliseconds(10));
            await Task.Delay(1);
        }

        Assert.True(condition());
    }

    /// <summary>Ручное время: таймеры срабатывают только при <see cref="Advance"/>.</summary>
    private sealed class ManualTime : TimeProvider
    {
        private readonly Lock _lock = new();
        private readonly List<ManualTimer> _timers = [];
        private long _ticks;

        public override long TimestampFrequency => TimeSpan.TicksPerSecond;

        public override long GetTimestamp()
        {
            lock (_lock)
            {
                return _ticks;
            }
        }

        public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
        {
            var timer = new ManualTimer(this, callback, state, dueTime, period);
            lock (_lock)
            {
                _timers.Add(timer);
            }

            return timer;
        }

        public void Advance(TimeSpan by)
        {
            long target;
            lock (_lock)
            {
                target = _ticks + by.Ticks;
            }

            while (true)
            {
                ManualTimer? next;
                lock (_lock)
                {
                    next = _timers.Where(t => t.Due is { } d && d <= target).MinBy(t => t.Due);
                    if (next is null)
                    {
                        _ticks = target;
                        return;
                    }

                    _ticks = Math.Max(_ticks, next.Due!.Value);
                    next.Due = next.Period > TimeSpan.Zero ? _ticks + next.Period.Ticks : null;
                }

                next.Fire();
            }
        }

        private sealed class ManualTimer(ManualTime owner, TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period) : ITimer
        {
            public long? Due { get; set; } = dueTime == Timeout.InfiniteTimeSpan ? null : owner.GetTimestamp() + dueTime.Ticks;

            public TimeSpan Period { get; private set; } = period == Timeout.InfiniteTimeSpan ? TimeSpan.Zero : period;

            public void Fire() => callback(state);

            public bool Change(TimeSpan dueTime, TimeSpan period)
            {
                Due = dueTime == Timeout.InfiniteTimeSpan ? null : owner.GetTimestamp() + dueTime.Ticks;
                Period = period == Timeout.InfiniteTimeSpan ? TimeSpan.Zero : period;
                return true;
            }

            public void Dispose()
            {
                Due = null;
                lock (owner._lock)
                {
                    owner._timers.Remove(this);
                }
            }

            public ValueTask DisposeAsync()
            {
                Dispose();
                return ValueTask.CompletedTask;
            }
        }
    }
}
