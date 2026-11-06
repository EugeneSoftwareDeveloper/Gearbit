using System.Collections.Concurrent;
using BotStudio.Core.Descriptors;
using BotStudio.Core.Protocol;
using BotStudio.Core.Robots;
using BotStudio.Core.Transport;
using Microsoft.Extensions.Logging;

namespace BotStudio.Hub;

/// <summary>Найденное устройство вместе с подобранным описанием.</summary>
public sealed record ScanResult(DiscoveredDevice Device, string? DescriptorId, string? DescriptorTitle);

public sealed record ScanReport(IReadOnlyList<ScanResult> Devices, IReadOnlyList<string> Warnings);

/// <summary>
/// Находит устройства через все транспорты, подбирает описание и сборку, создаёт и держит
/// подключённого робота. В первой версии робот один; интерфейс готов к нескольким.
/// </summary>
public sealed class RobotManager : IAsyncDisposable
{
    private readonly IReadOnlyList<IDeviceScanner> _scanners;
    private readonly IReadOnlyList<ITransportFactory> _transports;
    private readonly IReadOnlyList<IRobotProtocolFactory> _protocols;
    private readonly ILogger<RobotManager> _logger;
    private readonly ConcurrentDictionary<string, ScanResult> _lastScan = new(StringComparer.OrdinalIgnoreCase);
    private readonly SemaphoreSlim _connectLock = new(1, 1);

    public RobotManager(
        RobotCatalog catalog,
        IEnumerable<IDeviceScanner> scanners,
        IEnumerable<ITransportFactory> transports,
        IEnumerable<IRobotProtocolFactory> protocols,
        ILogger<RobotManager> logger)
    {
        Catalog = catalog;
        _scanners = scanners.ToList();
        _transports = transports.ToList();
        _protocols = protocols.ToList();
        _logger = logger;
    }

    public RobotCatalog Catalog { get; }

    public ProtocolRobot? Active { get; private set; }

    public IEnumerable<string> TransportKinds => _scanners.Select(s => s.TransportKind);

    /// <summary>Подключился или отключился робот (новый объект робота или null).</summary>
    public event EventHandler? ActiveChanged;

    public event EventHandler<RobotStateChangedEventArgs>? StateChanged;

    public event EventHandler<TelemetryEventArgs>? TelemetryReceived;

    public event EventHandler<ProtocolTraceEventArgs>? ProtocolTrace;

