using BotStudio.Core.Components;
using BotStudio.Core.Protocol;
using BotStudio.Protocols.Tudao;

namespace BotStudio.Tests;

/// <summary>Эталонные кадры — из docs/PROTOCOL-SUPERBOT.md и docs/STAGE0-CHECKLIST.md.</summary>
public class TudaoProtocolTests
{
    private static TudaoProtocol Protocol => (TudaoProtocol)new TudaoProtocolFactory().Create(TestData.SuperBot);

    [Fact]
    public void Options_are_read_from_descriptor()
    {
        var options = Protocol.Options;
        Assert.Equal(TestData.Hex("55AA112064796F7A574F50663035326757565034"), options.Auth);
        Assert.Equal(TestData.Hex("FFFE0104FDFC"), options.Handshake);
        Assert.Equal(new[] { "M1", "M2", "M3" }, options.MotorSlots);
        Assert.Equal(-10, options.DeviceMin);
        Assert.Equal(10, options.DeviceMax);
        Assert.Equal((byte)10, options.LightCodes[RobotColor.White]);
        Assert.Equal(2, options.TelemetryVariants.Count);
        Assert.Equal(90, options.TelemetryVariants[1].ImuOffset);
    }

    [Theory]
    [InlineData(0, 0, 0, "FFFE09010200000000000000FDFC")]
    [InlineData(100, 0, 0, "FFFE0901020A000000000000FDFC")]
    [InlineData(-100, 0, 0, "FFFE090102F6000000000000FDFC")]
    [InlineData(0, 100, 0, "FFFE090102000A0000000000FDFC")]
    [InlineData(0, 0, 100, "FFFE09010200000A00000000FDFC")]
    [InlineData(50, -50, 0, "FFFE09010205FB0000000000FDFC")]
    public void Encodes_motor_state(int m1, int m2, int m3, string expected)
    {
        var state = new RobotOutputState();
        state.SetMotor("M1", m1);
        state.SetMotor("M2", m2);
        state.SetMotor("M3", m3);

        Assert.Equal(expected, Convert.ToHexString(Protocol.EncodeState(state)));
    }

    [Fact]
    public void Encodes_lights()
    {
        var state = new RobotOutputState();
        state.SetLight("L1", RobotColor.Red);
        state.SetLight("L2", RobotColor.Red);
        state.SetLight("L3", RobotColor.Red);
        state.SetLight("L4", RobotColor.Red);
        Assert.Equal("FFFE09010200000001010101FDFC", Convert.ToHexString(Protocol.EncodeState(state)));

        state.SetLight("L2", RobotColor.Off);
        state.SetLight("L3", RobotColor.Off);
        state.SetLight("L4", RobotColor.Off);
        Assert.Equal("FFFE09010200000001000000FDFC", Convert.ToHexString(Protocol.EncodeState(state)));
    }

    [Theory]
    [InlineData(0, 0)]
    [InlineData(5, 1)]
    [InlineData(4, 0)]
    [InlineData(60, 6)]
    [InlineData(-55, -6)]
    [InlineData(150, 10)]
    [InlineData(-150, -10)]
    public void Scales_percent_to_device_units(int percent, int device) => Assert.Equal(device, Protocol.ScalePower(percent));

    [Fact]
    public void Connect_sequence_is_auth_then_uid_request()
    {
        var steps = Protocol.ConnectSequence;
        Assert.Equal(2, steps.Count);
        Assert.Equal("55AA112064796F7A574F50663035326757565034", Convert.ToHexString(steps[0].Data));
        Assert.Equal("FFFE0104FDFC", Convert.ToHexString(steps[1].Data));
    }

    [Fact]
    public void Decodes_v1_telemetry()
    {
        var reader = Protocol.CreateReader();
        //                          FF FE len mode ?  bat ?  D1 D2 FD FC
        var messages = reader.Feed(TestData.Hex("FF FE 06 01 00 64 00 03 FF FD FC"));

        var telemetry = Assert.IsType<TelemetryMessage>(Assert.Single(messages)).Telemetry;
        Assert.Equal("v1", telemetry.Firmware);
        Assert.Equal(1, telemetry.Mode);
        Assert.Equal(100, telemetry.BatteryRaw);
        Assert.Equal(3, telemetry.Distances["D1"]);
        Assert.Null(telemetry.Distances["D2"]);
        Assert.Null(telemetry.Tilt);
    }

