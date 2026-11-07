using System.Text.Json;
using Gearbit.Core.Descriptors;

namespace Gearbit.Tests;

public class CatalogTests
{
    [Fact]
    public void Loads_superbot_descriptor_and_car_profile()
    {
        var device = TestData.SuperBot;
        Assert.Equal("tudao-uart", device.ProtocolName);
        Assert.Equal("6e400002-b5a3-f393-e0a9-e50e24dcca9e", device.Transport.Write);
        Assert.Equal(11, device.Components.Count);

        var car = TestData.Car;
        Assert.Equal("tudao-superbot", car.Device);
        Assert.Equal("M1", car.Drive!.Left);
        Assert.True(car.Drive.InvertLeft);
        Assert.False(car.Drive.InvertRight);
        Assert.Equal("D1", car.Aliases["front"]);
        Assert.Equal(60, car.Limits.MaxPowerPercent);
        Assert.Null(car.Calibration.Distance["D1"].LevelToCm);
        Assert.Equal(2, car.Calibration.Distance["D1"].LineLevel);
        Assert.Null(car.Calibration.Distance["D2"].LineLevel);
    }

    [Theory]
    [InlineData("Nordic_TUDAO", true)]
    [InlineData("apitor-123", true)]
    [InlineData("JBL Flip", false)]
    [InlineData(null, false)]
    public void Matches_by_advertised_name(string? name, bool expected)
    {
        var match = TestData.Catalog.Match(name, []);
        Assert.Equal(expected, match is not null);
    }

    [Fact]
    public void Matches_by_service_uuid_when_name_is_unknown()
    {
        var match = TestData.Catalog.Match("???", [Guid.Parse("6e400001-b5a3-f393-e0a9-e50e24dcca9e")]);
        Assert.Equal("tudao-superbot", match?.Id);
    }
    [Fact]
    public void Titles_are_localized()
    {
        Assert.Equal("Машинка", TestData.Car.Title.Get("ru"));
        Assert.Equal("Car", TestData.Car.Title.Get("en"));
        var d1 = TestData.SuperBot.Components.Single(c => c.Id == "D1");
        Assert.Equal("Distance sensor 1", d1.Title!.Get("en"));
        // Языка нет — берётся русский.
        Assert.Equal("Машинка", TestData.Car.Title.Get("de"));
    }

    [Fact]
    public void Localized_text_reads_plain_string_and_object()
    {
        var plain = JsonSerializer.Deserialize<LocalizedText>("\"Кран\"")!;
        Assert.Equal("Кран", plain.Get("en"));
        // Строка остаётся строкой: интерфейс старых версий показывает её как раньше.
        Assert.Equal(JsonValueKind.String, JsonSerializer.SerializeToElement(plain).ValueKind);

        var byLanguage = JsonSerializer.Deserialize<LocalizedText>("""{"en": "Crane", "ru": "Кран"}""")!;
        Assert.Equal("Crane", byLanguage.Get("EN"));
        Assert.Equal("Кран", byLanguage.Get(null));
        Assert.Equal("Кран", byLanguage.ToString());
        var roundTrip = JsonSerializer.Deserialize<LocalizedText>(JsonSerializer.Serialize(byLanguage));
        Assert.Equal(byLanguage, roundTrip);

        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<LocalizedText>("42"));
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<LocalizedText>("""{"ru": 1}"""));
    }

    [Fact]
    public void Old_profiles_with_plain_title_still_load()
    {
        var profile = RobotCatalog.Parse<BuildProfile>("""{"id": "crane", "title": "Кран", "device": "tudao-superbot"}""");
        Assert.Equal("Кран", profile.Title.Get("en"));
    }
}
