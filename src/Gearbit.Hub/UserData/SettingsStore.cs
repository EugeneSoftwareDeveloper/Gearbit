using System.Text.Json;
using System.Text.Json.Nodes;

namespace Gearbit.Hub.UserData;

/// <summary>
/// Настройки интерфейса в файле settings.json (в папке данных, см. <see cref="HubOptions.DataDirectory"/>).
/// Хаб их не разбирает и хранит объект JSON как есть: окно Gearbit и браузер видят одни и те же настройки,
/// и они не пропадают, если сбросить данные WebView2.
/// </summary>
public sealed class SettingsStore(HubOptions options)
{
    /// <summary>Настройки — маленький объект; больше этого хаб не примет.</summary>
    public const int MaxBytes = 64 * 1024;

    private readonly Lock _lock = new();

    public string FilePath => Path.Combine(options.EffectiveDataDirectory, "settings.json");

    /// <summary>Сохранённые настройки или null, если их ещё нет (или файл испорчен).</summary>
    public JsonObject? Read()
    {
        lock (_lock)
        {
            if (!File.Exists(FilePath))
            {
                return null;
            }

            try
            {
                return JsonNode.Parse(File.ReadAllText(FilePath)) as JsonObject;
            }
            catch (JsonException)
            {
                return null;
            }
        }
    }

    public void Write(JsonObject settings)
    {
        ArgumentNullException.ThrowIfNull(settings);
        lock (_lock)
        {
            AtomicFile.WriteAllText(FilePath, settings.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        }
    }
}

/// <summary>Запись файла целиком: сначала во временный, потом замена. Оборвалась запись — старый файл цел.</summary>
internal static class AtomicFile
{
    public static void WriteAllText(string path, string text)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temp = path + ".tmp";
        File.WriteAllText(temp, text);
        File.Move(temp, path, overwrite: true);
    }
}
