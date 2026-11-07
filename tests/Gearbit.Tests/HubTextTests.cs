using Gearbit.Core.Robots;
using Gearbit.Hub;

namespace Gearbit.Tests;

public class HubTextTests
{
    [Theory]
    [InlineData("en", "en")]
    [InlineData("en-GB", "en")]
    [InlineData("RU", "ru")]
    [InlineData("ru_RU", "ru")]
    public void Finds_texts_by_language_code(string language, string expected) =>
        Assert.Equal(expected, HubText.Find(language)?.Language);

    [Theory]
    [InlineData("de")]
    [InlineData("")]
    [InlineData(null)]
    public void Unknown_language_is_not_found(string? language) => Assert.Null(HubText.Find(language));

    [Fact]
    public void Exception_keeps_russian_for_the_log_and_translates_for_the_client()
    {
        var error = new HubException(HubErrors.ConnectFailed, t => t.RobotError(RobotErrorCode.DeviceNotFound, null));

        Assert.StartsWith("Робот не найден", error.Message, StringComparison.Ordinal);
        Assert.StartsWith("Robot not found", error.MessageFor(HubText.English), StringComparison.Ordinal);
        Assert.Equal(error.Message, error.MessageFor(HubText.Russian));
    }

    [Fact]
    public void Plain_message_is_sent_as_is()
    {
        var error = new HubException(HubErrors.InvalidParams, "Текст от клиента");
        Assert.Equal("Текст от клиента", error.MessageFor(HubText.English));
    }

    [Fact]
    public void Robot_errors_have_text_for_every_code_and_language()
    {
        foreach (var text in HubText.All)
        {
            foreach (var code in Enum.GetValues<RobotErrorCode>())
            {
                var message = text.RobotError(code, "detail");
                Assert.False(string.IsNullOrWhiteSpace(message));
                Assert.DoesNotContain(code.ToString(), message, StringComparison.Ordinal);
            }
        }
    }

    [Fact]
    public void Watchdog_seconds_use_the_language_number_format()
    {
        Assert.Contains("1,5 с", HubText.Russian.ServiceWatchdog(1.5), StringComparison.Ordinal);
        Assert.Contains("1.5 s", HubText.English.ServiceWatchdog(1.5), StringComparison.Ordinal);
    }
}
