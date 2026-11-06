using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json.Nodes;
using Gearbit.Hub;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

namespace Gearbit.Tests;

/// <summary>Хаб целиком: настоящий Kestrel, WebSocket, JSON-RPC, эмулятор вместо робота.</summary>
public sealed class HubTests : IAsyncLifetime
{
    private WebApplication _app = null!;
    private int _port;

    public async Task InitializeAsync()
    {
        _port = TestHub.FreePort();
        _app = GearbitHub.Build([$"--Hub:Port={_port}", "--Hub:RemoteWatchdogMs=300", "--Hub:ServiceWatchdogMs=1500", "--Logging:LogLevel:Default=Warning"]);
        await _app.StartAsync();
    }

    public async Task DisposeAsync()
    {
        await _app.StopAsync();
        await _app.DisposeAsync();
    }

    [Fact]
    public async Task Hello_returns_version_and_client_id()
    {
        await using var rpc = await RpcClient.ConnectAsync(_port);
        var hello = await rpc.CallAsync("hub.hello", new JsonObject { ["name"] = "тест" });

        Assert.Equal("Gearbit", (string?)hello["hub"]);
        Assert.False(string.IsNullOrEmpty((string?)hello["clientId"]));
        Assert.Contains("emulator", hello["transports"]!.AsArray().Select(t => (string?)t));
    }

    [Fact]
    public async Task Drives_the_emulator_and_stops()
    {
        await using var rpc = await RpcClient.ConnectAsync(_port);
        await rpc.CallAsync("hub.hello", new JsonObject { ["name"] = "пульт" });

        var robot = await rpc.CallAsync("robot.connect", new JsonObject { ["id"] = "emulator:superbot" });
        Assert.Equal("connected", (string?)robot["state"]);
        Assert.Equal("superbot-car", (string?)robot["profileId"]);
        Assert.Contains(robot["components"]!.AsArray(), c => (string?)c!["id"] == "D1" && c["aliases"]!.AsArray().Any(a => (string?)a == "front"));

        await rpc.CallAsync("drive.arcade", new JsonObject { ["throttle"] = 100, ["turn"] = 0 });
        var telemetry = await rpc.CallAsync("robot.telemetry");
        Assert.Equal(-60, (int)telemetry["motors"]!["M1"]!);  // лимит машинки; левый мотор зеркальный
        Assert.Equal(60, (int)telemetry["motors"]!["M2"]!);

        await rpc.CallAsync("robot.stop");
        telemetry = await rpc.CallAsync("robot.telemetry");
        Assert.Equal(0, (int)telemetry["motors"]!["M1"]!);

        await rpc.CallAsync("robot.disconnect");
    }

    [Fact]
    public async Task Watchdog_stops_robot_when_remote_goes_silent()
    {
        await using var rpc = await RpcClient.ConnectAsync(_port);
        await rpc.CallAsync("robot.connect", new JsonObject { ["id"] = "emulator:superbot" });
        await rpc.CallAsync("drive.tank", new JsonObject { ["left"] = 50, ["right"] = 50 });

        var safety = await rpc.WaitNotificationAsync("safety.event", TimeSpan.FromSeconds(3));
        Assert.Equal("watchdog", (string?)safety["reason"]);

        var telemetry = await rpc.CallAsync("robot.telemetry");
        Assert.Equal(0, (int)telemetry["motors"]!["M1"]!);
        await rpc.CallAsync("robot.disconnect");
    }

    [Fact]
    public async Task Second_client_cannot_drive_while_first_one_controls()
    {
        await using var first = await RpcClient.ConnectAsync(_port);
        await using var second = await RpcClient.ConnectAsync(_port);
        await first.CallAsync("hub.hello", new JsonObject { ["name"] = "Программа" });
        await first.CallAsync("robot.connect", new JsonObject { ["id"] = "emulator:superbot" });
        await first.CallAsync("drive.tank", new JsonObject { ["left"] = 10, ["right"] = 10, ["source"] = "program" });

        var error = await Assert.ThrowsAsync<RpcError>(() => second.CallAsync("drive.tank", new JsonObject { ["left"] = 10, ["right"] = 10 }));
        Assert.Equal(HubErrors.ControlBusy, error.Code);

        // СТОП разрешён всем.
        await second.CallAsync("robot.stop");
        await first.CallAsync("robot.disconnect");
    }

