using Gearbit.Core.Robots;
using Gearbit.Hub.Rpc;
using Microsoft.Extensions.Logging;

namespace Gearbit.Hub;

/// <summary>
/// Режим замеров (этап 0, docs/STAGE0-CHECKLIST.md): один клиент шлёт роботу сырые кадры,
/// цикл отправки робота молчит, пульт и программы выключены.
/// Сырые кадры не проходят предел мощности — поэтому режим включается только явно и страхуется:
/// СТОП работает как обычно, ушёл клиент — режим заканчивается и моторы в 0,
/// нет кадров дольше <see cref="HubOptions.ServiceWatchdogMs"/> — моторы в 0.
/// </summary>
public sealed class ServiceMode
{
    /// <summary>Самый длинный кадр, который можно отправить вручную.</summary>
    public const int MaxFrameBytes = 64;

    private readonly RobotManager _robots;
    private readonly ControlArbiter _arbiter;
    private readonly ClientRegistry _clients;
    private readonly HubOptions _options;
    private readonly TimeProvider _time;
    private readonly ILogger<ServiceMode> _logger;
    private readonly Lock _lock = new();
    private Session? _session;

    public ServiceMode(RobotManager robots, ControlArbiter arbiter, ClientRegistry clients, HubOptions options, TimeProvider time, ILogger<ServiceMode> logger)
    {
        _robots = robots;
        _arbiter = arbiter;
        _clients = clients;
        _options = options;
        _time = time;
        _logger = logger;

        // Другой робот, отключение, потеря связи: ручной режим остался у старого робота, сессия закончена.
        robots.ActiveChanged += (_, _) => Forget();
        robots.StateChanged += (_, e) =>
        {
            if (e.State != RobotConnectionState.Connected)
            {
                Forget();
            }
        };
    }

    public bool IsActive
    {
        get
        {
            lock (_lock)
            {
                return _session is not null;
            }
        }
    }

    /// <summary>Кто ведёт замеры (для сообщений об ошибках).</summary>
    public string? OwnerName
    {
        get
        {
            lock (_lock)
            {
                return _session?.ClientName;
            }
        }
    }

    /// <summary>Начать замеры: робот останавливается и переходит в ручной режим.</summary>
    public async Task BeginAsync(HubClient client, ProtocolRobot robot)
    {
        ArgumentNullException.ThrowIfNull(client);
        ArgumentNullException.ThrowIfNull(robot);

        lock (_lock)
        {
            if (_session is { } current)
            {
                if (current.ClientId == client.Id)
                {
                    return;
                }

                var owner = current.ClientName;
                throw new HubException(HubErrors.ControlBusy, t => t.ServiceAlreadyRunning(owner));
            }

            _arbiter.Authorize(client.Id, client.Name, ControllerKind.Service);
            _session = new Session(client.Id, client.Name, robot);
        }

        try
        {
            await robot.EnterManualModeAsync().ConfigureAwait(false);
        }
        catch (InvalidOperationException)
        {
            Forget();
            _arbiter.Release(client.Id);
            throw new HubException(HubErrors.NotConnected, t => t.RobotNotConnected);
        }

        _logger.LogInformation("Замеры начал «{Client}»", client.Name);
        _clients.Broadcast("robot.info", RobotDto.From(robot));
    }

    /// <summary>Отправить сырой кадр. Разрешено только тому, кто начал замеры.</summary>
    public async Task<int> SendAsync(HubClient client, byte[] frame, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(client);
        ArgumentNullException.ThrowIfNull(frame);

        ProtocolRobot robot;
        lock (_lock)
        {
            if (_session is not { } session)
            {
                throw new HubException(HubErrors.NotSupported, t => t.ServiceNotStarted);
            }

            if (session.ClientId != client.Id)
            {
                var owner = session.ClientName;
                throw new HubException(HubErrors.ControlBusy, t => t.ServiceOwnedBy(owner));
            }

            // Управление могли забрать кнопкой «Забрать управление» — тогда кадры не шлём.
            _arbiter.Authorize(client.Id, client.Name, ControllerKind.Service);
            session.Armed = true;
            session.LastSend = _time.GetTimestamp();
            robot = session.Robot;
        }

        try
        {
            await robot.WriteRawAsync(frame, cancellationToken).ConfigureAwait(false);
        }
        catch (RobotException ex) when (ex.Code == RobotErrorCode.ManualModeRequired)
        {
            // Замеры закончились (СТОП, «Закончить») между проверкой и отправкой.
            throw new HubException(HubErrors.NotSupported, t => t.ServiceNotStarted);
        }
        catch (InvalidOperationException)
        {
            throw new HubException(HubErrors.NotConnected, t => t.RobotNotConnected);
        }

        return frame.Length;
    }

