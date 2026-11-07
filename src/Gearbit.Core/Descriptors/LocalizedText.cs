using System.Text.Json;
using System.Text.Json.Serialization;

namespace Gearbit.Core.Descriptors;

/// <summary>
/// Текст на нескольких языках из devices/*.json и profiles/*.json: строка (<c>"Машинка"</c>)
/// или объект по языкам (<c>{"ru": "Машинка", "en": "Car"}</c>). Строка подходит любому языку,
/// поэтому старые и чужие описания читаются как раньше. В JSON хаба уходит в том же виде:
/// язык выбирает интерфейс.
/// </summary>
[JsonConverter(typeof(LocalizedTextConverter))]
public sealed class LocalizedText : IEquatable<LocalizedText>
{
    /// <summary>Язык по умолчанию: на нём написана основная документация и описания.</summary>
    public const string DefaultLanguage = "ru";

    private readonly string? _any;
    private readonly IReadOnlyDictionary<string, string> _byLanguage;

    public static readonly LocalizedText Empty = new("");

    public LocalizedText(string text)
    {
        _any = text;
        _byLanguage = new Dictionary<string, string>();
    }

    public LocalizedText(IReadOnlyDictionary<string, string> byLanguage)
    {
        _byLanguage = new Dictionary<string, string>(byLanguage, StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>Переводы по языкам; пусто, если текст задан одной строкой.</summary>
    public IReadOnlyDictionary<string, string> Translations => _byLanguage;

    public bool IsEmpty => string.IsNullOrEmpty(_any) && _byLanguage.Values.All(string.IsNullOrEmpty);

    /// <summary>Текст на языке <paramref name="language"/>, иначе по-русски, иначе по-английски, иначе любой.</summary>
    public string Get(string? language)
    {
        if (_any is not null) return _any;
        if (language is not null && _byLanguage.TryGetValue(language, out var text)) return text;
        if (_byLanguage.TryGetValue(DefaultLanguage, out text)) return text;
        if (_byLanguage.TryGetValue("en", out text)) return text;
        return _byLanguage.Values.FirstOrDefault() ?? "";
    }

    public override string ToString() => Get(DefaultLanguage);

    public static implicit operator LocalizedText(string text) => new(text);

    public bool Equals(LocalizedText? other) =>
        other is not null
        && _any == other._any
        && _byLanguage.Count == other._byLanguage.Count
        && _byLanguage.All(p => other._byLanguage.TryGetValue(p.Key, out var v) && v == p.Value);

    public override bool Equals(object? obj) => Equals(obj as LocalizedText);

    public override int GetHashCode() => _any?.GetHashCode(StringComparison.Ordinal) ?? _byLanguage.Count;

    internal void Write(Utf8JsonWriter writer)
    {
        if (_any is not null)
        {
            writer.WriteStringValue(_any);
            return;
        }
        writer.WriteStartObject();
        foreach (var (language, text) in _byLanguage) writer.WriteString(language, text);
        writer.WriteEndObject();
    }
}

/// <summary>Читает <see cref="LocalizedText"/> из строки или объекта <c>{"ru": …, "en": …}</c>.</summary>
public sealed class LocalizedTextConverter : JsonConverter<LocalizedText>
{
    public override LocalizedText Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        switch (reader.TokenType)
        {
            case JsonTokenType.String:
                return new LocalizedText(reader.GetString() ?? "");
            case JsonTokenType.StartObject:
                var byLanguage = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                while (reader.Read() && reader.TokenType != JsonTokenType.EndObject)
                {
                    if (reader.TokenType != JsonTokenType.PropertyName) throw new JsonException("Ожидалось имя языка.");
                    var language = reader.GetString()!;
                    reader.Read();
                    if (reader.TokenType != JsonTokenType.String) throw new JsonException($"Текст для языка «{language}» должен быть строкой.");
                    byLanguage[language] = reader.GetString() ?? "";
                }
                return new LocalizedText(byLanguage);
            default:
                throw new JsonException("Текст должен быть строкой или объектом {\"ru\": …, \"en\": …}.");
        }
    }

    public override void Write(Utf8JsonWriter writer, LocalizedText value, JsonSerializerOptions options) => value.Write(writer);
}
