using System.Text.Json.Nodes;
using Gearbit.Hub;
using Gearbit.Hub.Programs;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

namespace Gearbit.Tests;

/// <summary>
/// Запуск программ через хаб: вывод, облачко «сказать», ошибки и, главное, остановка.
/// Процессы поддельные — тесты не зависят от установленного Python.
/// </summary>
public sealed class ProgramRunnerTests : IAsyncLifetime
{
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(5);

    private readonly FakeLauncher _launcher = new();
    private WebApplication _app = null!;
    private int _port;

    public async Task InitializeAsync()
    {
        _port = TestHub.FreePort();
        _app = GearbitHub.Build(
            [$"--Hub:Port={_port}", "--Logging:LogLevel:Default=Warning"],
            services =>
            {
                services.AddSingleton<IProgramLauncher>(_launcher);
                services.AddSingleton<IProgramLanguage>(new FakeLanguage());
            });
        await _app.StartAsync();
    }

    public async Task DisposeAsync()
    {
        await _app.StopAsync();
        await _app.DisposeAsync();
    }

    [Fact]
    public async Task Output_say_and_error_go_to_the_tab_that_started_the_program()
    {
        await using var tab = await RpcClient.ConnectAsync(_port);
        await tab.CallAsync("hub.hello", new JsonObject { ["name"] = "Python" });

        var started = await tab.CallAsync("program.run", new JsonObject
        {
            ["language"] = "fake",
            ["code"] = "print('привет')",
            ["name"] = "проверка",
            ["sensors"] = new JsonObject { ["D1"] = "front", ["D2"] = "none" },
        });
        var runId = (string)started["runId"]!;
        var process = _launcher.Last;

        Assert.Equal("print('привет')", process.Code);
        Assert.Equal(runId, process.Command.Environment["GEARBIT_RUN_ID"]);
        Assert.Equal($"ws://localhost:{_port}/ws", process.Command.Environment["GEARBIT_URL"]);
        Assert.Equal("Тест: проверка", process.Command.Environment["GEARBIT_NAME"]);
        Assert.Equal("""{"D1":"front","D2":"none"}""", process.Command.Environment["GEARBIT_SENSOR_PLACES"]);
        Assert.Equal("1", process.Command.Environment["FAKE"]);
        Assert.Equal(runId, (string?)(await tab.CallAsync("program.status"))["runId"]);

        process.Out("привет");
        process.Out("ещё строка");
        process.Out("""@@gearbit:{"type":"say","text":"Ура"}""");
        process.Err("Ошибка в строке 3: На ноль делить нельзя.");
        process.Err("""@@gearbit:{"type":"error","line":3,"column":null,"message":"На ноль делить нельзя."}""");
        process.Exit(1);

        var exited = await tab.WaitNotificationAsync("program.exited", Wait);
        Assert.Equal("error", (string?)exited["reason"]);
        Assert.Equal(3, (int)exited["error"]!["line"]!);
        Assert.Equal("На ноль делить нельзя.", (string?)exited["error"]!["message"]);

        var output = tab.Notifications("program.output");
        Assert.Contains(output, o => (string?)o["stream"] == "out" && (string?)o["text"] == "привет\nещё строка");
        Assert.Contains(output, o => (string?)o["stream"] == "err" && ((string?)o["text"])!.Contains("строке 3", StringComparison.Ordinal));
        Assert.DoesNotContain(output, o => ((string?)o["text"])!.Contains("@@gearbit", StringComparison.Ordinal));
        Assert.Equal("Ура", (string?)tab.Notifications("program.say").Single()["text"]);

        Assert.Equal(JsonValueKind(null), JsonValueKind(await tab.CallAsync("program.status")));
        Assert.False(Directory.Exists(process.Directory));
    }

