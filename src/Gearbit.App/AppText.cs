using System.Globalization;
using System.IO;
using System.Text.Json;

namespace Gearbit.App;

/// <summary>
/// Тексты окна (заставка, ошибки запуска) на языке интерфейса. Язык берётся из настроек интерфейса
/// (settings.json, поле lang), а если там «как в системе» — из языка Windows, по тому же правилу, что в интерфейсе.
/// </summary>
internal sealed record AppText(
    string Starting,
    string StartFailed,
    string WebViewTitle,
    string WebViewText,
    string InstallWebView,
    string OpenInBrowser,
    Func<int, string> PortBusy)
{
    private static readonly AppText Ru = new(
        Starting: "Запускаем Gearbit…",
        StartFailed: "Не удалось запустить Gearbit",
        WebViewTitle: "Нужен компонент Microsoft Edge WebView2",
        WebViewText: "В Windows 11 он уже есть, в Windows 10 его ставят один раз (бесплатно, от Microsoft). " +
                     "Пока можно открыть Gearbit в обычном браузере — хаб уже работает.",
        InstallWebView: "Установить WebView2",
        OpenInBrowser: "Открыть в браузере",
        PortBusy: port => $"Порт {port} занят другой программой. Укажите другой: Gearbit.exe --Hub:Port=5300");

    private static readonly AppText En = new(
        Starting: "Starting Gearbit…",
        StartFailed: "Gearbit could not start",
        WebViewTitle: "Microsoft Edge WebView2 is needed",
        WebViewText: "Windows 11 already has it; on Windows 10 it is installed once (free, from Microsoft). " +
                     "Meanwhile you can open Gearbit in a regular browser — the hub is already running.",
        InstallWebView: "Install WebView2",
        OpenInBrowser: "Open in browser",
        PortBusy: port => $"Port {port} is used by another program. Choose another one: Gearbit.exe --Hub:Port=5300");

    /// <summary>Папка данных Gearbit, как у хаба по умолчанию.</summary>
    public static string DataDirectory { get; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Gearbit");

    // Ниже DataDirectory: статические поля заполняются по порядку.
    public static AppText Current { get; } = Language() == "en" ? En : Ru;

    private static string Language()
    {
        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(DataDirectory, "settings.json")));
            if (doc.RootElement.ValueKind == JsonValueKind.Object
                && doc.RootElement.TryGetProperty("lang", out var lang)
                && lang.GetString() is "ru" or "en")
            {
                return lang.GetString()!;
            }
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException or InvalidOperationException)
        {
            // Настроек ещё нет — берём язык Windows.
        }

        return CultureInfo.CurrentUICulture.TwoLetterISOLanguageName is "ru" or "uk" or "be" or "kk" ? "ru" : "en";
    }
}
