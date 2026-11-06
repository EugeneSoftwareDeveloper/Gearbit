using BotStudio.Core.Descriptors;

namespace BotStudio.Core.Transport;

public enum TransportState
{
    Disconnected,
    Connecting,
    Connected,
    Faulted,
}

public sealed class TransportStateChangedEventArgs(TransportState state, string? reason) : EventArgs
{
    public TransportState State { get; } = state;

    public string? Reason { get; } = reason;
}

public sealed class DataReceivedEventArgs(ReadOnlyMemory<byte> data) : EventArgs
{
    public ReadOnlyMemory<byte> Data { get; } = data;
}

/// <summary>
/// Транспорт: передать и получить байты. Ничего не знает о формате кадров.
/// Реализации: WinRT BLE, Loopback (эмулятор и тесты), позже Serial/TCP.
/// </summary>
public interface ITransport : IAsyncDisposable
{
    TransportState State { get; }

    event EventHandler<TransportStateChangedEventArgs>? StateChanged;

    event EventHandler<DataReceivedEventArgs>? DataReceived;

    Task ConnectAsync(CancellationToken cancellationToken);

    Task DisconnectAsync();

    /// <summary>Отправить данные. Транспорт сам режет их на части допустимого размера.</summary>
    Task WriteAsync(ReadOnlyMemory<byte> data, CancellationToken cancellationToken);
}

/// <summary>Найденное при сканировании устройство.</summary>
/// <param name="Id">Уникальный id внутри вида транспорта, например «ble:AABBCCDDEEFF» или «emulator:superbot».</param>
public sealed record DiscoveredDevice(
    string Id,
    string Name,
    int? Rssi,
    string TransportKind,
    IReadOnlyList<Guid> Services);

/// <summary>Сканер устройств одного вида транспорта.</summary>
public interface IDeviceScanner
{
    string TransportKind { get; }

    Task<IReadOnlyList<DiscoveredDevice>> ScanAsync(TimeSpan duration, CancellationToken cancellationToken);
}

/// <summary>Создаёт транспорт для найденного устройства.</summary>
public interface ITransportFactory
{
    string TransportKind { get; }

    ITransport Create(DiscoveredDevice device, DeviceDescriptor descriptor);
}
