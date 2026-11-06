namespace BotStudio.Core.Descriptors;

/// <summary>
/// Сборка (profiles/*.json): что собрано из контроллера. Один контроллер — много сборок:
/// машинка, кран, динозавр. Сборка задаёт привод, понятные имена (front → D1) и лимиты.
/// </summary>
public sealed class BuildProfile
{
    public required string Id { get; init; }

    public string Title { get; init; } = "";

    /// <summary>Id описания устройства (devices/*.json), к которому относится сборка.</summary>
    public required string Device { get; init; }

    public string Status { get; init; } = "draft";

    public DriveProfile? Drive { get; init; }

    /// <summary>Понятное имя → физический компонент: front → D1, left_wheel → M1.</summary>
    public IReadOnlyDictionary<string, string> Aliases { get; init; } = new Dictionary<string, string>();

    public LimitsProfile Limits { get; init; } = new();

    public CalibrationProfile Calibration { get; init; } = new();
}

public sealed class DriveProfile
{
    /// <summary>differential — два борта (танковая схема).</summary>
    public string Type { get; init; } = "differential";

    public required string Left { get; init; }

    public required string Right { get; init; }

    public bool InvertLeft { get; init; }

    public bool InvertRight { get; init; }
}

public sealed class LimitsProfile
{
    /// <summary>Максимальная мощность моторов, % (детский режим).</summary>
    public int MaxPowerPercent { get; init; } = 100;

    public bool KidMode { get; init; }
}

public sealed class CalibrationProfile
{
    public IReadOnlyDictionary<string, DistanceCalibration> Distance { get; init; } = new Dictionary<string, DistanceCalibration>();
}

public sealed class DistanceCalibration
{
    /// <summary>Таблица «уровень → сантиметры» (индекс массива = уровень). null — не откалибровано.</summary>
    public IReadOnlyList<double>? LevelToCm { get; init; }
}