    [Fact]
    public async Task Stop_button_kills_the_program_and_stops_its_motors_without_alarm()
    {
        await using var tab = await RpcClient.ConnectAsync(_port);
        await tab.CallAsync("hub.hello", new JsonObject { ["name"] = "Python" });
        await tab.CallAsync("robot.connect", new JsonObject { ["id"] = "emulator:superbot" });

        var runId = (string)(await tab.CallAsync("program.run", new JsonObject { ["language"] = "fake", ["code"] = "x" }))["runId"]!;
        var process = _launcher.Last;

        // Программа подключается к хабу сама, как обычный клиент, и едет.
        var program = await RpcClient.ConnectAsync(_port);
        await program.CallAsync("hub.hello", new JsonObject { ["name"] = "Тест: программа", ["runId"] = runId });
        await program.CallAsync("drive.tank", new JsonObject { ["left"] = 50, ["right"] = 50, ["source"] = "program" });
        Assert.Equal("program", (string?)(await tab.CallAsync("control.get"))["kind"]);
        Assert.NotEqual(0, (int)(await tab.CallAsync("robot.telemetry"))["motors"]!["M2"]!);

        await tab.CallAsync("robot.stop");

        Assert.True(process.Killed);
        var exited = await tab.WaitNotificationAsync("program.exited", Wait);
        Assert.Equal("stopped", (string?)exited["reason"]);
        Assert.Equal(0, (int)(await tab.CallAsync("robot.telemetry"))["motors"]!["M2"]!);

        // Процесс умер — его соединение закрылось. Моторы уже стоят, тревоги «отключился» нет.
        await program.DisposeAsync();
        await WaitUntilAsync(async () => (await tab.CallAsync("control.get"))["clientId"] is null);
        Assert.DoesNotContain(tab.Notifications("safety.event"), e => (string?)e["reason"] == "clientLeft");
    }

    [Fact]
    public async Task Program_stops_when_its_tab_closes()
    {
        var tab = await RpcClient.ConnectAsync(_port);
        await tab.CallAsync("hub.hello", new JsonObject { ["name"] = "Python" });
        await tab.CallAsync("program.run", new JsonObject { ["language"] = "fake", ["code"] = "x" });
        var process = _launcher.Last;

        await tab.DisposeAsync();

        await WaitUntilAsync(() => Task.FromResult(process.Killed));
    }

    [Fact]
    public async Task Program_stops_when_robot_disconnects()
    {
        await using var tab = await RpcClient.ConnectAsync(_port);
        await tab.CallAsync("hub.hello", new JsonObject { ["name"] = "Python" });
        await tab.CallAsync("robot.connect", new JsonObject { ["id"] = "emulator:superbot" });
        await tab.CallAsync("program.run", new JsonObject { ["language"] = "fake", ["code"] = "x" });

        await tab.CallAsync("robot.disconnect");

        var exited = await tab.WaitNotificationAsync("program.exited", Wait);
        Assert.Equal("robotLost", (string?)exited["reason"]);
    }

    [Fact]
    public async Task New_run_replaces_the_running_program()
    {
        await using var tab = await RpcClient.ConnectAsync(_port);
        await tab.CallAsync("hub.hello", new JsonObject { ["name"] = "Python" });
        var first = (string)(await tab.CallAsync("program.run", new JsonObject { ["language"] = "fake", ["code"] = "1" }))["runId"]!;
        var firstProcess = _launcher.Last;
        var second = (string)(await tab.CallAsync("program.run", new JsonObject { ["language"] = "fake", ["code"] = "2" }))["runId"]!;

        Assert.NotEqual(first, second);
        Assert.True(firstProcess.Killed);
        var exited = await tab.WaitNotificationAsync("program.exited", e => (string?)e["runId"] == first, Wait);
        Assert.Equal("replaced", (string?)exited["reason"]);
        Assert.Equal(second, (string?)(await tab.CallAsync("program.status"))["runId"]);
    }

