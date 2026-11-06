using BotStudio.Core.Descriptors;
using BotStudio.Core.Transport;
using BotStudio.Protocols.Tudao;

namespace BotStudio.Emulator;

/// <summary>
/// Делает эмулятор «устройством» для приложения: он находится при сканировании
/// и подключается так же, как настоящий робот, только через <see cref="LoopbackTransport"/>.
/// </summary>
public sealed class EmulatorHost(EmulatorSettings? settings = null, TimeProvider? timeProvider = null) : IDeviceScanner, ITransportFactory
{
    public const string Kind = "emulator";
    public const string DeviceId = "emulator:superbot";

    private static readonly Guid NordicUartService = Guid.Parse("6e400001-b5a3-f393-e0a9-e50e24dcca9e");

    public string TransportKind => Kind;

    public EmulatorWorld World { get; } = new(settings ?? new EmulatorSettings());

    /// <summary>Эмулятор последнего подключения (для отрисовки комнаты).</summary>
    public TudaoEmulator? Current { get; private set; }

    public Task<IReadOnlyList<DiscoveredDevice>> ScanAsync(TimeSpan duration, CancellationToken cancellationToken)
    {
        IReadOnlyList<DiscoveredDevice> devices = [new DiscoveredDevice(DeviceId, "Nordic_TUDAO (эмулятор)", -40, Kind, [NordicUartService])];
        return Task.FromResult(devices);
    }

    public ITransport Create(DiscoveredDevice device, DeviceDescriptor descriptor)
    {
        ArgumentNullException.ThrowIfNull(descriptor);
        Current?.Dispose();
        Current = new TudaoEmulator(TudaoOptions.FromJson(descriptor.Protocol), World, timeProvider);
        return new LoopbackTransport(Current, descriptor.Transport.ChunkSize);
    }
}
