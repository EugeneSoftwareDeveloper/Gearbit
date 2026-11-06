using Gearbit.Core.Components;
using Gearbit.Core.Robots;
using Gearbit.Hub.Rpc;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Gearbit.Hub;

/// <summary>
/// Страховка: останавливает моторы, если пульт замолчал дольше <see cref="HubOptions.RemoteWatchdogMs"/>
/// или клиент, который управлял роботом, отключился (закрыли вкладку, упала программа).
/// </summary>
public sealed class SafetyWatchdog(
    RobotManager robots,
    ControlArbiter arbiter,
    ClientRegistry clients,
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
        if (!arbiter.Release(client.Id) || robots.Active is not { State: RobotConnectionState.Connected } robot)
        {
            return;
        }

        _ = StopAfterClientLeftAsync(robot, client);
    }

    private async Task StopAfterClientLeftAsync(ProtocolRobot robot, HubClient client)
    {
        try
        {
            await robot.StopAllAsync().ConfigureAwait(false);
            clients.Broadcast("safety.event", new { reason = "clientLeft", message = $"«{client.Name}» отключился — робот остановлен." });
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning(ex, "Не удалось остановить робота после ухода клиента {Id}", client.Id);
        }
    }
}
