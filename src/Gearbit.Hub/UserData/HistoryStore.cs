using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Gearbit.Hub.UserData;

/// <summary>Снимок программы без текста — для списка в окне «История».</summary>
/// <param name="Id">Имя файла без .json: время снимка UTC, <c>yyyyMMdd-HHmmss-fff</c>.</param>
/// <param name="Reason">Почему сделан снимок: <c>new</c>, <c>example</c>, <c>open</c>, <c>restore</c>, <c>run</c>, <c>auto</c>, <c>leave</c>, <c>start</c>.</param>
public sealed record HistoryEntry(string Id, DateTimeOffset Time, string Reason, string? Name, int Size);

/// <summary>Снимок целиком.</summary>
public sealed record HistorySnapshot(string Id, DateTimeOffset Time, string Reason, string? Name, string Content);

/// <summary>
/// Локальная история программ, как Local History в IDE: снимки в папке данных
/// (<c>%LOCALAPPDATA%\Gearbit\History\{blocks|python|csharp}</c>). Не в %TEMP%: его чистит Windows.
/// Одинаковый снимок подряд не пишется. Хранится не больше <see cref="MaxCount"/> снимков каждого вида,
/// снимки старше <see cref="MaxAge"/> удаляются, но последние <see cref="KeepAlways"/> остаются всегда.
/// Имена файлов строит хаб: в путь не попадает ничего из запроса, кроме проверенных вида и id.
/// </summary>
public sealed partial class HistoryStore(HubOptions options, TimeProvider time)
{
    /// <summary>Предел тела запроса со снимком.</summary>
    public const int MaxBytes = 2 * 1024 * 1024;

    public const int MaxCount = 200;

    public const int KeepAlways = 20;

    public const int MaxNameLength = 120;

    public static readonly TimeSpan MaxAge = TimeSpan.FromDays(30);

    public static readonly IReadOnlySet<string> Kinds = new HashSet<string>(StringComparer.Ordinal) { "blocks", "python", "csharp" };

    private const string IdFormat = "yyyyMMdd-HHmmss-fff";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly Lock _lock = new();

    // Список снимков каждого вида (новые сначала): файлы читаются один раз, дальше хаб — единственный писатель.
    private readonly Dictionary<string, List<HistoryEntry>> _entries = new(StringComparer.Ordinal);

    public string Root => Path.Combine(options.EffectiveDataDirectory, "History");

    public static bool IsKind(string? kind) => kind is not null && Kinds.Contains(kind);

    public static bool IsId(string? id) => id is not null && IdPattern().IsMatch(id);

    public static bool IsReason(string? reason) => reason is not null && ReasonPattern().IsMatch(reason);

    /// <summary>
    /// Сохранить снимок. Если текст совпадает с последним снимком, новый файл не пишется:
    /// возвращается последний снимок и <c>Saved = false</c>.
    /// </summary>
    public (HistoryEntry Entry, bool Saved) Add(string kind, string reason, string? name, string content)
    {
        CheckKind(kind);
        ArgumentNullException.ThrowIfNull(content);
        if (!IsReason(reason))
        {
            throw new ArgumentException("Неизвестная причина снимка.", nameof(reason));
        }

        name = name?.Trim();
        if (string.IsNullOrEmpty(name))
        {
            name = null;
        }
        else if (name.Length > MaxNameLength)
        {
            name = name[..MaxNameLength];
        }

        lock (_lock)
        {
            var folder = Path.Combine(Root, kind);
            var entries = Entries(kind, folder);
            if (entries.Count > 0 && ReadFile(folder, entries[0].Id) is { } last && last.Content == content)
            {
                return (ToEntry(last), false);
            }

            // Время снимка — имя файла. Два снимка в одну миллисекунду: второй на 1 мс позже.
            var now = time.GetUtcNow();
            now = new DateTimeOffset(now.Ticks - (now.Ticks % TimeSpan.TicksPerMillisecond), TimeSpan.Zero);
            if (entries.Count > 0 && ParseId(entries[0].Id) is { } newest && now <= newest)
            {
                now = newest.AddMilliseconds(1);
            }

            var snapshot = new HistorySnapshot(now.ToString(IdFormat, CultureInfo.InvariantCulture), now, reason, name, content);
            AtomicFile.WriteAllText(FilePath(folder, snapshot.Id), JsonSerializer.Serialize(snapshot, Json));
            var entry = ToEntry(snapshot);
            entries.Insert(0, entry);
            Prune(folder, entries);
            return (entry, true);
        }
    }

