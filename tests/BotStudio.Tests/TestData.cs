using BotStudio.Core.Descriptors;

namespace BotStudio.Tests;

internal static class TestData
{
    public static string DevicesDirectory => Path.Combine(AppContext.BaseDirectory, "devices");

    public static string ProfilesDirectory => Path.Combine(AppContext.BaseDirectory, "profiles");

    public static RobotCatalog Catalog { get; } = RobotCatalog.Load(DevicesDirectory, ProfilesDirectory);

    public static DeviceDescriptor SuperBot => Catalog.FindDevice("tudao-superbot")!;

    public static BuildProfile Car => Catalog.FindProfile("superbot-car")!;

    public static byte[] Hex(string hex) => Convert.FromHexString(hex.Replace(" ", "", StringComparison.Ordinal));
}
