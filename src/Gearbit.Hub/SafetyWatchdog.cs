using Gearbit.Core.Components;
using Gearbit.Core.Robots;
using Gearbit.Hub.Programs;
using Gearbit.Hub.Rpc;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Gearbit.Hub;

/// <summary>
/// Страховка: останавливает моторы, если пульт замолчал дольше <see cref="HubOptions.RemoteWatchdogMs"/>
/// или клиент, который управлял роботом, отключился (закрыли вкладку, упала программа).
/// Режим замеров страхуется своим стражем (<see cref="ServiceMode.CheckWatchdogAsync"/>), он вызывается отсюда же.
/// </summary>
public sealed class SafetyWatchdog(
    RobotManager robots,
    ControlArbiter arbiter,
    ServiceMode service,
    ClientRegistry clients,
    ProgramRunner programs,
    HubOptions options,
    TimeProvider time,
    ILogger<SafetyWatchdog> logger) : BackgroundService
{
    public override Task StartAsync(CancellationToken cancellationToken)
    {
        clients.Disconnected += OnClientDisconnected;
        return base.StartAsync(cancellationToken);
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        clients.Disconnected -= OnClientDisconnected;
        await base.StopAsync(cancellationToken).ConfigureAwait(false);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(100), time);
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
            {
                await CheckAsync().ConfigureAwait(false);
                await service.CheckWatchdogAsync().ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    /// <summary>Одна проверка «кнопки мертвеца». Возвращает true, если робот остановлен.</summary>
    internal async Task<bool> CheckAsync()
    {
        if (arbiter.Owner is not { Kind: ControllerKind.Remote } ||
            robots.Active is not { State: RobotConnectionState.Connected } robot ||
            !robot.Components.OfType<IMotor>().Any(m => m.Power != 0) ||
            arbiter.SinceLastMotion < TimeSpan.FromMilliseconds(options.RemoteWatchdogMs))
        {
            return false;
        }

        await robot.StopAllAsync().ConfigureAwait(false);
        logger.LogInformation("Пульт молчит {Ms} мс — робот остановлен", options.RemoteWatchdogMs);
        clients.Broadcast("safety.event", new { reason = "watchdog", message = "Пульт перестал отвечать — робот остановлен." });
        return true;
    }

    private void OnClientDisconnected(object? sender, HubClient client)
    {
        _ = OnClientDisconnectedAsync(client);
    }

    private async Task OnClientDisconnectedAsync(HubClient client)
    {
        // Ушёл тот, кто вёл замеры: ручной режим заканчивается (моторы в 0), затем обычная остановка.
        var wasService = await service.EndIfOwnerAsync(client.Id).ConfigureAwait(false);
        // Программу остановил сам хаб (СТОП, «Стоп» в редакторе): моторы в 0, но это не авария.
        var stoppedProgram = programs.ConsumeStopped(client.Id);
        if ((!arbiter.Release(client.Id) && !wasService) || robots.Active is not { State: RobotConnectionState.Connected } robot)
        {
            return;
        }

        try
        {
            await robot.StopAllAsync().ConfigureAwait(false);
            if (!stoppedProgram)
            {
                clients.Broadcast("safety.event", new { reason = "clientLeft", message = $"«{client.Name}» отключился — робот остановлен." });
            }
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning(ex, "Не удалось остановить робота после ухода клиента {Id}", client.Id);
        }
    }
}
