using System.IO;
using System.Net.Http;
using System.Windows;
using Gearbit.Core.Transport;
using Gearbit.Hub;
using Gearbit.Transport.WinRtBle;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Gearbit.App;

/// <summary>
/// Точка входа: запускает хаб внутри процесса и открывает окно с веб-интерфейсом.
/// Если хаб уже работает (второе окно или Gearbit.Server), окно подключается к нему.
/// </summary>
public partial class App : Application
{
    private WebApplication? _hub;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        var window = new MainWindow();
        MainWindow = window;
        window.Show();

        try
        {
            var url = await StartHubAsync(e.Args).ConfigureAwait(true);
            await window.OpenAsync(url).ConfigureAwait(true);
        }
#pragma warning disable CA1031 // Любая ошибка запуска показывается пользователю, а не роняет окно.
        catch (Exception ex)
#pragma warning restore CA1031
        {
            window.ShowError("Не удалось запустить Gearbit", ex.Message);
        }
    }

    private async Task<string> StartHubAsync(string[] args)
    {
        var hub = GearbitHub.Build(args, services =>
        {
            services.TryAddEnumerable(ServiceDescriptor.Singleton<IDeviceScanner, WinRtBleScanner>());
            services.TryAddEnumerable(ServiceDescriptor.Singleton<ITransportFactory, WinRtBleTransportFactory>());
        });
        var port = hub.Services.GetRequiredService<HubOptions>().Port;
        var url = $"http://localhost:{port}/";

        try
        {
            await hub.StartAsync().ConfigureAwait(true);
            _hub = hub;
            return url;
        }
        catch (IOException)
        {
            await hub.DisposeAsync().ConfigureAwait(true);
            if (await IsGearbitRunningAsync(url).ConfigureAwait(true))
            {
                // Порт занят нашим же хабом: открываем ещё один пульт к нему.
                return url;
            }

            throw new InvalidOperationException($"Порт {port} занят другой программой. Укажите другой: Gearbit.exe --Hub:Port=5300");
        }
    }

    private static async Task<bool> IsGearbitRunningAsync(string url)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
            var info = await http.GetStringAsync(new Uri(new Uri(url), "api/info")).ConfigureAwait(false);
            return info.Contains("\"hub\":\"Gearbit\"", StringComparison.Ordinal);
        }
        catch (HttpRequestException)
        {
            return false;
        }
        catch (TaskCanceledException)
        {
            return false;
        }
    }

    protected override void OnExit(ExitEventArgs e)
    {
        // Остановка хаба отключает робота, а перед этим глушит моторы.
        if (_hub is { } hub)
        {
            Task.Run(async () =>
            {
                await hub.StopAsync().ConfigureAwait(false);
                await hub.DisposeAsync().ConfigureAwait(false);
            }).Wait(TimeSpan.FromSeconds(5));
        }

        base.OnExit(e);
    }
}
