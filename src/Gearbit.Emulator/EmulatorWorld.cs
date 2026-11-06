namespace Gearbit.Emulator;

/// <summary>Прямоугольное препятствие в комнате (сантиметры, начало координат — левый верхний угол).</summary>
public sealed record Obstacle(double X, double Y, double Width, double Height)
{
    public bool Contains(double x, double y, double margin = 0) =>
        x >= X - margin && x <= X + Width + margin && y >= Y - margin && y <= Y + Height + margin;
}

/// <summary>Положение машинки: координаты центра в см и курс в градусах (0 — вправо, по часовой стрелке).</summary>
public readonly record struct Pose(double X, double Y, double Heading);

/// <summary>Параметры виртуальной машинки и комнаты.</summary>
public sealed class EmulatorSettings
{
    public double RoomWidth { get; init; } = 240;

    public double RoomHeight { get; init; } = 160;

    /// <summary>Радиус корпуса, см.</summary>
    public double RobotRadius { get; init; } = 9;

    /// <summary>Колея (расстояние между колёсами), см.</summary>
    public double WheelBase { get; init; } = 14;

    /// <summary>Скорость колеса на полной мощности устройства, см/с.</summary>
    public double MaxWheelSpeed { get; init; } = 35;

    /// <summary>Сколько сантиметров приходится на один уровень датчика расстояния.</summary>
    public double CentimetersPerLevel { get; init; } = 5;

    /// <summary>Индексы слотов моторов (M1 = 0) для левого и правого колеса.</summary>
    public int LeftMotorSlot { get; init; }

    public int RightMotorSlot { get; init; } = 1;

    /// <summary>Правый мотор стоит зеркально: «плюс» крутит колесо назад (как у SuperBot-машинки).</summary>
    public bool RightMirrored { get; init; } = true;

    public bool LeftMirrored { get; init; }

    /// <summary>Направления датчиков относительно курса: D1 смотрит вперёд, D2 — вправо.</summary>
    public IReadOnlyDictionary<string, double> SensorAngles { get; init; } = new Dictionary<string, double> { ["D1"] = 0, ["D2"] = 90 };

    /// <summary>Какую прошивку изображать: v1 (11 байт, без гироскопа) или v2 (19 байт).</summary>
    public string Firmware { get; init; } = "v2";

    public TimeSpan PhysicsStep { get; init; } = TimeSpan.FromMilliseconds(20);

    public TimeSpan TelemetryInterval { get; init; } = TimeSpan.FromMilliseconds(100);

    /// <summary>Останавливать моторы, если кадры не приходят столько времени (null — не останавливать). Проверяется на этапе 0.</summary>
    public TimeSpan? SilenceStop { get; init; }

    public Pose StartPose { get; init; } = new(50, 80, 0);

    public IReadOnlyList<Obstacle> Obstacles { get; init; } =
    [
        new(150, 30, 30, 30),
        new(110, 110, 50, 20),
        new(200, 120, 20, 25),
    ];
}

/// <summary>Геометрия комнаты: столкновения и лучи датчиков.</summary>
public sealed class EmulatorWorld(EmulatorSettings settings)
{
    private readonly Lock _lock = new();
    private List<Obstacle> _obstacles = [.. settings.Obstacles];

    public EmulatorSettings Settings { get; } = settings;

    public IReadOnlyList<Obstacle> Obstacles
    {
        get
        {
            lock (_lock)
            {
                return [.. _obstacles];
            }
        }
    }

    public void SetObstacles(IEnumerable<Obstacle> obstacles)
    {
        lock (_lock)
        {
            _obstacles = [.. obstacles];
        }
    }

    /// <summary>Занята ли точка корпусом робота радиуса r (стены и препятствия).</summary>
    public bool Collides(double x, double y, double radius)
    {
        if (x - radius < 0 || y - radius < 0 || x + radius > Settings.RoomWidth || y + radius > Settings.RoomHeight)
        {
            return true;
        }

        foreach (var o in Obstacles)
        {
            var nearestX = Math.Clamp(x, o.X, o.X + o.Width);
            var nearestY = Math.Clamp(y, o.Y, o.Y + o.Height);
            var dx = x - nearestX;
            var dy = y - nearestY;
            if ((dx * dx) + (dy * dy) < radius * radius)
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>Расстояние по лучу от точки до ближайшей стены или препятствия, см.</summary>
    public double CastRay(double x, double y, double angleDegrees)
    {
        var angle = angleDegrees * Math.PI / 180;
        var dx = Math.Cos(angle);
        var dy = Math.Sin(angle);

        var best = RayToBox(x, y, dx, dy, 0, 0, Settings.RoomWidth, Settings.RoomHeight, inside: true);
        foreach (var o in Obstacles)
        {
            var hit = RayToBox(x, y, dx, dy, o.X, o.Y, o.X + o.Width, o.Y + o.Height, inside: false);
            if (hit < best)
            {
                best = hit;
            }
        }

        return best;
    }

    private static double RayToBox(double ox, double oy, double dx, double dy, double minX, double minY, double maxX, double maxY, bool inside)
    {
        double tMin = double.NegativeInfinity, tMax = double.PositiveInfinity;

        if (!Slab(ox, dx, minX, maxX, ref tMin, ref tMax) || !Slab(oy, dy, minY, maxY, ref tMin, ref tMax))
        {
            return double.PositiveInfinity;
        }

        if (inside)
        {
            // Луч изнутри комнаты: расстояние до выхода.
            return tMax >= 0 ? tMax : double.PositiveInfinity;
        }

        if (tMax < 0)
        {
            return double.PositiveInfinity;
        }

        return tMin >= 0 ? tMin : 0;
    }

    private static bool Slab(double origin, double direction, double min, double max, ref double tMin, ref double tMax)
    {
        if (Math.Abs(direction) < 1e-9)
        {
            return origin >= min && origin <= max;
        }

        var t1 = (min - origin) / direction;
        var t2 = (max - origin) / direction;
        if (t1 > t2)
        {
            (t1, t2) = (t2, t1);
        }

        tMin = Math.Max(tMin, t1);
        tMax = Math.Min(tMax, t2);
        return tMin <= tMax;
    }
}
