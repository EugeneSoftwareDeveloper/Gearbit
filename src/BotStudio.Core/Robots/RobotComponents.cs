using BotStudio.Core.Components;
using BotStudio.Core.Descriptors;
using BotStudio.Core.Protocol;

namespace BotStudio.Core.Robots;

/// <summary>Общая часть компонентов <see cref="ProtocolRobot"/>.</summary>
internal abstract class RobotComponentBase(ComponentDescriptor descriptor, ComponentKind kind) : IRobotComponent
{
    public string Id { get; } = descriptor.Id;

    public string Title { get; } = descriptor.Title ?? descriptor.Id;

    public ComponentKind Kind { get; } = kind;

    public string? RequiresFirmware { get; } = descriptor.RequiresFirmware;

    public bool Available { get; private set; } = descriptor.RequiresFirmware is null;

    public void UpdateAvailability(string? firmware) =>
        Available = RequiresFirmware is null || string.Equals(RequiresFirmware, firmware, StringComparison.OrdinalIgnoreCase);
}

internal sealed class MotorComponent(ComponentDescriptor descriptor, ProtocolRobot robot)
    : RobotComponentBase(descriptor, ComponentKind.Motor), IMotor
{
    public int Power => robot.GetMotorPower(Id);

    public void SetPower(int percent) => robot.SetMotorPower(Id, percent);
}

internal sealed class LightComponent(ComponentDescriptor descriptor, ProtocolRobot robot)
    : RobotComponentBase(descriptor, ComponentKind.Light), ILight
{
    public RobotColor Color => robot.GetLight(Id);

    public void SetColor(RobotColor color) => robot.SetLight(Id, color);
}

internal sealed class DistanceComponent(ComponentDescriptor descriptor, int maxLevel, DistanceCalibration? calibration)
    : RobotComponentBase(descriptor, ComponentKind.Distance), IDistanceSensor
{
    public int? Level { get; private set; }

    public int MaxLevel { get; } = maxLevel;

    public double? Centimeters =>
        Level is { } level && calibration?.LevelToCm is { } table && level >= 0 && level < table.Count ? table[level] : null;

    public void Update(RobotTelemetry telemetry)
    {
        if (telemetry.Distances.TryGetValue(Id, out var level))
        {
            Level = level;
        }
    }
}

internal sealed class ImuComponent(ComponentDescriptor descriptor) : RobotComponentBase(descriptor, ComponentKind.Imu), IImu
{
    public TiltReading? Tilt { get; private set; }

    public void Update(RobotTelemetry telemetry) => Tilt = telemetry.Tilt ?? Tilt;
}

internal sealed class BatteryComponent(ComponentDescriptor descriptor) : RobotComponentBase(descriptor, ComponentKind.Battery), IBattery
{
    public int? Raw { get; private set; }

    public bool Low { get; private set; }

    public void Update(RobotTelemetry telemetry)
    {
        Raw = telemetry.BatteryRaw ?? Raw;
        Low = telemetry.BatteryLow ?? false;
    }
}