    /// <summary>Снимки вида, новые сначала.</summary>
    public IReadOnlyList<HistoryEntry> List(string kind)
    {
        CheckKind(kind);
        lock (_lock)
        {
            return [.. Entries(kind, Path.Combine(Root, kind))];
        }
    }

    /// <summary>Один снимок или null, если его нет (или файл испорчен).</summary>
    public HistorySnapshot? Get(string kind, string id)
    {
        CheckKind(kind);
        if (!IsId(id))
        {
            return null;
        }

        lock (_lock)
        {
            return ReadFile(Path.Combine(Root, kind), id);
        }
    }

    private void Prune(string folder, List<HistoryEntry> entries)
    {
        var oldest = time.GetUtcNow() - MaxAge;
        for (var i = entries.Count - 1; i >= KeepAlways; i--)
        {
            if (i >= MaxCount || entries[i].Time < oldest)
            {
                TryDelete(FilePath(folder, entries[i].Id));
                entries.RemoveAt(i);
            }
        }
    }

    /// <summary>Снимки вида, новые сначала. Испорченные и чужие файлы в список не попадают и не удаляются.</summary>
    private List<HistoryEntry> Entries(string kind, string folder)
    {
        if (_entries.TryGetValue(kind, out var cached))
        {
            return cached;
        }

        List<HistoryEntry> entries = !Directory.Exists(folder)
            ? []
            : [.. Directory.EnumerateFiles(folder, "*.json")
                .Select(Path.GetFileNameWithoutExtension)
                .OfType<string>()
                .Where(IsId)
                .OrderDescending(StringComparer.Ordinal)
                .Select(id => ReadFile(folder, id))
                .OfType<HistorySnapshot>()
                .Select(ToEntry)];
        _entries[kind] = entries;
        return entries;
    }

    private static HistorySnapshot? ReadFile(string folder, string id)
    {
        var path = FilePath(folder, id);
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            var snapshot = JsonSerializer.Deserialize<HistorySnapshot>(File.ReadAllText(path, Encoding.UTF8), Json);
            return snapshot is { Content: not null, Reason: not null } ? snapshot with { Id = id } : null;
        }
        catch (Exception e) when (e is JsonException or IOException)
        {
            return null;
        }
    }

    private static HistoryEntry ToEntry(HistorySnapshot s) => new(s.Id, s.Time, s.Reason, s.Name, s.Content.Length);

    private static DateTimeOffset? ParseId(string id) =>
        DateTimeOffset.TryParseExact(id, IdFormat, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var when)
            ? when
            : null;

    private static string FilePath(string folder, string id) => Path.Combine(folder, id + ".json");

    private static void CheckKind(string kind)
    {
        if (!IsKind(kind))
        {
            throw new ArgumentException("Неизвестный вид программы.", nameof(kind));
        }
    }

    private static void TryDelete(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch (IOException)
        {
            // Файл занят (антивирус, проводник): удалим при следующем снимке.
        }
        catch (UnauthorizedAccessException)
        {
        }
    }

    [GeneratedRegex(@"^\d{8}-\d{6}-\d{3}$")]
    private static partial Regex IdPattern();

    [GeneratedRegex("^[a-z]{1,16}$")]
    private static partial Regex ReasonPattern();
}