    public async Task<ScanReport> ScanAsync(TimeSpan duration, CancellationToken cancellationToken)
    {
        var warnings = new List<string>();
        var tasks = _scanners.Select(async scanner =>
        {
            try
            {
                return await scanner.ScanAsync(duration, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Сканер {Kind} не сработал", scanner.TransportKind);
                lock (warnings)
                {
                    warnings.Add(scanner.TransportKind == "ble"
                        ? $"Bluetooth недоступен: {ex.Message}"
                        : $"{scanner.TransportKind}: {ex.Message}");
                }

                return (IReadOnlyList<DiscoveredDevice>)[];
            }
        });

        var found = (await Task.WhenAll(tasks).ConfigureAwait(false)).SelectMany(d => d).ToList();
        var results = found
            .Select(device =>
            {
                var descriptor = Catalog.Match(device.Name, device.Services);
                return new ScanResult(device, descriptor?.Id, descriptor?.Title);
            })
            // Сначала подходящие роботы, затем остальные устройства.
            .OrderBy(r => r.DescriptorId is null)
            .ThenByDescending(r => r.Device.Rssi ?? int.MinValue)
            .ToList();

        foreach (var result in results)
        {
            _lastScan[result.Device.Id] = result;
        }

        return new ScanReport(results, warnings);
    }

    /// <summary>Подключиться к найденному устройству. Описание можно указать явно (если имя не распозналось).</summary>
    public async Task<ProtocolRobot> ConnectAsync(string deviceId, string? descriptorId, string? profileId, CancellationToken cancellationToken)
    {
        await _connectLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var scan = await FindScannedAsync(deviceId, cancellationToken).ConfigureAwait(false)
                ?? throw new HubException(HubErrors.NotFound, "Устройство не найдено. Запустите поиск ещё раз.");

            var descriptor = (descriptorId ?? scan.DescriptorId) is { } id
                ? Catalog.FindDevice(id) ?? throw new HubException(HubErrors.NotFound, $"Нет описания устройства «{id}».")
                : throw new HubException(HubErrors.NotFound, "Не удалось определить модель робота. Выберите её вручную.");

            var profile = profileId is not null
                ? Catalog.FindProfile(profileId) ?? throw new HubException(HubErrors.NotFound, $"Нет сборки «{profileId}».")
                : Catalog.ProfilesFor(descriptor.Id).FirstOrDefault();

            var transportFactory = _transports.FirstOrDefault(t => t.TransportKind == scan.Device.TransportKind)
                ?? throw new HubException(HubErrors.NotSupported, $"Нет транспорта «{scan.Device.TransportKind}».");
            var protocolFactory = _protocols.FirstOrDefault(p => p.Name == descriptor.ProtocolName)
                ?? throw new HubException(HubErrors.NotSupported, $"Протокол «{descriptor.ProtocolName}» не поддерживается.");

            await DisconnectCoreAsync().ConfigureAwait(false);

            var transport = transportFactory.Create(scan.Device, descriptor);
            var robot = new ProtocolRobot(scan.Device.Id, scan.Device.Name, descriptor, profile, transport, protocolFactory.Create(descriptor));
            robot.StateChanged += OnStateChanged;
            robot.TelemetryReceived += OnTelemetry;
            robot.ProtocolTrace += OnTrace;

            try
            {
                await robot.ConnectAsync(cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException and not HubException)
            {
                Detach(robot);
                await robot.DisposeAsync().ConfigureAwait(false);
                throw new HubException(HubErrors.ConnectFailed, ex.Message);
            }

            Active = robot;
            _logger.LogInformation("Подключён {Name} ({Id}), сборка {Profile}", robot.Name, robot.Id, profile?.Id ?? "—");
            ActiveChanged?.Invoke(this, EventArgs.Empty);
            return robot;
        }
        finally
        {
            _connectLock.Release();
        }
    }

    public async Task DisconnectAsync()
    {
        await _connectLock.WaitAsync().ConfigureAwait(false);
        try
        {
            await DisconnectCoreAsync().ConfigureAwait(false);
        }
        finally
        {
            _connectLock.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        await DisconnectAsync().ConfigureAwait(false);
        _connectLock.Dispose();
    }

    private async Task<ScanResult?> FindScannedAsync(string deviceId, CancellationToken cancellationToken)
    {
        if (_lastScan.TryGetValue(deviceId, out var cached))
        {
            return cached;
        }

        // Эмулятор и другие «мгновенные» устройства можно подключать без предварительного поиска.
        var kind = deviceId.Split(':', 2)[0];
        var scanner = _scanners.FirstOrDefault(s => s.TransportKind == kind && kind != "ble");
        if (scanner is null)
        {
            return null;
        }

        foreach (var device in await scanner.ScanAsync(TimeSpan.Zero, cancellationToken).ConfigureAwait(false))
        {
            var descriptor = Catalog.Match(device.Name, device.Services);
            _lastScan[device.Id] = new ScanResult(device, descriptor?.Id, descriptor?.Title);
        }

        return _lastScan.GetValueOrDefault(deviceId);
    }

    private async Task DisconnectCoreAsync()
    {
        var robot = Active;
        if (robot is null)
        {
            return;
        }

        Active = null;
        try
        {
            await robot.DisposeAsync().ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is InvalidOperationException or IOException)
        {
            _logger.LogWarning(ex, "Ошибка при отключении {Id}", robot.Id);
        }
        finally
        {
            Detach(robot);
        }

        StateChanged?.Invoke(this, new RobotStateChangedEventArgs(RobotConnectionState.Disconnected, "Отключено"));
        ActiveChanged?.Invoke(this, EventArgs.Empty);
    }

    private void Detach(ProtocolRobot robot)
    {
        robot.StateChanged -= OnStateChanged;
        robot.TelemetryReceived -= OnTelemetry;
        robot.ProtocolTrace -= OnTrace;
    }

    private void OnStateChanged(object? sender, RobotStateChangedEventArgs e) => StateChanged?.Invoke(sender, e);

    private void OnTelemetry(object? sender, TelemetryEventArgs e) => TelemetryReceived?.Invoke(sender, e);

    private void OnTrace(object? sender, ProtocolTraceEventArgs e) => ProtocolTrace?.Invoke(sender, e);
}