    [Fact]
    public void Decodes_v2_telemetry_with_imu()
    {
        var reader = Protocol.CreateReader();
        // 19 байт: D1=[6], D2=[7], imuX=[8], imuY=[9] (смещение +90), acc=[10].
        var frame = TestData.Hex("FF FE 0E 00 00 50 02 06 5A 64 0C 00 00 00 00 00 00 FD FC");
        var telemetry = Assert.IsType<TelemetryMessage>(Assert.Single(reader.Feed(frame))).Telemetry;

        Assert.Equal("v2", telemetry.Firmware);
        Assert.Equal(2, telemetry.Distances["D1"]);
        Assert.Equal(6, telemetry.Distances["D2"]);
        Assert.Equal(new TiltReading(0, 10, 12), telemetry.Tilt);
        Assert.Equal(0x50, telemetry.BatteryRaw);
    }

    [Fact]
    public void Decodes_v2_frame_even_if_third_byte_is_a_type_not_a_length()
    {
        var reader = Protocol.CreateReader();
        var frame = TestData.Hex("FF FE 06 00 00 50 02 06 5A 64 0C 00 00 00 00 00 00 FD FC");
        var telemetry = Assert.IsType<TelemetryMessage>(Assert.Single(reader.Feed(frame))).Telemetry;
        Assert.Equal("v2", telemetry.Firmware);
    }

    [Fact]
    public void Clamps_distance_to_max_level()
    {
        var reader = Protocol.CreateReader();
        var telemetry = Assert.IsType<TelemetryMessage>(Assert.Single(reader.Feed(TestData.Hex("FF FE 06 01 00 64 00 09 02 FD FC")))).Telemetry;
        Assert.Equal(6, telemetry.Distances["D1"]);
    }

    [Fact]
    public void Decodes_uid_reply()
    {
        var reader = Protocol.CreateReader();
        var message = Assert.Single(reader.Feed(TestData.Hex("FF FE 08 01 02 03 04 05 06 07 08 FD FC")));
        Assert.Equal("0102030405060708", Assert.IsType<DeviceInfoMessage>(message).Uid);
    }

    [Fact]
    public void Reassembles_frames_split_across_notifications_and_skips_junk()
    {
        var reader = Protocol.CreateReader();
        var stream = TestData.Hex("00 11 FF FE 06 01 00 64 00 03 02 FD FC FF FE 08 01 02 03 04 05 06 07 08 FD FC");
        var messages = new List<ProtocolMessage>();
        foreach (var chunk in stream.Chunk(4))
        {
            messages.AddRange(reader.Feed(chunk));
        }

        Assert.Collection(
            messages,
            m => Assert.Equal("0011", Convert.ToHexString(Assert.IsType<UnknownMessage>(m).Raw)),
            m => Assert.Equal(3, Assert.IsType<TelemetryMessage>(m).Telemetry.Distances["D1"]),
            m => Assert.Equal("0102030405060708", Assert.IsType<DeviceInfoMessage>(m).Uid));
    }

    [Fact]
    public void Device_codec_round_trips_host_commands()
    {
        var codec = new TudaoDeviceCodec(Protocol.Options);
        var state = new RobotOutputState();
        state.SetMotor("M1", 100);
        state.SetMotor("M2", -50);
        state.SetLight("L4", RobotColor.Green);

        var stream = Protocol.ConnectSequence.SelectMany(s => s.Data).Concat(Protocol.EncodeState(state)).ToArray();
        var commands = stream.Chunk(20).SelectMany(c => codec.Feed(c)).ToList();

        Assert.Collection(
            commands,
            c => Assert.IsType<TudaoAuthCommand>(c),
            c => Assert.IsType<TudaoUidRequest>(c),
            c =>
            {
                var cmd = Assert.IsType<TudaoStateCommand>(c);
                Assert.Equal(new[] { 10, -5, 0 }, cmd.Motors);
                Assert.Equal(new byte[] { 0, 0, 0, 4 }, cmd.Lights);
            });
    }

    [Fact]
    public void Device_codec_builds_telemetry_the_reader_understands()
    {
        var codec = new TudaoDeviceCodec(Protocol.Options);
        var frame = codec.EncodeTelemetry("v2", new Dictionary<string, int?> { ["D1"] = 1, ["D2"] = 5, ["imuX"] = -15, ["imuY"] = 4, ["battery"] = 90 });
        Assert.Equal(19, frame.Length);

        var telemetry = Assert.IsType<TelemetryMessage>(Assert.Single(Protocol.CreateReader().Feed(frame))).Telemetry;
        Assert.Equal(1, telemetry.Distances["D1"]);
        Assert.Equal(5, telemetry.Distances["D2"]);
        Assert.Equal(-15, telemetry.Tilt!.Value.X);
        Assert.Equal(4, telemetry.Tilt!.Value.Y);
        Assert.Equal(90, telemetry.BatteryRaw);
    }
}