    /// <summary>Кадр состояния с M1 = 0x0A (в эмуляторе это предел устройства).</summary>
    private const string MotorFrame = "FF FE 09 01 02 0A 00 00 00 00 00 00 FD FC";

    [Fact]
    public async Task Service_mode_sends_raw_frames_and_blocks_normal_control()
    {
        await using var rpc = await RpcClient.ConnectAsync(_port);
        await rpc.CallAsync("hub.hello", new JsonObject { ["name"] = "замеры" });
        await rpc.CallAsync("robot.connect", new JsonObject { ["id"] = "emulator:superbot" });

        await rpc.CallAsync("service.begin");
        Assert.True((bool)(await rpc.CallAsync("robot.info"))["serviceMode"]!);

        Assert.Equal(14, (int)await rpc.CallAsync("service.send", new JsonObject { ["hex"] = MotorFrame }));
        await WaitUntilAsync(async () => await EmulatorMotor(rpc) == 10);

        // Цикл отправки молчит: желаемое состояние (моторы в 0) не перезаписывает кадр, отправленный вручную.
        await Task.Delay(800);
        Assert.Equal(10, await EmulatorMotor(rpc));

        var error = await Assert.ThrowsAsync<RpcError>(() => rpc.CallAsync("drive.tank", new JsonObject { ["left"] = 10, ["right"] = 10 }));
        Assert.Equal(HubErrors.ControlBusy, error.Code);
        error = await Assert.ThrowsAsync<RpcError>(() => rpc.CallAsync("light.setColor", new JsonObject { ["id"] = "L1", ["color"] = "red" }));
        Assert.Equal(HubErrors.ControlBusy, error.Code);

        Assert.True((bool)await rpc.CallAsync("service.end"));
        await WaitUntilAsync(async () => await EmulatorMotor(rpc) == 0);
        Assert.False((bool)(await rpc.CallAsync("robot.info"))["serviceMode"]!);

        await rpc.CallAsync("drive.tank", new JsonObject { ["left"] = 10, ["right"] = 10 });
        await rpc.CallAsync("robot.disconnect");
    }

    [Fact]
    public async Task Stop_works_in_service_mode()
    {
        await using var rpc = await RpcClient.ConnectAsync(_port);
        await rpc.CallAsync("robot.connect", new JsonObject { ["id"] = "emulator:superbot" });
        await rpc.CallAsync("service.begin");
        await rpc.CallAsync("service.send", new JsonObject { ["hex"] = MotorFrame });
        await WaitUntilAsync(async () => await EmulatorMotor(rpc) == 10);

        await using var other = await RpcClient.ConnectAsync(_port);
        await other.CallAsync("robot.stop");

        await WaitUntilAsync(async () => await EmulatorMotor(rpc) == 0);
        await rpc.CallAsync("robot.disconnect");
    }

    [Fact]
    public async Task Service_mode_ends_and_stops_motors_when_its_client_leaves()
    {
        await using var observer = await RpcClient.ConnectAsync(_port);
        var service = await RpcClient.ConnectAsync(_port);
        await service.CallAsync("hub.hello", new JsonObject { ["name"] = "замеры" });
        await service.CallAsync("robot.connect", new JsonObject { ["id"] = "emulator:superbot" });
        await service.CallAsync("service.begin");
        await service.CallAsync("service.send", new JsonObject { ["hex"] = MotorFrame });
        await WaitUntilAsync(async () => await EmulatorMotor(observer) == 10);

        await service.DisposeAsync();

        await WaitUntilAsync(async () => await EmulatorMotor(observer) == 0);
        await WaitUntilAsync(async () => !(bool)(await observer.CallAsync("robot.info"))["serviceMode"]!);
        await observer.CallAsync("drive.tank", new JsonObject { ["left"] = 10, ["right"] = 10 });
        await observer.CallAsync("robot.disconnect");
    }

