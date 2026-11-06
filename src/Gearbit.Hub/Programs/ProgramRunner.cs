using System.Collections.Concurrent;
using System.ComponentModel;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Gearbit.Core.Robots;
using Gearbit.Hub.Rpc;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Gearbit.Hub.Programs;

/// <summary>Сведения о запущенной программе (ответ <c>program.run</c> и <c>program.status</c>).</summary>
public sealed record ProgramInfo(string RunId, string Language, string Name, DateTimeOffset StartedAt);

/// <summary>Где в программе ошибка: строка, столбец и объяснение по-русски.</summary>
public sealed record ProgramError(int? Line, int? Column, string Message);

/// <summary>
/// Запуск программ на Python и C#. В каждый момент работает одна программа — отдельный процесс,
/// который подключается к хабу как обычный клиент и управляет роботом через арбитр и пределы мощности.
/// Программа прекращается: <c>program.stop</c>, СТОП (<c>robot.stop</c>), ушла вкладка, которая её запустила,
/// потеря связи с роботом, закрытие хаба. Если она в этот момент управляла роботом — моторы в 0 сразу.
/// </summary>
public sealed class ProgramRunner : IHostedService, IAsyncDisposable
{
    public const int MaxCodeLength = 256 * 1024;

    /// <summary>Строки программы, которые хаб забирает себе: облачко «сказать», место ошибки.</summary>
    public const string Marker = "@@gearbit:";

    private const int MaxOutputPerFlush = 32 * 1024;
    private static readonly TimeSpan FlushPeriod = TimeSpan.FromMilliseconds(100);
    private static readonly TimeSpan StopWait = TimeSpan.FromSeconds(5);

    private readonly Dictionary<string, IProgramLanguage> _languages;
    private readonly IProgramLauncher _launcher;
    private readonly ClientRegistry _clients;
    private readonly ControlArbiter _arbiter;
    private readonly RobotManager _robots;
    private readonly HubOptions _options;
    private readonly TimeProvider _time;
    private readonly ILogger<ProgramRunner> _logger;
    private readonly Lock _lock = new();
    private readonly SemaphoreSlim _runLock = new(1, 1);
    private readonly ConcurrentDictionary<string, byte> _stoppedClients = new();
    private Run? _current;

    public ProgramRunner(
        IEnumerable<IProgramLanguage> languages,
        IProgramLauncher launcher,
        ClientRegistry clients,
        ControlArbiter arbiter,
        RobotManager robots,
        HubOptions options,
        TimeProvider time,
        ILogger<ProgramRunner> logger)
    {
        _languages = languages.ToDictionary(l => l.Id, StringComparer.OrdinalIgnoreCase);
        _launcher = launcher;
        _clients = clients;
        _arbiter = arbiter;
        _robots = robots;
        _options = options;
        _time = time;
        _logger = logger;
    }

    public IEnumerable<IProgramLanguage> Languages => _languages.Values;

    public ProgramInfo? Current
    {
        get
        {
            lock (_lock)
            {
                return _current?.Info;
            }
        }
    }

    private string ProgramsRoot => _options.ProgramsDirectory ?? Path.Combine(Path.GetTempPath(), "Gearbit", "programs");

