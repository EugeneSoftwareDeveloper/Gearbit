using System.Text.Json.Nodes;
using Xunit.Abstractions;
using Gearbit.Hub;
using Microsoft.AspNetCore.Builder;

namespace Gearbit.Tests;

/// <summary>
/// Настоящий Python и пакет gearbit против хаба с эмулятором. Если Python на машине нет,
/// тесты ничего не проверяют (и пишут об этом): сборка на чистой машине не должна падать.
/// </summary>
public sealed class PythonProgramTests(ITestOutputHelper output) : IAsyncLifetime
{
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(20);

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
    public async Task Program_drives_the_emulator_and_stops_at_the_end()
    {
        await using var tab = await ConnectAsync();
        if (tab is null)
        {
            return;
        }

        await tab.CallAsync("program.run", new JsonObject
        {
            ["language"] = "python",
            ["name"] = "тест",
            ["code"] = """
                from gearbit import robot, wait
                print("старт")
                robot.forward(50)
                wait(1.5)
                robot.say("приехали")
                """,
        });

        await WaitUntilAsync(tab, async () => (int)(await tab.CallAsync("robot.telemetry"))["motors"]!["M2"]! > 0);
        var control = await tab.CallAsync("control.get");
        Assert.Equal("program", (string?)control["kind"]);
        Assert.Equal("Python: тест", (string?)control["clientName"]);

        var exited = await tab.WaitNotificationAsync("program.exited", Wait);
        Assert.Equal("finished", (string?)exited["reason"]);
        Assert.Equal(0, (int)(await tab.CallAsync("robot.telemetry"))["motors"]!["M2"]!);
        Assert.Equal("приехали", (string?)tab.Notifications("program.say").Single()["text"]);
        var text = string.Join("\n", tab.Notifications("program.output").Select(o => (string?)o["text"]));
        Assert.Contains("старт", text, StringComparison.Ordinal);
        Assert.Contains("робот остановился", text, StringComparison.Ordinal);
        Assert.Null((await tab.CallAsync("control.get"))["clientId"]?.GetValue<string>());
        Assert.DoesNotContain(tab.Notifications("safety.event"), e => (string?)e["reason"] == "clientLeft");
    }

    [Fact]
    public async Task Stop_ends_an_endless_program()
    {
        await using var tab = await ConnectAsync();
        if (tab is null)
        {
            return;
        }

        await tab.CallAsync("program.run", new JsonObject
        {
            ["language"] = "python",
            ["code"] = """
                from gearbit import robot, wait
                while True:
                    robot.forward(30)
                    wait(0.1)
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
    public async Task Syntax_error_points_to_the_line()
    {
        await using var tab = await ConnectAsync();
        if (tab is null)
        {
            return;
        }

        await tab.CallAsync("program.run", new JsonObject { ["language"] = "python", ["code"] = "x = 1\nif x > 0\n    print(x)\n" });

        var exited = await tab.WaitNotificationAsync("program.exited", Wait);
        Assert.Equal("error", (string?)exited["reason"]);
        Assert.Equal(2, (int)exited["error"]!["line"]!);
        Assert.Contains("двоеточие", (string?)exited["error"]!["message"], StringComparison.Ordinal);
    }

    [Fact]
    public async Task Errors_come_in_the_language_of_the_tab()
    {
        await using var tab = await ConnectAsync("en");
        if (tab is null)
        {
            return;
        }

        await tab.CallAsync("program.run", new JsonObject
        {
            ["language"] = "python",
            ["code"] = "from gearbit import robot\n\nrobot.light(\"all\", \"pink\")\n",
        });

        var exited = await tab.WaitNotificationAsync("program.exited", Wait);
        Assert.Equal("error", (string?)exited["reason"]);
        Assert.Equal(3, (int)exited["error"]!["line"]!);
        Assert.Contains("I don't know the color «pink»", (string?)exited["error"]!["message"], StringComparison.Ordinal);
        var text = string.Join("\n", tab.Notifications("program.output").Select(o => (string?)o["text"]));
        Assert.Contains("Error in line 3", text, StringComparison.Ordinal);
    }

    /// <summary>Вкладка с подключённым эмулятором или null, если Python не установлен.</summary>
    private async Task<RpcClient?> ConnectAsync(string? lang = null)
    {
        var tab = await RpcClient.ConnectAsync(_port);
        var hello = new JsonObject { ["name"] = "Python" };
        if (lang is not null)
        {
            hello["lang"] = lang;
        }

        await tab.CallAsync("hub.hello", hello);
        var python = (await tab.CallAsync("program.languages")).AsArray().Single(l => (string?)l!["id"] == "python")!;
        if (!(bool)python["available"]!)
        {
            output.WriteLine($"Python не найден — тест пропущен: {(string?)python["problem"]}");
            await tab.DisposeAsync();
            return null;
        }

        output.WriteLine($"Python {(string?)python["version"]}");
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
                var text = string.Join("\n", tab.Notifications("program.output").Select(o => (string?)o["text"]));
                Assert.Fail($"Программа закончилась раньше времени: {exited.ToJsonString()}\n{text}");
            }

            await Task.Delay(30);
        }

        Assert.Fail("Условие не выполнилось вовремя.");
    }
}
