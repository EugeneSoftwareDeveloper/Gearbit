using System.Runtime.InteropServices.WindowsRuntime;
using BotStudio.Core.Descriptors;
using BotStudio.Core.Transport;
using Windows.Devices.Bluetooth;
using Windows.Devices.Bluetooth.GenericAttributeProfile;

namespace BotStudio.Transport.WinRtBle;

public sealed class WinRtBleTransportFactory : ITransportFactory
{
    public string TransportKind => WinRtBleScanner.Kind;

    public ITransport Create(DiscoveredDevice device, DeviceDescriptor descriptor)
    {
        ArgumentNullException.ThrowIfNull(device);
        ArgumentNullException.ThrowIfNull(descriptor);
        return WinRtBleScanner.TryParseId(device.Id, out var address)
            ? new WinRtBleTransport(address, descriptor.Transport)
            : throw new ArgumentException($"Это не BLE-устройство: {device.Id}", nameof(device));
    }
}

/// <summary>
/// GATT-соединение «как UART»: одна характеристика на запись, одна на уведомления (Nordic UART и похожие).
/// </summary>
public sealed class WinRtBleTransport : ITransport
{
    private readonly ulong _address;
    private readonly TransportDescriptor _settings;
    private BluetoothLEDevice? _device;
    private GattDeviceService? _service;
    private GattCharacteristic? _write;
    private GattCharacteristic? _notify;
    private bool _closing;

    public WinRtBleTransport(ulong address, TransportDescriptor settings)
    {
        ArgumentNullException.ThrowIfNull(settings);
        _address = address;
        _settings = settings;
    }

    public TransportState State { get; private set; } = TransportState.Disconnected;

    public event EventHandler<TransportStateChangedEventArgs>? StateChanged;

    public event EventHandler<DataReceivedEventArgs>? DataReceived;

    public async Task ConnectAsync(CancellationToken cancellationToken)
    {
        if (State == TransportState.Connected)
        {
            return;
        }

        _closing = false;
        SetState(TransportState.Connecting, null);
        try
        {
            _device = await BluetoothLEDevice.FromBluetoothAddressAsync(_address).AsTask(cancellationToken).ConfigureAwait(false)
                ?? throw new InvalidOperationException("Устройство не найдено. Включён ли робот и Bluetooth на ПК?");
            _device.ConnectionStatusChanged += OnConnectionStatusChanged;

            var serviceId = ParseUuid(_settings.Service, "service");
            var services = await _device.GetGattServicesForUuidAsync(serviceId, BluetoothCacheMode.Uncached).AsTask(cancellationToken).ConfigureAwait(false);
            if (services.Status != GattCommunicationStatus.Success || services.Services.Count == 0)
            {
                throw new InvalidOperationException($"Сервис {serviceId} не найден (статус {services.Status}).");
            }

            _service = services.Services[0];
            _write = await FindCharacteristicAsync(_service, ParseUuid(_settings.Write, "write"), cancellationToken).ConfigureAwait(false);
            _notify = await FindCharacteristicAsync(_service, ParseUuid(_settings.Notify, "notify"), cancellationToken).ConfigureAwait(false);

            _notify.ValueChanged += OnValueChanged;
            var cccd = await _notify.WriteClientCharacteristicConfigurationDescriptorAsync(GattClientCharacteristicConfigurationDescriptorValue.Notify)
                .AsTask(cancellationToken).ConfigureAwait(false);
            if (cccd != GattCommunicationStatus.Success)
            {
                throw new InvalidOperationException($"Не удалось подписаться на уведомления (статус {cccd}).");
            }

            SetState(TransportState.Connected, null);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            Cleanup();
            SetState(TransportState.Faulted, ex.Message);
            throw;
        }
    }

    public Task DisconnectAsync()
    {
        if (State == TransportState.Disconnected)
        {
            return Task.CompletedTask;
        }

        _closing = true;
        Cleanup();
        SetState(TransportState.Disconnected, "Отключено");
        return Task.CompletedTask;
    }

    public async Task WriteAsync(ReadOnlyMemory<byte> data, CancellationToken cancellationToken)
    {
        var characteristic = _write;
        if (State != TransportState.Connected || characteristic is null)
        {
            throw new InvalidOperationException("Транспорт не подключён.");
        }

        var option = _settings.WriteWithResponse ? GattWriteOption.WriteWithResponse : GattWriteOption.WriteWithoutResponse;
        var chunkSize = Math.Max(1, _settings.ChunkSize);
        for (var offset = 0; offset < data.Length; offset += chunkSize)
        {
            var chunk = data.Slice(offset, Math.Min(chunkSize, data.Length - offset)).ToArray();
            var result = await characteristic.WriteValueWithResultAsync(chunk.AsBuffer(), option).AsTask(cancellationToken).ConfigureAwait(false);
            if (result.Status != GattCommunicationStatus.Success)
            {
                throw new InvalidOperationException($"Ошибка записи BLE: {result.Status}.");
            }
        }
    }

    public ValueTask DisposeAsync() => new(DisconnectAsync());

    private static async Task<GattCharacteristic> FindCharacteristicAsync(GattDeviceService service, Guid uuid, CancellationToken cancellationToken)
    {
        var result = await service.GetCharacteristicsForUuidAsync(uuid, BluetoothCacheMode.Uncached).AsTask(cancellationToken).ConfigureAwait(false);
        return result.Status == GattCommunicationStatus.Success && result.Characteristics.Count > 0
            ? result.Characteristics[0]
            : throw new InvalidOperationException($"Характеристика {uuid} не найдена (статус {result.Status}).");
    }

    private static Guid ParseUuid(string? value, string name) =>
        Guid.TryParse(value, out var uuid) ? uuid : throw new InvalidOperationException($"В описании устройства не задан UUID «{name}».");

    private void OnValueChanged(GattCharacteristic sender, GattValueChangedEventArgs args) =>
        DataReceived?.Invoke(this, new DataReceivedEventArgs(args.CharacteristicValue.ToArray()));

    private void OnConnectionStatusChanged(BluetoothLEDevice sender, object args)
    {
        if (sender.ConnectionStatus == BluetoothConnectionStatus.Disconnected && !_closing && State == TransportState.Connected)
        {
            Cleanup();
            SetState(TransportState.Disconnected, "Связь с роботом потеряна");
        }
    }

    private void Cleanup()
    {
        if (_notify is not null)
        {
            _notify.ValueChanged -= OnValueChanged;
        }

        if (_device is not null)
        {
            _device.ConnectionStatusChanged -= OnConnectionStatusChanged;
        }

        // Освобождение сервиса и устройства закрывает соединение в Windows.
        _service?.Dispose();
        _device?.Dispose();
        _notify = null;
        _write = null;
        _service = null;
        _device = null;
    }

    private void SetState(TransportState state, string? reason)
    {
        State = state;
        StateChanged?.Invoke(this, new TransportStateChangedEventArgs(state, reason));
    }
}
