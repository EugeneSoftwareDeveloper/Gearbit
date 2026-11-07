namespace Gearbit.Emulator;

/// <summary>Прямоугольное препятствие в комнате (сантиметры, начало координат — левый верхний угол).</summary>
public sealed record Obstacle(double X, double Y, double Width, double Height)
{
    public bool Contains(double x, double y, double margin = 0) =>
        x >= X - margin && x <= X + Width + margin && y >= Y - margin && y <= Y + Height + margin;
}

/// <summary>Положение машинки: координаты центра в см и курс в градусах (0 — вправо, по часовой стрелке).</summary>
public readonly record struct Pose(double X, double Y, double Heading);

/// <summary>Точка на полу комнаты, см.</summary>
public readonly record struct FloorPoint(double X, double Y);

/// <summary>Что лежит в комнате эмулятора.</summary>
public enum EmulatorScene
{
    /// <summary>Комната с препятствиями: ездить и объезжать.</summary>
    Room,

    /// <summary>Белый лист с чёрной линией: езда по линии, препятствий нет.</summary>
    Line,
}

/// <summary>Чёрная линия на полу: ломаная по середине линии и её ширина, см.</summary>
public sealed record LineTrack(IReadOnlyList<FloorPoint> Points, double Width, bool Closed)
{
    /// <summary>Расстояние от точки до середины линии, см.</summary>
    public double DistanceTo(double x, double y)
    {
        var best = double.PositiveInfinity;
        var count = Closed ? Points.Count : Points.Count - 1;
        for (var i = 0; i < count; i++)
        {
            var a = Points[i];
            var b = Points[(i + 1) % Points.Count];
            best = Math.Min(best, DistanceToSegment(x, y, a, b));
        }

        return Points.Count == 1 ? Math.Sqrt(Square(x - Points[0].X) + Square(y - Points[0].Y)) : best;
    }

    /// <summary>
    /// Трасса-«стадион»: две прямые и два полукруга вокруг точки (cx, cy).
    /// </summary>
    /// <param name="straight">Длина прямых участков, см.</param>
    /// <param name="radius">Радиус поворотов, см.</param>
    public static LineTrack Stadium(double cx, double cy, double straight, double radius, double width)
    {
        const int arcSteps = 24;
        var half = straight / 2;
        var points = new List<FloorPoint>();
        // Нижняя прямая слева направо, правый поворот вверх, верхняя прямая справа налево, левый поворот вниз.
        for (var i = 0; i <= arcSteps; i++)
        {
            var angle = (90 - (180.0 * i / arcSteps)) * Math.PI / 180;
            points.Add(Round(cx + half + (radius * Math.Cos(angle)), cy + (radius * Math.Sin(angle))));
        }

        for (var i = 0; i <= arcSteps; i++)
        {
            var angle = (270 - (180.0 * i / arcSteps)) * Math.PI / 180;
            points.Add(Round(cx - half + (radius * Math.Cos(angle)), cy + (radius * Math.Sin(angle))));
        }

        return new LineTrack(points, width, Closed: true);
    }

    private static FloorPoint Round(double x, double y) => new(Math.Round(x, 1), Math.Round(y, 1));

    private static double DistanceToSegment(double x, double y, FloorPoint a, FloorPoint b)
    {
        var dx = b.X - a.X;
        var dy = b.Y - a.Y;
        var length = (dx * dx) + (dy * dy);
        var t = length == 0 ? 0 : Math.Clamp((((x - a.X) * dx) + ((y - a.Y) * dy)) / length, 0, 1);
        return Math.Sqrt(Square(x - (a.X + (t * dx))) + Square(y - (a.Y + (t * dy))));
    }

    private static double Square(double v) => v * v;
}

/// <summary>Где стоят датчики: углы тех, что смотрят по сторонам, и смещения тех, что смотрят вниз.</summary>
public sealed record SensorMounts(IReadOnlyDictionary<string, double> Angles, IReadOnlyDictionary<string, double> Down);

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

    /// <summary>Левый мотор стоит зеркально: «плюс» крутит колесо назад (как у настоящей SuperBot-машинки, profiles/superbot-car.json).</summary>
    public bool LeftMirrored { get; init; } = true;

    public bool RightMirrored { get; init; }

    /// <summary>Направления датчиков относительно курса: D1 смотрит вперёд, D2 — вправо.</summary>
    public IReadOnlyDictionary<string, double> SensorAngles { get; init; } = new Dictionary<string, double> { ["D1"] = 0, ["D2"] = 90 };

    /// <summary>
    /// Датчики, которые смотрят вниз (езда по линии): id → смещение поперёк машинки от середины, см
    /// (минус — левее). Такой датчик меряет не расстояние, а то, что под ним: белое (0) или чёрное (6).
    /// </summary>
    public IReadOnlyDictionary<string, double> SensorDown { get; init; } = new Dictionary<string, double>();

    /// <summary>
    /// Насколько датчики, смотрящие вниз, вынесены вперёд от центра машинки, см: чуть впереди корпуса,
    /// как обычно ставят датчики линии (так машинка раньше замечает поворот).
    /// </summary>
    public double DownSensorForward { get; init; } = 10;

    /// <summary>Радиус пятна под датчиком, см: на краю линии показания меняются плавно, как у настоящего ИК-датчика.</summary>
    public double DownSensorSpot { get; init; } = 1;

    /// <summary>С какой сцены начинать: комната с препятствиями или лист с линией.</summary>
    public EmulatorScene Scene { get; init; } = EmulatorScene.Room;

    /// <summary>Чёрная линия сцены «линия»: овал-«стадион» шириной 3 см посередине комнаты.</summary>
    public LineTrack Line { get; init; } = LineTrack.Stadium(120, 80, 90, 45, 3);

    /// <summary>Старт на сцене «линия»: на нижней прямой, линия между двумя датчиками.</summary>
    public Pose LineStartPose { get; init; } = new(100, 125, 0);

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

