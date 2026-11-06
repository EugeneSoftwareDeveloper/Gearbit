using System.Text.Json.Nodes;
using Gearbit.Hub;
using Microsoft.AspNetCore.Builder;

namespace Gearbit.Tests;

/// <summary>Программы на C#: настоящий Gearbit.ScriptHost (папка csharp рядом с тестами) против хаба с эмулятором.</summary>
public sealed class CSharpProgramTests : IAsyncLifetime
{
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(30);

    private WebApplication _app = null!;
    private int _port;

    public async Task InitializeAsync()
    {
        _port = TestHub.FreePort();
        _app = GearbitHub.Build([$"--Hub:Port={_port}", "--Logging:LogLevel:Default=Warning"]);
        await _app.StartAsync();
    }

    public async Task DisposeAsync()
    {
        await _app.StopAsync();
        await _app.DisposeAsync();
    }

    [Fact]
    public async Task Language_is_available()
    {
        await using var tab = await RpcClient.ConnectAsync(_port);
        var csharp = (await tab.CallAsync("program.languages")).AsArray().Single(l => (string?)l!["id"] == "csharp")!;

        Assert.True((bool)csharp["available"]!, (string?)csharp["problem"]);
        Assert.Equal("C#", (string?)csharp["title"]);
    }

    [Fact]
    public async Task Program_drives_the_emulator_and_stops_at_the_end()
    {
        await using var tab = await ConnectAsync();

        await tab.CallAsync("program.run", new JsonObject
        {
            ["language"] = "csharp",
            ["name"] = "тест",
            ["code"] = """
                Console.WriteLine("старт");
                robot.Forward(50);
                Wait(1.5);
                robot.Say("приехали");
                """,
        });

        await WaitUntilAsync(tab, async () => (int)(await tab.CallAsync("robot.telemetry"))["motors"]!["M2"]! > 0);
        var control = await tab.CallAsync("control.get");
        Assert.Equal("program", (string?)control["kind"]);
        Assert.Equal("C#: тест", (string?)control["clientName"]);

        var exited = await tab.WaitNotificationAsync("program.exited", Wait);
        Assert.Equal("finished", (string?)exited["reason"]);
        Assert.Equal(0, (int)(await tab.CallAsync("robot.telemetry"))["motors"]!["M2"]!);
        Assert.Equal("приехали", (string?)tab.Notifications("program.say").Single()["text"]);
        var text = Output(tab);
        Assert.Contains("старт", text, StringComparison.Ordinal);
        Assert.Contains("робот остановился", text, StringComparison.Ordinal);
        Assert.Null((await tab.CallAsync("control.get"))["clientId"]?.GetValue<string>());
        Assert.DoesNotContain(tab.Notifications("safety.event"), e => (string?)e["reason"] == "clientLeft");
    }

    [Fact]
    public async Task Stop_ends_an_endless_program()
    {
        await using var tab = await ConnectAsync();

        await tab.CallAsync("program.run", new JsonObject
        {
            ["language"] = "csharp",
            ["code"] = """
                while (true)
                {
                    robot.Forward(30);
                    Wait(0.1);
                }
                """,
        });
        await WaitUntilAsync(tab, async () => (int)(await tab.CallAsync("robot.telemetry"))["motors"]!["M2"]! > 0);

        await tab.CallAsync("robot.stop");

        var exited = await tab.WaitNotificationAsync("program.exited", Wait);
        Assert.Equal("stopped", (string?)exited["reason"]);
        Assert.Equal(0, (int)(await tab.CallAsync("robot.telemetry"))["motors"]!["M2"]!);
        await Task.Delay(300);
        Assert.Equal(0, (int)(await tab.CallAsync("robot.telemetry"))["motors"]!["M2"]!);
        Assert.DoesNotContain(tab.Notifications("safety.event"), e => (string?)e["reason"] == "clientLeft");
    }

    [Fact]
    public async Task Compile_error_points_to_the_line()
    {
        await using var tab = await ConnectAsync();

        await tab.CallAsync("program.run", new JsonObject { ["language"] = "csharp", ["code"] = "robot.Stop();\nrobot.forwrd(50);\n" });

        var exited = await tab.WaitNotificationAsync("program.exited", Wait);
        Assert.Equal("error", (string?)exited["reason"]);
        Assert.Equal(2, (int)exited["error"]!["line"]!);
        Assert.Contains("robot.Forward?", (string?)exited["error"]!["message"], StringComparison.Ordinal);
        Assert.Contains("CS1061", Output(tab), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Runtime_error_points_to_the_line()
    {
        await using var tab = await ConnectAsync();

        await tab.CallAsync("program.run", new JsonObject
        {
            ["language"] = "csharp",
            ["code"] = "var zero = 0;\nConsole.WriteLine(\"до\");\nConsole.WriteLine(10 / zero);\n",
        });

        var exited = await tab.WaitNotificationAsync("program.exited", Wait);
        Assert.Equal("error", (string?)exited["reason"]);
        Assert.Equal(3, (int)exited["error"]!["line"]!);
        Assert.Contains("на ноль", (string?)exited["error"]!["message"], StringComparison.Ordinal);
        Assert.Contains("до", Output(tab), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Robot_error_is_reported_in_russian()
    {
        await using var tab = await ConnectAsync();

        await tab.CallAsync("program.run", new JsonObject { ["language"] = "csharp", ["code"] = "robot.Light(\"all\", \"розовый\");\n" });

        var exited = await tab.WaitNotificationAsync("program.exited", Wait);
        Assert.Equal("error", (string?)exited["reason"]);
        Assert.Equal(1, (int)exited["error"]!["line"]!);
        Assert.Contains("Не знаю цвет «розовый»", (string?)exited["error"]!["message"], StringComparison.Ordinal);
    }

    private static string Output(RpcClient tab) => string.Join("\n", tab.Notifications("program.output").Select(o => (string?)o["text"]));

    private async Task<RpcClient> ConnectAsync()
    {
        var tab = await RpcClient.ConnectAsync(_port);
        await tab.CallAsync("hub.hello", new JsonObject { ["name"] = "C#" });
        await tab.CallAsync("robot.connect", new JsonObject { ["id"] = "emulator:superbot" });
        return tab;
    }

    private static async Task WaitUntilAsync(RpcClient tab, Func<Task<bool>> condition)
    {
        var deadline = DateTime.UtcNow + Wait;
        while (DateTime.UtcNow < deadline)
        {
            if (await condition())
            {
                return;
            }

            if (tab.Notifications("program.exited").FirstOrDefault() is { } exited)
            {
                Assert.Fail($"Программа закончилась раньше времени: {exited.ToJsonString()}\n{Output(tab)}");
            }

            await Task.Delay(30);
        }

        Assert.Fail("Условие не выполнилось вовремя.");
    }
}
