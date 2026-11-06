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
        Assert.Equal(new[] { 6, -6, 0 }, snapshot.Motors);
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