/// <summary>Геометрия комнаты: столкновения, лучи датчиков и линия на полу.</summary>
public sealed class EmulatorWorld
{
    private readonly Lock _lock = new();
    private readonly HashSet<string> _sensors;
    private readonly Dictionary<string, double> _sensorAngles;
    private readonly Dictionary<string, double> _sensorDown;
    private List<Obstacle> _obstacles;
    private EmulatorScene _scene;

    public EmulatorWorld(EmulatorSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);
        Settings = settings;
        _sensors = [.. settings.SensorAngles.Keys, .. settings.SensorDown.Keys];
        _sensorDown = new Dictionary<string, double>(settings.SensorDown);
        _sensorAngles = settings.SensorAngles.Where(a => !_sensorDown.ContainsKey(a.Key)).ToDictionary();
        _scene = settings.Scene;
        _obstacles = SceneObstacles(settings.Scene);
    }

    public EmulatorSettings Settings { get; }

    /// <summary>Куда смотрят датчики сейчас: интерфейс переставляет их вслед за настоящей сборкой (emulator.setSensorAngles).</summary>
    public IReadOnlyDictionary<string, double> SensorAngles
    {
        get
        {
            lock (_lock)
            {
                return new Dictionary<string, double>(_sensorAngles);
            }
        }
    }

    /// <summary>Датчики, которые смотрят вниз: id → смещение поперёк машинки, см (минус — левее).</summary>
    public IReadOnlyDictionary<string, double> SensorDown
    {
        get
        {
            lock (_lock)
            {
                return new Dictionary<string, double>(_sensorDown);
            }
        }
    }

    public EmulatorScene Scene
    {
        get
        {
            lock (_lock)
            {
                return _scene;
            }
        }
    }

    /// <summary>Линия на полу текущей сцены (null — линии нет).</summary>
    public LineTrack? Line => Scene == EmulatorScene.Line ? Settings.Line : null;

    /// <summary>Откуда стартует машинка на текущей сцене.</summary>
    public Pose StartPose => Scene == EmulatorScene.Line ? Settings.LineStartPose : Settings.StartPose;

    /// <summary>Сменить сцену: препятствия становятся такими, как задумано для неё. Машинку на старт ставит <see cref="TudaoEmulator.Reset"/>.</summary>
    public void SetScene(EmulatorScene scene)
    {
        lock (_lock)
        {
            _scene = scene;
            _obstacles = SceneObstacles(scene);
        }
    }

    /// <summary>Переставить датчики: известные id получают новый угол (градусы от «вперёд» по часовой стрелке), чужие id пропускаются.</summary>
    public IReadOnlyDictionary<string, double> SetSensorAngles(IReadOnlyDictionary<string, double> angles) =>
        SetSensorMounts(angles, null).Angles;

    /// <summary>
    /// Переставить датчики. Id из <paramref name="angles"/> смотрят по сторонам (градусы от «вперёд» по часовой стрелке),
    /// id из <paramref name="down"/> — вниз со смещением поперёк машинки (см). Чужие id и не упомянутые датчики не меняются.
    /// </summary>
    public SensorMounts SetSensorMounts(IReadOnlyDictionary<string, double>? angles, IReadOnlyDictionary<string, double>? down)
    {
        lock (_lock)
        {
            foreach (var (id, angle) in angles ?? new Dictionary<string, double>())
            {
                if (_sensors.Contains(id) && double.IsFinite(angle))
                {
                    _sensorDown.Remove(id);
                    _sensorAngles[id] = ((angle % 360) + 360) % 360;
                }
            }

            var limit = Math.Max(0, Settings.RobotRadius - 1);
            foreach (var (id, offset) in down ?? new Dictionary<string, double>())
            {
                if (_sensors.Contains(id) && double.IsFinite(offset))
                {
                    _sensorAngles.Remove(id);
                    _sensorDown[id] = Math.Clamp(offset, -limit, limit);
                }
            }

            return new SensorMounts(new Dictionary<string, double>(_sensorAngles), new Dictionary<string, double>(_sensorDown));
        }
    }

    /// <summary>Насколько тёмный пол под пятном датчика в точке (x, y): 0 — белый, 1 — пятно целиком на чёрной линии.</summary>
    public double FloorDarkness(double x, double y)
    {
        if (Line is not { } line)
        {
            return 0;
        }

        var spot = Math.Max(0.01, Settings.DownSensorSpot);
        var distance = line.DistanceTo(x, y);
        return Math.Clamp(((line.Width / 2) + spot - distance) / (2 * spot), 0, 1);
    }

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

    private List<Obstacle> SceneObstacles(EmulatorScene scene) => scene == EmulatorScene.Line ? [] : [.. Settings.Obstacles];

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
