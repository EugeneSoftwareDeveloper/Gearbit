using System.Text.Json.Nodes;
using Gearbit.Client;
using Gearbit.Hub;
using Microsoft.AspNetCore.Builder;

namespace Gearbit.Tests;

/// <summary>Gearbit.Client — как его видит своя консольная программа на C#: хаб с эмулятором, робот по WebSocket.</summary>
public sealed class ClientTests : IAsyncLifetime
{
    private WebApplication _app = null!;
    private RpcClient _tab = null!;
    private int _port;

    private string Url => $"ws://localhost:{_port}/ws";

    public async Task InitializeAsync()
    {
        _port = TestHub.FreePort();
        _app = GearbitHub.Build([$"--Hub:Port={_port}", "--Logging:LogLevel:Default=Warning"]);
        await _app.StartAsync();
        _tab = await RpcClient.ConnectAsync(_port);
        await _tab.CallAsync("hub.hello", new JsonObject { ["name"] = "Вкладка" });
        await _tab.CallAsync("robot.connect", new JsonObject { ["id"] = "emulator:superbot" });
    }

    public async Task DisposeAsync()
    {
        await _tab.DisposeAsync();
        await _app.StopAsync();
        await _app.DisposeAsync();
    }

    [Fact]
    public async Task Robot_drives_and_dispose_stops_it()
    {
        await Task.Run(async () =>
        {
            using var robot = new Robot(Url, "C#: тест");
            Assert.True(robot.Connected);
            robot.Forward(50);
            await WaitForMotorAsync();
            Assert.Equal("C#: тест", (string?)(await _tab.CallAsync("control.get"))["clientName"]);
        });

        // После Dispose моторы в 0, управление свободно.
        var telemetry = await _tab.CallAsync("robot.telemetry");
        Assert.Equal(0, (int)telemetry["motors"]!["M2"]!);
        Assert.Null((await _tab.CallAsync("control.get"))["clientId"]?.GetValue<string>());
    }

    [Fact]
    public async Task Robot_reads_sensors_and_sets_lights()
    {
        await Task.Run(() =>
        {
            using var robot = new Robot(Url, "C#: датчики");
            robot.Forward(40);
            Assert.InRange(robot.Distance("front"), 0, Robot.DistanceMax);
            Assert.InRange(robot.Distance("впереди"), 0, Robot.DistanceMax);
            robot.Light("all", "зелёный");
            var error = Assert.Throws<GearbitException>(() => robot.Light("all", "розовый"));
            Assert.Contains("Не знаю цвет", error.Message, StringComparison.Ordinal);
            var sensor = Assert.Throws<GearbitException>(() => robot.Distance("в небе"));
            Assert.Contains("нет датчика", sensor.Message, StringComparison.Ordinal);
            robot.Stop();
        });

        var lights = (await _tab.CallAsync("robot.telemetry"))["lights"]!.AsObject();
        Assert.All(lights, l => Assert.Equal("green", (string?)l.Value));
    }

    [Fact]
    public async Task Robot_sees_black_line_with_sensor_looking_down()
    {
        await _tab.CallAsync("emulator.setScene", new JsonObject { ["scene"] = "line" });
        await _tab.CallAsync("emulator.setSensorAngles", new JsonObject { ["down"] = new JsonObject { ["D1"] = 0, ["D2"] = 2.5 } });

        await Task.Run(() =>
        {
            using var robot = new Robot(Url, "C#: линия");
            // Мест «вниз» в сборке нет (front, right), а настройки вкладки этому процессу не переданы.
            var error = Assert.Throws<GearbitException>(() => robot.OnLine());
            Assert.Contains("Вниз", error.Message, StringComparison.Ordinal);

            // Старт сцены «линия»: D1 над линией, D2 на 2,5 см правее — над белым листом.
            // Ждём свежую телеметрию: до перестановки D2 смотрел вправо, в далёкую стену (тоже 6).
            Assert.True(SpinWait.SpinUntil(() => robot.Distance("D2") == 0, TimeSpan.FromSeconds(3)));
            Assert.True(robot.OnLine("D1"));
            Assert.False(robot.OnLine("D2"));
        });
    }

    [Fact]
    public async Task Stop_button_interrupts_wait()
    {
        using var robot = new Robot(Url, "C#: ждёт");
        var waiting = Task.Run(() =>
        {
            robot.Forward(30);
            robot.Wait(10);
        });
        await WaitForMotorAsync();

        await _tab.CallAsync("robot.stop");

        var stopped = await Assert.ThrowsAsync<ProgramStoppedException>(() => waiting.WaitAsync(TimeSpan.FromSeconds(5)));
        Assert.Contains("СТОП", stopped.Message, StringComparison.Ordinal);
        Assert.Throws<ProgramStoppedException>(() => robot.Forward(30));
    }

    [Fact]
    public void Missing_hub_gives_a_clear_error()
    {
        using var robot = new Robot($"ws://localhost:{TestHub.FreePort()}/ws");

        var error = Assert.Throws<GearbitException>(() => robot.Forward(50));

        Assert.Contains("Запустите Gearbit", error.Message, StringComparison.Ordinal);
    }

    private async Task WaitForMotorAsync()
    {
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(5);
        while (DateTime.UtcNow < deadline)
        {
            if ((int)(await _tab.CallAsync("robot.telemetry"))["motors"]!["M2"]! != 0)
            {
                return;
            }

            await Task.Delay(20);
        }

        Assert.Fail("Робот не поехал.");
    }
}
