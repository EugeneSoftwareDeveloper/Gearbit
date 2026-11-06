using System.Text.Json;

namespace BotStudio.Core.Descriptors;

/// <summary>Каталог известных моделей роботов и сборок, загруженный из JSON-файлов.</summary>
public sealed class RobotCatalog
{
    public static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    public RobotCatalog(IEnumerable<DeviceDescriptor> devices, IEnumerable<BuildProfile> profiles)
    {
        Devices = devices.ToList();
        Profiles = profiles.ToList();
    }

    public IReadOnlyList<DeviceDescriptor> Devices { get; }

    public IReadOnlyList<BuildProfile> Profiles { get; }

    public static RobotCatalog Load(string devicesDirectory, string profilesDirectory)
    {
        var devices = ReadAll<DeviceDescriptor>(devicesDirectory);
        var profiles = ReadAll<BuildProfile>(profilesDirectory);
        return new RobotCatalog(devices, profiles);
    }

    public static T Parse<T>(string json) =>
        JsonSerializer.Deserialize<T>(json, JsonOptions) ?? throw new InvalidDataException($"Пустой JSON для {typeof(T).Name}.");

    public DeviceDescriptor? FindDevice(string id) =>
        Devices.FirstOrDefault(d => string.Equals(d.Id, id, StringComparison.OrdinalIgnoreCase));

    public BuildProfile? FindProfile(string id) =>
        Profiles.FirstOrDefault(p => string.Equals(p.Id, id, StringComparison.OrdinalIgnoreCase));

    public IEnumerable<BuildProfile> ProfilesFor(string deviceId) =>
        Profiles.Where(p => string.Equals(p.Device, deviceId, StringComparison.OrdinalIgnoreCase));

    /// <summary>Подобрать описание по рекламе BLE-устройства.</summary>
    public DeviceDescriptor? Match(string? advertisedName, IEnumerable<Guid> advertisedServices)
    {
        var services = advertisedServices.ToList();
        return Devices.FirstOrDefault(d => d.Match.Matches(advertisedName, services));
    }

    private static List<T> ReadAll<T>(string directory)
    {
        if (!Directory.Exists(directory))
        {
            return [];
        }

        var result = new List<T>();
        foreach (var file in Directory.EnumerateFiles(directory, "*.json").Order(StringComparer.Ordinal))
        {
            try
            {
                result.Add(Parse<T>(File.ReadAllText(file)));
            }
            catch (JsonException ex)
            {
                throw new InvalidDataException($"Ошибка в файле {Path.GetFileName(file)}: {ex.Message}", ex);
            }
        }

        return result;
    }
}
