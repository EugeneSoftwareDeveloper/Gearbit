using Gearbit.Hub;
using Microsoft.Net.Http.Headers;

namespace Gearbit.Tests;

/// <summary>Страница «интерфейса нет»: язык и цвета, которые читаются в светлом и тёмном окне.</summary>
public sealed class NoWebUiTests
{
    private static List<StringWithQualityHeaderValue> Accept(string header) =>
        StringWithQualityHeaderValue.ParseList(header.Split(',')).ToList();

    [Theory]
    [InlineData("en", "ru-RU", "en")]
    [InlineData("ru", "en-US", "ru")]
    [InlineData(null, "ru-RU,ru;q=0.9,en;q=0.8", "ru")]
    [InlineData(null, "uk-UA", "ru")]
    [InlineData(null, "kk", "ru")]
    [InlineData(null, "de-DE,de;q=0.9", "en")]
    [InlineData(null, "en;q=0.5,ru", "ru")]
    [InlineData(null, "", "en")]
    [InlineData("xx", "be", "ru")]
    public void Language_comes_from_settings_then_accept_language(string? settingsLang, string accept, string expected)
    {
        Assert.Equal(expected, GearbitHub.NoWebUiText(settingsLang, Accept(accept)).Language);
    }

    [Fact]
    public void Page_is_in_the_chosen_language_and_uses_system_colors()
    {
        var ru = GearbitHub.NoWebUiPage(HubText.Russian);
        var en = GearbitHub.NoWebUiPage(HubText.English);

        Assert.Contains("<html lang=\"ru\">", ru, StringComparison.Ordinal);
        Assert.Contains("интерфейса нет", ru, StringComparison.Ordinal);
        Assert.Contains("<html lang=\"en\">", en, StringComparison.Ordinal);
        Assert.Contains("there is no interface", en, StringComparison.Ordinal);

        foreach (var page in new[] { ru, en })
        {
            // Без своих цветов текст был чёрным на тёмном фоне окна.
            Assert.Contains("name=\"color-scheme\" content=\"light dark\"", page, StringComparison.Ordinal);
            Assert.Contains("background: Canvas", page, StringComparison.Ordinal);
            Assert.Contains("color: CanvasText", page, StringComparison.Ordinal);
            Assert.Contains("npm run build", page, StringComparison.Ordinal);
        }
    }
}
