using BotStudio.Core.Components;
using BotStudio.Core.Descriptors;
using BotStudio.Core.Robots;
using BotStudio.Emulator;

namespace BotStudio.Hub;

/// <summary>Формы данных, которые хаб отдаёт клиентам. Имена полей — camelCase (см. docs/dev/hub-api.md).</summary>
public sealed record ComponentDto(string Id, ComponentKind Kind, string Title, bool Available, IReadOnlyList<string> Aliases);

public sealed record RobotDto(
    string Id,
    string Name,
    RobotConnectionState State,
    string DeviceId,
    string DeviceTitle,
    string DeviceStatus,
    string? ProfileId,
    string? ProfileTitle,
    string? Uid,
    string? Firmware,
    int MaxPowerPercent,
    int ProfileMaxPowerPercent,
    bool HasDrive,
    IReadOnlyList<ComponentDto> Components)
{
    public static RobotDto From(IRobot robot)
    {
        ArgumentNullException.ThrowIfNull(robot);
        var aliases = robot.Profile?.Aliases ?? new Dictionary<string, string>();
        return new RobotDto(
            robot.Id,
            robot.Name,
            robot.State,
            robot.Descriptor.Id,
            robot.Descriptor.Title,
            robot.Descriptor.Status,
            robot.Profile?.Id,
            robot.Profile?.Title,
            robot.DeviceUid,
            robot.Firmware,
            robot.MaxPowerPercent,
            robot.Profile?.Limits.MaxPowerPercent ?? 100,
            robot.Drive is not null,
            robot.Components
                .Select(c => new ComponentDto(
                    c.Id,
                    c.Kind,
                    c.Title,
                    c.Available,
                    aliases.Where(a => string.Equals(a.Value, c.Id, StringComparison.OrdinalIgnoreCase)).Select(a => a.Key).ToList()))
                .ToList());
    }
}

public sealed record TiltDto(int X, int Y, int Acceleration);

/// <summary>Показания и выходы робота одним снимком — для пульта и панели датчиков.</summary>
public sealed record TelemetryDto(
    IReadOnlyDictionary<string, int?> Distances,
    IReadOnlyDictionary<string, double?> DistancesCm,
    TiltDto? Tilt,
    int? Battery,
    bool BatteryLow,
    string? Firmware,
    IReadOnlyDictionary<string, int> Motors,
    IReadOnlyDictionary<string, RobotColor> Lights,
    IReadOnlyDictionary<string, bool> Available)
{
    public static TelemetryDto From(IRobot robot)
    {
        ArgumentNullException.ThrowIfNull(robot);
        var distances = robot.Components.OfType<IDistanceSensor>().ToList();
        var imu = robot.Components.OfType<IImu>().FirstOrDefault();
        var battery = robot.Components.OfType<IBattery>().FirstOrDefault();
        return new TelemetryDto(
            distances.ToDictionary(d => d.Id, d => d.Level),
            distances.ToDictionary(d => d.Id, d => d.Centimeters),
            imu?.Tilt is { } t && imu.Available ? new TiltDto(t.X, t.Y, t.Acceleration) : null,
            battery?.Raw,
            battery?.Low ?? false,
            robot.Firmware,
            robot.Components.OfType<IMotor>().ToDictionary(m => m.Id, m => m.Power),
            robot.Components.OfType<ILight>().ToDictionary(l => l.Id, l => l.Color),
            robot.Components.ToDictionary(c => c.Id, c => c.Available));
    }
}

public sealed record DeviceSummaryDto(string Id, string Title, string Status, string Protocol, IReadOnlyList<string> Components);

public sealed record ProfileSummaryDto(string Id, string Title, string Device, string Status, int MaxPowerPercent, IReadOnlyDictionary<string, string> Aliases);

public sealed record CatalogDto(IReadOnlyList<DeviceSummaryDto> Devices, IReadOnlyList<ProfileSummaryDto> Profiles)
{
    public static CatalogDto From(RobotCatalog catalog)
    {
        ArgumentNullException.ThrowIfNull(catalog);
        return new CatalogDto(
            catalog.Devices.Select(d => new DeviceSummaryDto(d.Id, d.Title, d.Status, d.ProtocolName, d.Components.Select(c => c.Id).ToList())).ToList(),
            catalog.Profiles.Select(p => new ProfileSummaryDto(p.Id, p.Title, p.Device, p.Status, p.Limits.MaxPowerPercent, p.Aliases)).ToList());
    }
}

public sealed record ScanDeviceDto(string Id, string Name, int? Rssi, string Transport, string? DeviceId, string? DeviceTitle, bool Known);

public sealed record TraceDto(string Dir, string Hex, string? Note, long T);

public sealed record ControlDto(string? ClientId, string? ClientName, ControllerKind? Kind, bool Mine);

public sealed record EmulatorDto(
    bool Active,
    double RoomWidth,
    double RoomHeight,
    double RobotRadius,
    double X,
    double Y,
    double Heading,
    bool Bumped,
    IReadOnlyList<int> Motors,
    IReadOnlyList<int> Lights,
    IReadOnlyDictionary<string, double> SensorCm,
    IReadOnlyDictionary<string, int> SensorLevels,
    IReadOnlyDictionary<string, double> SensorAngles,
    int Battery,
    IReadOnlyList<Obstacle> Obstacles)
{
    public static EmulatorDto From(EmulatorSnapshot s)
    {
        ArgumentNullException.ThrowIfNull(s);
        return new EmulatorDto(
            s.PoweredOn, s.RoomWidth, s.RoomHeight, s.RobotRadius,
            Math.Round(s.Pose.X, 2), Math.Round(s.Pose.Y, 2), Math.Round(s.Pose.Heading, 1),
            s.Bumped, s.Motors, s.Lights.Select(b => (int)b).ToList(), s.SensorCm, s.SensorLevels, s.SensorAngles, s.Battery, s.Obstacles);
    }
}
