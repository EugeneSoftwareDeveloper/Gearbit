namespace Gearbit.Core.Components;

/// <summary>Вид компонента робота. Определяет, какой интерфейс-возможность он реализует.</summary>
public enum ComponentKind
{
    Motor,
    Distance,
    Imu,
    Light,
    Battery,
}

/// <summary>Цвет светодиода в терминах API (протокол сам переводит его в код устройства).</summary>
public enum RobotColor
{
    Off,
    Red,
    Orange,
    Yellow,
    Green,
    Cyan,
    Blue,
    Purple,
    White,
}

/// <summary>Показания гироскопа: наклон по осям X/Y в градусах и «сумма ускорений» (сырое значение).</summary>
public readonly record struct TiltReading(int X, int Y, int Acceleration);

/// <summary>Любая часть робота: мотор, датчик, светодиод…</summary>
public interface IRobotComponent
{
    /// <summary>Физический идентификатор (порт): M1, D1, L1…</summary>
    string Id { get; }

    string Title { get; }

    ComponentKind Kind { get; }

    /// <summary>
    /// Доступен ли компонент прямо сейчас. Например, гироскоп становится доступен
    /// только после первого кадра телеметрии новой прошивки.
    /// </summary>
    bool Available { get; }
}

/// <summary>Мотор. Мощность в процентах −100..100, знак задаёт направление.</summary>
public interface IMotor : IRobotComponent
{
    /// <summary>Заданная мощность (после ограничений), %.</summary>
    int Power { get; }

    /// <summary>Задать мощность, %. Команда не блокирует: робот отправит новое состояние в ближайшем цикле.</summary>
    void SetPower(int percent);
}

/// <summary>Датчик расстояния. Пока отдаёт уровень устройства (у SuperBot 0..6), перевод в см — через калибровку.</summary>
public interface IDistanceSensor : IRobotComponent
{
    int? Level { get; }

    int MaxLevel { get; }

    /// <summary>Расстояние в сантиметрах по таблице калибровки сборки; null — нет калибровки или нет данных.</summary>
    double? Centimeters { get; }

    /// <summary>Датчик смотрит вниз: уровень, начиная с которого под ним чёрная линия (калибровка сборки или середина шкалы).</summary>
    int LineLevel { get; }
}

public interface IImu : IRobotComponent
{
    TiltReading? Tilt { get; }
}

public interface ILight : IRobotComponent
{
    RobotColor Color { get; }

    void SetColor(RobotColor color);
}

public interface IBattery : IRobotComponent
{
    int? Raw { get; }

    bool Low { get; }
}
