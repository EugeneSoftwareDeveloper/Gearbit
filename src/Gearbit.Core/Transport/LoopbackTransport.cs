using Gearbit.Core.Robots;

namespace Gearbit.Core.Transport;

/// <summary>Виртуальное устройство на другом конце <see cref="LoopbackTransport"/> (эмулятор прошивки, тестовый двойник).</summary>
public interface IVirtualDevice
{
    /// <summary>Байты, отправленные хостом (ПК) устройству.</summary>
    void ReceiveFromHost(ReadOnlySpan<byte> data);

    /// <summary>Устройство отправляет байты хосту.</summary>
    event EventHandler<DataReceivedEventArgs>? SendToHost;

    void PowerOn();

    void PowerOff();
}

/// <summary>Транспорт без железа: соединяет драйвер с виртуальным устройством в памяти.</summary>
public sealed class LoopbackTransport : ITransport
{
    private readonly IVirtualDevice _device;
    private readonly int _chunkSize;

    public LoopbackTransport(IVirtualDevice device, int chunkSize = 20)
    {
        ArgumentNullException.ThrowIfNull(device);
        ArgumentOutOfRangeException.ThrowIfLessThan(chunkSize, 1);
        _device = device;
        _chunkSize = chunkSize;
    }

    public TransportState State { get; private set; } = TransportState.Disconnected;

    public event EventHandler<TransportStateChangedEventArgs>? StateChanged;

    public event EventHandler<DataReceivedEventArgs>? DataReceived;

    public Task ConnectAsync(CancellationToken cancellationToken)
    {
        if (State == TransportState.Connected)
        {
            return Task.CompletedTask;
        }

        SetState(TransportState.Connecting, null);
        _device.SendToHost += OnDeviceData;
        _device.PowerOn();
        SetState(TransportState.Connected, null);
        return Task.CompletedTask;
    }

    public Task DisconnectAsync()
    {
        if (State == TransportState.Disconnected)
        {
            return Task.CompletedTask;
        }

        _device.SendToHost -= OnDeviceData;
        _device.PowerOff();
        SetState(TransportState.Disconnected, "Отключено");
        return Task.CompletedTask;
    }

    public Task WriteAsync(ReadOnlyMemory<byte> data, CancellationToken cancellationToken)
    {
        if (State != TransportState.Connected)
        {
            throw new RobotException(RobotErrorCode.NotConnected, "Транспорт не подключён.");
        }

        // Режем на части так же, как настоящий BLE, — чтобы ловить ошибки сборки кадров в тестах.
        for (var offset = 0; offset < data.Length; offset += _chunkSize)
        {
            var length = Math.Min(_chunkSize, data.Length - offset);
            _device.ReceiveFromHost(data.Span.Slice(offset, length));
        }

        return Task.CompletedTask;
    }

    public async ValueTask DisposeAsync() => await DisconnectAsync().ConfigureAwait(false);

    private void OnDeviceData(object? sender, DataReceivedEventArgs e) => DataReceived?.Invoke(this, e);

    private void SetState(TransportState state, string? reason)
    {
        State = state;
        StateChanged?.Invoke(this, new TransportStateChangedEventArgs(state, reason));
    }
}
