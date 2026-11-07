using Gearbit.Core.Components;
using Gearbit.Core.Robots;
using Gearbit.Core.Transport;
using Gearbit.Protocols.Tudao;

namespace Gearbit.Tests;

public class ProtocolRobotTests
{
    [Fact]
    public async Task Connect_sends_auth_and_uid_request_then_a_stopped_state()
    {
        var (robot, device) = Create();
        await robot.ConnectAsync(CancellationToken.None);

        await WaitUntil(() => device.States.Count > 0);
        Assert.IsType<TudaoAuthCommand>(device.Commands[0]);
        Assert.IsType<TudaoUidRequest>(device.Commands[1]);
        Assert.Equal(new[] { 0, 0, 0 }, device.States[0].Motors);
        Assert.Equal("0102030405060708", robot.DeviceUid);
        Assert.Equal(RobotConnectionState.Connected, robot.State);

        await robot.DisposeAsync();
    }

    [Fact]
    public async Task Drive_respects_inversion_and_kid_limit()
    {
        var (robot, device) = Create();
        await robot.ConnectAsync(CancellationToken.None);

        // Профиль машинки: левый мотор (M1) инвертирован, лимит 60 %.
        robot.Drive!.Tank(100, 100);

        await WaitUntil(() => device.States.Count > 0 && device.States[^1].Motors[0] != 0);
        Assert.Equal(new[] { -6, 6, 0 }, device.States[^1].Motors);
        Assert.Equal(-60, robot.Find<IMotor>("left_wheel")!.Power);

        await robot.DisposeAsync();
        Assert.Equal(new[] { 0, 0, 0 }, device.States[^1].Motors);
    }

    [Fact]
    public async Task Telemetry_updates_components_and_enables_imu_on_v2()
    {
        var (robot, device) = Create();
        await robot.ConnectAsync(CancellationToken.None);

        var imu = robot.Find<IImu>("IMU")!;
        Assert.False(imu.Available);

        device.SendTelemetry("v2", new Dictionary<string, int?> { ["D1"] = 2, ["D2"] = 5, ["imuX"] = 3, ["imuY"] = -4, ["battery"] = 77 });

        Assert.Equal("v2", robot.Firmware);
        Assert.True(imu.Available);
        Assert.Equal(new TiltReading(3, -4, 0), imu.Tilt);
        Assert.Equal(2, robot.Find<IDistanceSensor>("front")!.Level);
        Assert.Equal(5, robot.Find<IDistanceSensor>("D2")!.Level);
        Assert.Equal(77, robot.Find<IBattery>("BAT")!.Raw);

        await robot.DisposeAsync();
    }

    [Fact]
    public async Task Stop_all_sends_a_zero_frame_immediately()
    {
        var (robot, device) = Create();
        await robot.ConnectAsync(CancellationToken.None);
        robot.Find<IMotor>("M3")!.SetPower(40);
        await WaitUntil(() => device.States.Count > 0 && device.States[^1].Motors[2] != 0);

        await robot.StopAllAsync();

        Assert.Equal(new[] { 0, 0, 0 }, device.States[^1].Motors);
        await robot.DisposeAsync();
    }