    /// <summary>
    /// Закончить замеры: моторы в 0, робот снова шлёт желаемое состояние. Разрешено любому клиенту —
    /// это безопасное действие, как СТОП. Возвращает false, если замеры не шли.
    /// </summary>
    public async Task<bool> EndAsync()
    {
        Session? session;
        lock (_lock)
        {
            session = _session;
            _session = null;
        }

        if (session is null)
        {
            return false;
        }

        try
        {
            await session.Robot.ExitManualModeAsync().ConfigureAwait(false);
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Не удалось остановить робота после замеров");
        }

        _arbiter.Release(session.ClientId);
        _logger.LogInformation("Замеры закончены");
        if (_robots.Active is { } robot)
        {
            _clients.Broadcast("robot.info", RobotDto.From(robot));
        }

        return true;
    }

    /// <summary>Закончить замеры, если их вёл этот клиент (он отключился).</summary>
    public Task<bool> EndIfOwnerAsync(string clientId)
    {
        lock (_lock)
        {
            if (_session?.ClientId != clientId)
            {
                return Task.FromResult(false);
            }
        }

        return EndAsync();
    }

    /// <summary>После СТОП страж замеров не нужен: моторы уже стоят.</summary>
    public void Disarm()
    {
        lock (_lock)
        {
            _session?.Armed = false;
        }
    }

    /// <summary>
    /// Страж замеров: после последнего кадра прошло больше <see cref="HubOptions.ServiceWatchdogMs"/> — СТОП.
    /// Срабатывает один раз на каждый «последний» кадр. Возвращает true, если робот остановлен.
    /// </summary>
    internal async Task<bool> CheckWatchdogAsync()
    {
        ProtocolRobot robot;
        lock (_lock)
        {
            if (_session is not { Armed: true } session ||
                _time.GetElapsedTime(session.LastSend) < TimeSpan.FromMilliseconds(_options.ServiceWatchdogMs))
            {
                return false;
            }

            session.Armed = false;
            robot = session.Robot;
        }

        await robot.StopAllAsync().ConfigureAwait(false);
        var seconds = _options.ServiceWatchdogMs / 1000.0;
        _logger.LogInformation("Замеры: {Ms} мс без кадров — робот остановлен", _options.ServiceWatchdogMs);
        _clients.BroadcastText("safety.event", t => new { reason = "watchdog", message = t.ServiceWatchdog(seconds) });
        return true;
    }

    /// <summary>Разобрать hex («FF FE 01 04 FD FC» или «FFFE0104FDFC»). Ошибка — понятное сообщение.</summary>
    public static byte[] ParseHex(string text)
    {
        ArgumentNullException.ThrowIfNull(text);
        var compact = string.Concat(text.Where(c => !char.IsWhiteSpace(c) && c != '-' && c != ':'));
        if (compact.Length == 0)
        {
            throw new HubException(HubErrors.InvalidParams, t => t.FrameEmpty);
        }

        if (compact.Length % 2 != 0)
        {
            throw new HubException(HubErrors.InvalidParams, t => t.FrameOddDigits);
        }

        byte[] bytes;
        try
        {
            bytes = Convert.FromHexString(compact);
        }
        catch (FormatException)
        {
            throw new HubException(HubErrors.InvalidParams, t => t.FrameBadChars);
        }

        if (bytes.Length > MaxFrameBytes)
        {
            throw new HubException(HubErrors.InvalidParams, t => t.FrameTooLong(MaxFrameBytes));
        }

        return bytes;
    }

    private void Forget()
    {
        Session? session;
        lock (_lock)
        {
            session = _session;
            _session = null;
        }

        if (session is not null)
        {
            _logger.LogInformation("Замеры прерваны: робот отключился или сменился");
        }
    }

    private sealed class Session(string clientId, string clientName, ProtocolRobot robot)
    {
        public string ClientId { get; } = clientId;

        public string ClientName { get; } = clientName;

        public ProtocolRobot Robot { get; } = robot;

        /// <summary>После кадра страж ждёт тишину; после срабатывания или СТОП — нет.</summary>
        public bool Armed { get; set; }

        public long LastSend { get; set; }
    }
}