    [Fact]
    public async Task Program_stop_and_unknown_language()
    {
        await using var tab = await RpcClient.ConnectAsync(_port);
        await tab.CallAsync("hub.hello", new JsonObject { ["name"] = "Python" });

        Assert.False((bool)(await tab.CallAsync("program.stop"))!);
        var error = await Assert.ThrowsAsync<RpcError>(() => tab.CallAsync("program.run", new JsonObject { ["language"] = "basic", ["code"] = "10 GOTO 10" }));
        Assert.Equal(HubErrors.NotSupported, error.Code);

        await tab.CallAsync("program.run", new JsonObject { ["language"] = "fake", ["code"] = "x" });
        Assert.True((bool)(await tab.CallAsync("program.stop"))!);
        Assert.True(_launcher.Last.Killed);

        var languages = (await tab.CallAsync("program.languages")).AsArray();
        Assert.Contains(languages, l => (string?)l!["id"] == "fake" && (bool)l["available"]!);
        Assert.Contains(languages, l => (string?)l!["id"] == "python");
    }

    [Fact]
    public async Task Too_much_output_is_trimmed()
    {
        await using var tab = await RpcClient.ConnectAsync(_port);
        await tab.CallAsync("hub.hello", new JsonObject { ["name"] = "Python" });
        await tab.CallAsync("program.run", new JsonObject { ["language"] = "fake", ["code"] = "x" });
        var process = _launcher.Last;

        var line = new string('x', 1000);
        for (var i = 0; i < 200; i++)
        {
            process.Out(line);
        }

        process.Exit(0);
        await tab.WaitNotificationAsync("program.exited", Wait);

        var output = tab.Notifications("program.output");
        Assert.True(output.Sum(o => ((string?)o["text"])!.Length) < 100_000);
        Assert.Contains(output, o => ((string?)o["text"])!.Contains("часть строк пропущена", StringComparison.Ordinal));
    }

    private static string JsonValueKind(JsonNode? node) => node?.GetValueKind().ToString() ?? "Null";

    private static async Task WaitUntilAsync(Func<Task<bool>> condition)
    {
        var deadline = DateTime.UtcNow + Wait;
        while (DateTime.UtcNow < deadline)
        {
            if (await condition())
            {
                return;
            }

            await Task.Delay(20);
        }

        Assert.Fail("Условие не выполнилось вовремя.");
    }

    private sealed class FakeLanguage : IProgramLanguage
    {
        public string Id => "fake";

        public string Title => "Тест";

        public string FileName => "program.txt";

        public Task<LanguageStatus> CheckAsync(CancellationToken cancellationToken) => Task.FromResult(new LanguageStatus(true, "1.0", null));

        public Task<ProgramCommand> PrepareAsync(string programPath, CancellationToken cancellationToken) =>
            Task.FromResult(new ProgramCommand("fake.exe", [programPath], new Dictionary<string, string> { ["FAKE"] = "1" }));
    }

    private sealed class FakeLauncher : IProgramLauncher
    {
        private readonly List<FakeProcess> _started = [];

        public FakeProcess Last
        {
            get
            {
                lock (_started)
                {
                    return _started[^1];
                }
            }
        }

        public IProgramProcess Start(ProgramCommand command, string workingDirectory, Action<ProgramStream, string> onLine)
        {
            var process = new FakeProcess(command, workingDirectory, onLine);
            lock (_started)
            {
                _started.Add(process);
            }

            return process;
        }
    }

    private sealed class FakeProcess(ProgramCommand command, string directory, Action<ProgramStream, string> onLine) : IProgramProcess
    {
        private readonly TaskCompletionSource<int> _exit = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public ProgramCommand Command { get; } = command;

        public string Directory { get; } = directory;

        public string Code { get; } = File.ReadAllText(command.Arguments[0]);

        public bool Killed { get; private set; }

        public Task<int> Completion => _exit.Task;

        public void Out(string line) => onLine(ProgramStream.Out, line);

        public void Err(string line) => onLine(ProgramStream.Err, line);

        public void Exit(int code) => _exit.TrySetResult(code);

        public void Kill()
        {
            Killed = true;
            _exit.TrySetResult(-1);
        }
    }
}