    [Fact]
    public async Task Manual_mode_pauses_the_send_loop_until_exit()
    {
        var (robot, device) = Create();
        await robot.ConnectAsync(CancellationToken.None);
        robot.Find<IMotor>("M3")!.SetPower(40);
        await WaitUntil(() => device.States.Count > 0 && device.States[^1].Motors[2] != 0);

        // Вход в ручной режим останавливает моторы.
        await robot.EnterManualModeAsync();
        Assert.True(robot.ManualMode);
        Assert.Equal(new[] { 0, 0, 0 }, device.States[^1].Motors);

        // Сырой кадр уходит как есть, без предела мощности: 0x14 = 20 при пределе устройства 10 и машинки 60 %.
        await robot.WriteRawAsync([0xFF, 0xFE, 0x09, 0x01, 0x02, 0x14, 0, 0, 0, 0, 0, 0, 0xFD, 0xFC], CancellationToken.None);
        Assert.Equal(new[] { 20, 0, 0 }, device.States[^1].Motors);

        // Цикл не повторяет желаемое состояние (раз в 500 мс он прислал бы нули).
        var count = device.States.Count;
        await Task.Delay(800);
        Assert.Equal(count, device.States.Count);

        // СТОП работает и в ручном режиме.
        await robot.StopAllAsync();
        Assert.Equal(new[] { 0, 0, 0 }, device.States[^1].Motors);

        await robot.ExitManualModeAsync();
        Assert.False(robot.ManualMode);
        var error = await Assert.ThrowsAsync<RobotException>(() => robot.WriteRawAsync([0xFF, 0xFE, 0x01, 0x04, 0xFD, 0xFC], CancellationToken.None));
        Assert.Equal(RobotErrorCode.ManualModeRequired, error.Code);

        // Цикл снова работает.
        robot.Find<IMotor>("M1")!.SetPower(50);
        await WaitUntil(() => device.States[^1].Motors[0] != 0);
        await robot.DisposeAsync();
    }

    [Fact]
    public async Task Lost_transport_marks_robot_as_lost()
    {
        var (robot, transport, _) = CreateWithTransport();
        await robot.ConnectAsync(CancellationToken.None);

        await transport.DisconnectAsync();

        Assert.Equal(RobotConnectionState.Lost, robot.State);
        await robot.DisposeAsync();
    }

    private static async Task WaitUntil(Func<bool> condition)
    {
        var deadline = DateTime.UtcNow.AddSeconds(3);
        while (!condition())
        {
            if (DateTime.UtcNow > deadline)
            {
                throw new TimeoutException("Условие не выполнилось за 3 с.");
            }

            await Task.Delay(10);
        }
    }

    private static (ProtocolRobot Robot, FakeTudaoDevice Device) Create()
    {
        var (robot, _, device) = CreateWithTransport();
        return (robot, device);
    }

    private static (ProtocolRobot Robot, LoopbackTransport Transport, FakeTudaoDevice Device) CreateWithTransport()
    {
        var protocol = (TudaoProtocol)new TudaoProtocolFactory().Create(TestData.SuperBot);
        var device = new FakeTudaoDevice(protocol.Options);
        var transport = new LoopbackTransport(device);
        var robot = new ProtocolRobot("test", "SuperBot", TestData.SuperBot, TestData.Car, transport, protocol);
        return (robot, transport, device);
    }

    /// <summary>Минимальный двойник прошивки: запоминает команды и отвечает на запрос UID.</summary>
    private sealed class FakeTudaoDevice(TudaoOptions options) : IVirtualDevice
    {
        private readonly TudaoDeviceCodec _codec = new(options);
        private readonly Lock _lock = new();
        private readonly List<TudaoHostCommand> _commands = [];

        public event EventHandler<DataReceivedEventArgs>? SendToHost;

        public List<TudaoHostCommand> Commands
        {
            get
            {
                lock (_lock)
                {
                    return [.. _commands];
                }
            }
        }

        public List<TudaoStateCommand> States => Commands.OfType<TudaoStateCommand>().ToList();

        public void PowerOn()
        {
        }

        public void PowerOff()
        {
        }

        public void ReceiveFromHost(ReadOnlySpan<byte> data)
        {
            foreach (var command in _codec.Feed(data))
            {
                lock (_lock)
                {
                    _commands.Add(command);
                }

                if (command is TudaoUidRequest)
                {
                    SendToHost?.Invoke(this, new DataReceivedEventArgs(TudaoDeviceCodec.EncodeUid([1, 2, 3, 4, 5, 6, 7, 8])));
                }
            }
        }

        public void SendTelemetry(string firmware, Dictionary<string, int?> values) =>
            SendToHost?.Invoke(this, new DataReceivedEventArgs(_codec.EncodeTelemetry(firmware, values)));
    }
}