    [Fact]
    public async Task Service_watchdog_stops_motors_after_silence()
    {
        await using var rpc = await RpcClient.ConnectAsync(_port);
        await rpc.CallAsync("robot.connect", new JsonObject { ["id"] = "emulator:superbot" });
        await rpc.CallAsync("service.begin");
        await rpc.CallAsync("service.send", new JsonObject { ["hex"] = MotorFrame });
        await WaitUntilAsync(async () => await EmulatorMotor(rpc) == 10);

        var safety = await rpc.WaitNotificationAsync("safety.event", TimeSpan.FromSeconds(5));
        Assert.Equal("watchdog", (string?)safety["reason"]);
        await WaitUntilAsync(async () => await EmulatorMotor(rpc) == 0);

        // Режим замеров при этом не заканчивается: можно слать следующий кадр.
        Assert.True((bool)(await rpc.CallAsync("robot.info"))["serviceMode"]!);
        await rpc.CallAsync("robot.disconnect");
    }

    [Fact]
    public async Task Service_send_needs_service_mode_valid_hex_and_the_owner()
    {
        await using var rpc = await RpcClient.ConnectAsync(_port);
        await using var other = await RpcClient.ConnectAsync(_port);
        await rpc.CallAsync("hub.hello", new JsonObject { ["name"] = "замеры" });
        await rpc.CallAsync("robot.connect", new JsonObject { ["id"] = "emulator:superbot" });

        var error = await Assert.ThrowsAsync<RpcError>(() => rpc.CallAsync("service.send", new JsonObject { ["hex"] = "FFFE0104FDFC" }));
        Assert.Equal(HubErrors.NotSupported, error.Code);

        await rpc.CallAsync("service.begin");
        foreach (var bad in new[] { "FFF", "ZZ", "", new string('0', (ServiceMode.MaxFrameBytes + 1) * 2) })
        {
            error = await Assert.ThrowsAsync<RpcError>(() => rpc.CallAsync("service.send", new JsonObject { ["hex"] = bad }));
            Assert.Equal(HubErrors.InvalidParams, error.Code);
        }

        error = await Assert.ThrowsAsync<RpcError>(() => other.CallAsync("service.begin"));
        Assert.Equal(HubErrors.ControlBusy, error.Code);
        error = await Assert.ThrowsAsync<RpcError>(() => other.CallAsync("service.send", new JsonObject { ["hex"] = MotorFrame }));
        Assert.Equal(HubErrors.ControlBusy, error.Code);

        // Закончить замеры может любой: это безопасно, как СТОП.
        Assert.True((bool)await other.CallAsync("service.end"));
        Assert.False((bool)await other.CallAsync("service.end"));
        await rpc.CallAsync("robot.disconnect");
    }

    private static async Task<int> EmulatorMotor(RpcClient rpc) => (int)(await rpc.CallAsync("emulator.state"))["motors"]![0]!;

    private static async Task WaitUntilAsync(Func<Task<bool>> condition)
    {
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (!await condition())
        {
            if (DateTime.UtcNow > deadline)
            {
                throw new TimeoutException("Условие не выполнилось за 5 с.");
            }

            await Task.Delay(20);
        }
    }

    [Fact]
    public async Task Rejects_websocket_from_foreign_origin()
    {
        using var socket = new ClientWebSocket();
        socket.Options.SetRequestHeader("Origin", "https://evil.example");
        await Assert.ThrowsAnyAsync<WebSocketException>(() => socket.ConnectAsync(new Uri($"ws://localhost:{_port}/ws"), CancellationToken.None));
    }

    [Fact]
    public async Task Unknown_method_returns_method_not_found()
    {
        await using var rpc = await RpcClient.ConnectAsync(_port);
        var error = await Assert.ThrowsAsync<RpcError>(() => rpc.CallAsync("robot.fly"));
        Assert.Equal(HubErrors.MethodNotFound, error.Code);
    }
}
