namespace BotStudio.Tests;

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
        Assert.True(car.Drive.InvertRight);
        Assert.Equal("D1", car.Aliases["front"]);
        Assert.Equal(60, car.Limits.MaxPowerPercent);
        Assert.Null(car.Calibration.Distance["D1"].LevelToCm);
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
}
