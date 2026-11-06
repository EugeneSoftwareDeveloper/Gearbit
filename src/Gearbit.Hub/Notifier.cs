using Gearbit.Core.Robots;
using Gearbit.Emulator;
using Gearbit.Hub.Rpc;
using Microsoft.Extensions.Hosting;

namespace Gearbit.Hub;

/// <summary>
/// Рассылает клиентам уведомления: состояние подключения, телеметрию (до 10 раз в секунду),
/// журнал протокола, смену владельца управления и кадры 2D-эмулятора.
/// </summary>
public sealed class Notifier(
    RobotManager robots,
    ControlArbiter arbiter,
    ClientRegistry clients,
    TimeProvider time,
    EmulatorHost? emulator = null) : BackgroundService
{
    private static readonly TimeSpan TelemetryPeriod = TimeSpan.FromMilliseconds(100);
    private static readonly TimeSpan EmulatorPeriod = TimeSpan.FromMilliseconds(66);

    private readonly long _start = time.GetTimestamp();
    private string? _lastFirmware;

    public override Task StartAsync(CancellationToken cancellationToken)
    {
        robots.ActiveChanged += OnActiveChanged;
        robots.StateChanged += OnStateChanged;
        robots.ProtocolTrace += OnTrace;
        arbiter.Changed += OnControlChanged;
        return base.StartAsync(cancellationToken);
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        robots.ActiveChanged -= OnActiveChanged;
        robots.StateChanged -= OnStateChanged;
        robots.ProtocolTrace -= OnTrace;
        arbiter.Changed -= OnControlChanged;
        await base.StopAsync(cancellationToken).ConfigureAwait(false);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.WhenAll(TelemetryLoopAsync(stoppingToken), EmulatorLoopAsync(stoppingToken)).ConfigureAwait(false);
    }

    private async Task TelemetryLoopAsync(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(TelemetryPeriod, time);
        try
        {
            while (await timer.WaitForNextTickAsync(cancellationToken).ConfigureAwait(false))
            {
                if (clients.Count == 0 || robots.Active is not { State: RobotConnectionState.Connected } robot)
                {
                    continue;
                }

                // Новая прошивка (например, появился гироскоп) меняет набор доступных компонентов.
                if (robot.Firmware != _lastFirmware)
                {
                    _lastFirmware = robot.Firmware;
                    clients.Broadcast("robot.info", RobotDto.From(robot));
                }

                clients.Broadcast("robot.telemetry", TelemetryDto.From(robot));
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
    }

    private async Task EmulatorLoopAsync(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(EmulatorPeriod, time);
        try
        {
            while (await timer.WaitForNextTickAsync(cancellationToken).ConfigureAwait(false))
            {
                if (emulator?.Current is { } current && clients.All.Any(c => c.EmulatorViewEnabled))
                {
                    clients.Broadcast("emulator.state", EmulatorDto.From(current.GetSnapshot()), c => c.EmulatorViewEnabled);
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
    }

    private void OnActiveChanged(object? sender, EventArgs e)
    {
        _lastFirmware = robots.Active?.Firmware;
        clients.Broadcast("robot.info", robots.Active is { } robot ? RobotDto.From(robot) : null);
    }

    private void OnStateChanged(object? sender, RobotStateChangedEventArgs e)
    {
        clients.Broadcast("robot.state", new { state = e.State, reason = e.Reason });
        if (e.State == RobotConnectionState.Lost)
        {
            clients.Broadcast("safety.event", new { reason = "lost", message = "Связь с роботом потеряна. Проверьте питание и расстояние." });
        }
    }

    private void OnTrace(object? sender, ProtocolTraceEventArgs e)
    {
        if (!clients.All.Any(c => c.TraceEnabled))
        {
            return;
        }

        var dto = new TraceDto(
            e.Outgoing ? "out" : "in",
            Convert.ToHexString(e.Data.Span),
            e.Note,
            (long)time.GetElapsedTime(_start).TotalMilliseconds);
        clients.Broadcast("robot.trace", dto, c => c.TraceEnabled);
    }

    private void OnControlChanged(object? sender, ControlChangedEventArgs e)
    {
        // Поле mine у каждого клиента своё, поэтому рассылаем по одному.
        foreach (var client in clients.All)
        {
            var owner = e.Owner;
            client.Send(JsonRpc.Notification("control.changed", new ControlDto(owner?.ClientId, owner?.ClientName, owner?.Kind, owner?.ClientId == client.Id)));
        }
    }
}