    /// <summary>Запустить программу. Предыдущая программа, если работает, останавливается.</summary>
    /// <param name="owner">Клиент, который запускает (вкладка интерфейса): ему идут вывод и итог.</param>
    /// <param name="sensorPlaces">Куда пользователь поставил датчики: <c>{D1: "front"}</c>.</param>
    public async Task<ProgramInfo> RunAsync(
        HubClient owner,
        string languageId,
        string code,
        string? name,
        IReadOnlyDictionary<string, string>? sensorPlaces,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(owner);
        ArgumentNullException.ThrowIfNull(code);
        if (!_languages.TryGetValue(languageId, out var language))
        {
            throw new HubException(HubErrors.NotSupported, $"Язык «{languageId}» не поддерживается. Есть: {string.Join(", ", _languages.Keys)}.");
        }

        if (code.Length > MaxCodeLength)
        {
            throw new HubException(HubErrors.InvalidParams, "Программа слишком большая.");
        }

        await _runLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            await StopProgramAsync("replaced").ConfigureAwait(false);

            var runId = Guid.NewGuid().ToString("N")[..8];
            var directory = Path.Combine(ProgramsRoot, runId);
            Directory.CreateDirectory(directory);
            var path = Path.Combine(directory, language.FileName);
            await File.WriteAllTextAsync(path, code, new UTF8Encoding(false), cancellationToken).ConfigureAwait(false);

            ProgramCommand command;
            try
            {
                command = await language.PrepareAsync(path, cancellationToken).ConfigureAwait(false);
            }
            catch
            {
                TryDelete(directory);
                throw;
            }

            var title = string.IsNullOrWhiteSpace(name) ? "программа" : name.Trim();
            if (title.Length > 60)
            {
                title = title[..60];
            }

            var environment = new Dictionary<string, string>(command.Environment)
            {
                ["GEARBIT_URL"] = $"ws://localhost:{_options.Port}/ws",
                ["GEARBIT_NAME"] = $"{language.Title}: {title}",
                ["GEARBIT_RUN_ID"] = runId,
                ["GEARBIT_SENSOR_PLACES"] = JsonSerializer.Serialize(sensorPlaces ?? new Dictionary<string, string>()),
            };

            // Вкладка передаёт управление своей программе: иначе её же пульт занимал бы робота.
            _arbiter.Release(owner.Id);

            var run = new Run(this, runId, language, title, owner, directory, _time.GetTimestamp(), _time.GetUtcNow());
            lock (_lock)
            {
                _current = run;
            }

            try
            {
                run.Start(_launcher.Start(command with { Environment = environment }, directory, run.OnLine));
            }
            catch (Exception ex) when (ex is Win32Exception or InvalidOperationException or IOException)
            {
                lock (_lock)
                {
                    _current = null;
                }

                run.Dispose();
                TryDelete(directory);
                throw new HubException(HubErrors.NotSupported, $"Не удалось запустить {language.Title}: {ex.Message}");
            }

            _logger.LogInformation("Запущена программа {RunId} ({Language}, «{Name}»)", runId, language.Id, title);
            return run.Info;
        }
        finally
        {
            _runLock.Release();
        }
    }

    /// <summary>Остановить текущую программу. Возвращает false, если ничего не работало.</summary>
    /// <param name="reason">Причина для <c>program.exited</c>: stopped, replaced, ownerLeft, robotLost, hubStopping.</param>
    /// <param name="wait">Дождаться, пока процесс закончится (до 5 с).</param>
    public async Task<bool> StopProgramAsync(string reason = "stopped", bool wait = true)
    {
        Run? run;
        lock (_lock)
        {
            run = _current;
        }

        if (run is null)
        {
            return false;
        }

        // Соединение программы оборвётся: страж остановит моторы, но без лишнего «отключился».
        // Пометить до того, как убить процесс, — иначе обрыв может прийти раньше пометки.
        var clientId = run.ClientId;
        if (clientId is not null)
        {
            _stoppedClients[clientId] = 0;
        }

        if (!run.RequestStop(reason))
        {
            return false;
        }

        if (clientId is not null)
        {
            if (_arbiter.Owner?.ClientId == clientId && _robots.Active is { State: RobotConnectionState.Connected } robot)
            {
                try
                {
                    await robot.StopAllAsync().ConfigureAwait(false);
                }
                catch (InvalidOperationException ex)
                {
                    _logger.LogWarning(ex, "Не удалось остановить моторы при остановке программы");
                }
            }
        }

        if (wait)
        {
            try
            {
                await run.Completion.WaitAsync(StopWait).ConfigureAwait(false);
            }
            catch (TimeoutException)
            {
                _logger.LogWarning("Программа {RunId} не закончилась за {Seconds} с после остановки", run.Id, StopWait.TotalSeconds);
            }
        }

        return true;
    }

    /// <summary>Программа представилась хабу (<c>hub.hello</c> с runId): запоминаем её клиента.</summary>
    public void Bind(HubClient client, string runId)
    {
        ArgumentNullException.ThrowIfNull(client);
        lock (_lock)
        {
            if (_current is { } run && run.Id == runId)
            {
                run.ClientId = client.Id;
            }
        }
    }

    /// <summary>Этого клиента-программу остановил сам хаб: о его отключении не надо сообщать как об аварии.</summary>
    public bool ConsumeStopped(string clientId) => _stoppedClients.TryRemove(clientId, out _);

    public async Task<IReadOnlyList<object>> DescribeLanguagesAsync(CancellationToken cancellationToken)
    {
        var result = new List<object>();
        foreach (var language in _languages.Values)
        {
            var status = await language.CheckAsync(cancellationToken).ConfigureAwait(false);
            result.Add(new { id = language.Id, title = language.Title, status.Available, status.Version, status.Problem });
        }

        return result;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _clients.Disconnected += OnClientDisconnected;
        _robots.StateChanged += OnRobotStateChanged;
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _clients.Disconnected -= OnClientDisconnected;
        _robots.StateChanged -= OnRobotStateChanged;
        await StopProgramAsync("hubStopping").ConfigureAwait(false);
    }

    public async ValueTask DisposeAsync()
    {
        await StopProgramAsync("hubStopping").ConfigureAwait(false);
        _runLock.Dispose();
    }

    private void OnClientDisconnected(object? sender, HubClient client)
    {
        bool owner;
        lock (_lock)
        {
            owner = _current?.Owner == client;
        }

        if (owner)
        {
            _ = StopProgramAsync("ownerLeft", wait: false);
        }
    }

    private void OnRobotStateChanged(object? sender, RobotStateChangedEventArgs e)
    {
        if (e.State is RobotConnectionState.Lost or RobotConnectionState.Disconnected)
        {
            _ = StopProgramAsync("robotLost", wait: false);
        }
    }

    private void Finished(Run run)
    {
        lock (_lock)
        {
            if (_current == run)
            {
                _current = null;
            }
        }

        TryDelete(run.Directory);
    }

    private void TryDelete(string directory)
    {
        try
        {
            Directory.Delete(directory, recursive: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _logger.LogDebug(ex, "Не удалось удалить {Directory}", directory);
        }
    }

    /// <summary>Одна запущенная программа: процесс, накопление вывода, итог.</summary>
    private sealed class Run : IDisposable
    {
        private readonly ProgramRunner _runner;
        private readonly long _startTimestamp;
        private readonly Lock _outputLock = new();
        private readonly List<(ProgramStream Stream, StringBuilder Text)> _segments = [];
        private readonly TaskCompletionSource<int> _completion = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private ITimer? _flushTimer;
        private IProgramProcess? _process;
        private int _pendingChars;
        private bool _dropped;
        private string? _stopReason;
        private ProgramError? _error;
        private volatile string? _clientId;

        public Run(ProgramRunner runner, string id, IProgramLanguage language, string name, HubClient owner, string directory, long startTimestamp, DateTimeOffset startedAt)
        {
            _runner = runner;
            Id = id;
            Owner = owner;
            Directory = directory;
            _startTimestamp = startTimestamp;
            Info = new ProgramInfo(id, language.Id, name, startedAt);
        }

        public string Id { get; }

        public HubClient Owner { get; }

        public string Directory { get; }

        public ProgramInfo Info { get; }

        public string? ClientId
        {
            get => _clientId;
            set => _clientId = value;
        }

        public Task<int> Completion => _completion.Task;

        public void Start(IProgramProcess process)
        {
            bool stopped;
            lock (_outputLock)
            {
                _process = process;
                stopped = _stopReason is not null;
            }

            // СТОП успели нажать, пока процесс запускался.
            if (stopped)
            {
                process.Kill();
            }

            _flushTimer = _runner._time.CreateTimer(_ => Flush(), null, FlushPeriod, FlushPeriod);
            _ = WatchAsync(process);
        }

        /// <summary>Убить процесс. false — уже останавливали.</summary>
        public bool RequestStop(string reason)
        {
            IProgramProcess? process;
            lock (_outputLock)
            {
                if (_stopReason is not null || _completion.Task.IsCompleted)
                {
                    return false;
                }

                _stopReason = reason;
                process = _process;
            }

            process?.Kill();
            return true;
        }

        public void OnLine(ProgramStream stream, string line)
        {
            if (line.StartsWith(Marker, StringComparison.Ordinal) && HandleMarker(line.AsSpan(Marker.Length).ToString()))
            {
                return;
            }

            lock (_outputLock)
            {
                if (_pendingChars > MaxOutputPerFlush)
                {
                    _dropped = true;
                    return;
                }

                if (_segments.Count == 0 || _segments[^1].Stream != stream)
                {
                    _segments.Add((stream, new StringBuilder()));
                }
                else
                {
                    _segments[^1].Text.Append('\n');
                }

                _segments[^1].Text.Append(line);
                _pendingChars += line.Length + 1;
            }
        }

        public void Dispose() => _flushTimer?.Dispose();

        private bool HandleMarker(string json)
        {
            JsonNode? node;
            try
            {
                node = JsonNode.Parse(json);
            }
            catch (JsonException)
            {
                return false;
            }

            switch ((string?)node?["type"])
            {
                case "say":
                    Flush();
                    Send("program.say", new { runId = Id, text = (string?)node!["text"] ?? "" });
                    return true;
                case "error":
                    lock (_outputLock)
                    {
                        _error = new ProgramError(Int(node!["line"]), Int(node["column"]), (string?)node["message"] ?? "Ошибка");
                    }

                    return true;
                case "stopped":
                    return true;
                default:
                    return false;
            }
        }

        private static int? Int(JsonNode? node) =>
            node is JsonValue value && value.TryGetValue<int>(out var number) ? number : null;

        private void Flush()
        {
            List<(ProgramStream Stream, StringBuilder Text)> segments;
            bool dropped;
            lock (_outputLock)
            {
                if (_segments.Count == 0 && !_dropped)
                {
                    return;
                }

                segments = [.. _segments];
                dropped = _dropped;
                _segments.Clear();
                _pendingChars = 0;
                _dropped = false;
            }

            foreach (var (stream, text) in segments)
            {
                Send("program.output", new { runId = Id, stream = stream == ProgramStream.Out ? "out" : "err", text = text.ToString() });
            }

            if (dropped)
            {
                Send("program.output", new { runId = Id, stream = "err", text = "… программа печатает слишком быстро: часть строк пропущена." });
            }
        }

        private void Send(string method, object payload) => Owner.Send(JsonRpc.Notification(method, payload));

        private async Task WatchAsync(IProgramProcess process)
        {
            int exitCode;
            try
            {
                exitCode = await process.Completion.ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is InvalidOperationException or Win32Exception)
            {
                _runner._logger.LogWarning(ex, "Программа {RunId}: не удалось дождаться процесса", Id);
                exitCode = -1;
            }

            _flushTimer?.Dispose();
            Flush();

            string reason;
            ProgramError? error;
            lock (_outputLock)
            {
                reason = _stopReason ?? exitCode switch
                {
                    0 => "finished",
                    2 => "stopped",
                    _ => "error",
                };
                error = _error;
            }

            var duration = _runner._time.GetElapsedTime(_startTimestamp);
            Send("program.exited", new { runId = Id, exitCode, reason, error, durationMs = (long)duration.TotalMilliseconds });
            _runner._logger.LogInformation("Программа {RunId} закончилась: {Reason}, код {Code}", Id, reason, exitCode);
            _runner.Finished(this);
            _completion.TrySetResult(exitCode);
        }
    }
}
