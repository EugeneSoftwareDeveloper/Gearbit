using System.Collections.Concurrent;
using System.Globalization;
using BotStudio.Core.Transport;
using Windows.Devices.Bluetooth.Advertisement;

namespace BotStudio.Transport.WinRtBle;

/// <summary>Поиск BLE-устройств по рекламным пакетам (активное сканирование — чтобы получить имя).</summary>
public sealed class WinRtBleScanner : IDeviceScanner
{
    public const string Kind = "ble";

    public string TransportKind => Kind;

    public async Task<IReadOnlyList<DiscoveredDevice>> ScanAsync(TimeSpan duration, CancellationToken cancellationToken)
    {
        var found = new ConcurrentDictionary<ulong, DiscoveredDevice>();
        var watcher = new BluetoothLEAdvertisementWatcher { ScanningMode = BluetoothLEScanningMode.Active };

        watcher.Received += (_, args) =>
        {
            var name = args.Advertisement.LocalName;
            var services = args.Advertisement.ServiceUuids.ToList();
            found.AddOrUpdate(
                args.BluetoothAddress,
                _ => new DiscoveredDevice(FormatId(args.BluetoothAddress), name, args.RawSignalStrengthInDBm, Kind, services),
                (_, existing) => existing with
                {
                    // Имя часто приходит только в ответе на активное сканирование — не теряем его.
                    Name = string.IsNullOrEmpty(name) ? existing.Name : name,
                    Rssi = args.RawSignalStrengthInDBm,
                    Services = existing.Services.Union(services).ToList(),
                });
        };

        watcher.Start();
        try
        {
            await Task.Delay(duration, cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            watcher.Stop();
        }

        return found.Values.OrderByDescending(d => d.Rssi ?? int.MinValue).ToList();
    }

    public static string FormatId(ulong address) => "ble:" + address.ToString("X12", CultureInfo.InvariantCulture);

    public static bool TryParseId(string id, out ulong address)
    {
        address = 0;
        return id is not null &&
               id.StartsWith("ble:", StringComparison.OrdinalIgnoreCase) &&
               ulong.TryParse(id.AsSpan(4), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out address);
    }
}
