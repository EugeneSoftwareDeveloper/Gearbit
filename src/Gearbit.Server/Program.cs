using Gearbit.Core.Transport;
using Gearbit.Hub;
using Gearbit.Transport.WinRtBle;
using Microsoft.Extensions.DependencyInjection.Extensions;

// Хаб Gearbit без окна: удобно для разработки и для Python/C#-клиентов.
// Интерфейс: http://localhost:5280 (порт меняется параметром --Hub:Port=5300).
var app = GearbitHub.Build(args, services =>
{
    services.TryAddEnumerable(ServiceDescriptor.Singleton<IDeviceScanner, WinRtBleScanner>());
    services.TryAddEnumerable(ServiceDescriptor.Singleton<ITransportFactory, WinRtBleTransportFactory>());
});

app.Lifetime.ApplicationStarted.Register(() =>
{
    var urls = string.Join(", ", app.Urls);
    Console.WriteLine();
    Console.WriteLine($"  Gearbit {HubMethods.Version} запущен: {urls}");
    Console.WriteLine("  Откройте адрес в браузере. Остановить: Ctrl+C.");
    Console.WriteLine();
});

await app.RunAsync();
