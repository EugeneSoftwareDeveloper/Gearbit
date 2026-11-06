using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Gearbit.Client;

/// <summary>
/// Робот, подключённый к Gearbit. Команды простые и синхронные, как в Python:
/// <c>robot.Forward(50)</c> возвращается сразу, а робот едет, пока другая команда не скажет иначе;
/// <c>robot.Forward(50, 2)</c> — проехать 2 секунды и остановиться.
/// Мощность — проценты от −100 до 100. Предел мощности для детей применяет хаб, а не программа.
/// К хабу робот подключается сам при первой команде.
/// </summary>
public sealed class Robot : IDisposable
{
    public const string DefaultUrl = "ws://localhost:5280/ws";

    /// <summary>Уровень датчика (0 — вплотную, 6 — далеко), ниже которого впереди препятствие. Как в «Блоках».</summary>
    public const int ObstacleLevel = 2;

    public const int DistanceMax = 6;

    /// <summary>Места датчиков, как в карточке «Датчики».</summary>
    public static readonly IReadOnlyList<string> SensorPlaces = ["front", "front_right", "right", "back_right", "back", "back_left", "left", "front_left"];

    /// <summary>Цвета огоньков.</summary>
    public static readonly IReadOnlyList<string> Colors = ["off", "red", "orange", "yellow", "green", "cyan", "blue", "purple", "white"];

    private static readonly Dictionary<string, string> PlaceWords = new(StringComparer.OrdinalIgnoreCase)
    {
        ["впереди"] = "front",
        ["спереди"] = "front",
        ["вперёд"] = "front",
        ["справа"] = "right",
        ["слева"] = "left",
        ["сзади"] = "back",
        ["позади"] = "back",
    };

    private static readonly Dictionary<string, string> ColorWords = new(StringComparer.OrdinalIgnoreCase)
    {
        ["выкл"] = "off",
        ["выключить"] = "off",
        ["нет"] = "off",
        ["черный"] = "off",
        ["чёрный"] = "off",
        ["красный"] = "red",
        ["оранжевый"] = "orange",
        ["желтый"] = "yellow",
        ["жёлтый"] = "yellow",
        ["зеленый"] = "green",
        ["зелёный"] = "green",
        ["голубой"] = "cyan",
        ["синий"] = "blue",
        ["фиолетовый"] = "purple",
        ["белый"] = "white",
    };

    /// <summary>Телеметрия приходит 10 раз в секунду: короткая пауза не даёт циклу <c>while (true)</c> занять весь процессор.</summary>
    private static readonly TimeSpan SensorPause = TimeSpan.FromMilliseconds(10);

    private readonly string? _url;
    private readonly string? _name;
    private readonly Lock _lock = new();
    private readonly Dictionary<string, int> _motors = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _lights = new(StringComparer.Ordinal);
    private HubConnection? _hub;
    private (int Left, int Right)? _drive = (0, 0);
    private bool _finished;

    /// <param name="url">Адрес хаба. По умолчанию — <c>GEARBIT_URL</c> или <c>ws://localhost:5280/ws</c>.</param>
    /// <param name="name">Как программа называется в Gearbit («за рулём: …»).</param>
    public Robot(string? url = null, string? name = null)
    {
        _url = url;
        _name = name;
    }

    /// <summary>Программа запущена из Gearbit (вкладка «C#»).</summary>
    internal static bool InsideGearbit => !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("GEARBIT_RUN_ID"));

    /// <summary>Подключён ли робот к Gearbit прямо сейчас.</summary>
    public bool Connected => (string?)Connection().Robot?["state"] == "connected";

    /// <summary>Соединение уже открыто (программа хоть раз обращалась к роботу).</summary>
    internal bool Started => _hub is not null;

    // ---------- Движение ----------

    /// <summary>Ехать вперёд. Если указать секунды — проехать столько и остановиться.</summary>
    public void Forward(double power = 50, double? seconds = null)
    {
        var p = Power(power);
        Tank(p, p, seconds);
    }

    /// <summary>Ехать назад.</summary>
    public void Backward(double power = 50, double? seconds = null)
    {
        var p = Power(power);
        Tank(-p, -p, seconds);
    }

    /// <summary>Поворачиваться налево на месте: колёса крутятся в разные стороны.</summary>
    public void TurnLeft(double power = 50, double? seconds = null)
    {
        var p = Power(power);
        Tank(-p, p, seconds);
    }

    /// <summary>Поворачиваться направо на месте.</summary>
    public void TurnRight(double power = 50, double? seconds = null)
    {
        var p = Power(power);
        Tank(p, -p, seconds);
    }

    /// <summary>Мощность левого и правого колеса по отдельности, как у танка.</summary>
    public void Tank(double left, double right, double? seconds = null)
    {
        var pair = (Power(left, "Мощность левого колеса"), Power(right, "Мощность правого колеса"));
        Check(); // повтор той же команды в хаб не уходит, но остановку программы заметить должен
        if (pair == (0, 0))
        {
            StopDrive();
        }
        else if (_drive != pair)
        {
            Command("drive.tank", new JsonObject { ["left"] = pair.Item1, ["right"] = pair.Item2 });
            _drive = pair;
        }

        if (seconds is { } s)
        {
            Wait(s);
            StopDrive();
        }
    }

    /// <summary>Газ и руль, как стик геймпада: <paramref name="turn"/> больше 0 — направо, меньше 0 — налево.</summary>
    public void Drive(double throttle, double turn, double? seconds = null)
    {
        var t = Power(throttle, "Газ");
        var r = Power(turn, "Поворот");
        Check();
        if (t == 0 && r == 0)
        {
            StopDrive();
        }
        else
        {
            Command("drive.arcade", new JsonObject { ["throttle"] = t, ["turn"] = r });
            _drive = null; // точные мощности колёс считает хаб
        }

        if (seconds is { } s)
        {
            Wait(s);
            StopDrive();
        }
    }

    /// <summary>Остановить колёса и моторы, которые включала программа.</summary>
    public void Stop()
    {
        Check();
        StopDrive();
        foreach (var (id, power) in _motors.ToList())
        {
            if (power != 0)
            {
                Command("motor.setPower", new JsonObject { ["id"] = id, ["power"] = 0 });
                _motors[id] = 0;
            }
        }
    }

    /// <summary>Мощность одного мотора: <c>robot.Motor("M3", 50)</c>.</summary>
    public void Motor(string motor, double power, double? seconds = null)
    {
        ArgumentNullException.ThrowIfNull(motor);
        var p = Power(power);
        Check();
        if (!_motors.TryGetValue(motor, out var current) || current != p)
        {
            Command("motor.setPower", new JsonObject { ["id"] = motor, ["power"] = p });
            _motors[motor] = p;
        }

        if (seconds is { } s)
        {
            Wait(s);
            Motor(motor, 0);
        }
    }

    // ---------- Свет ----------

    /// <summary>Включить огонёк: <c>robot.Light("L1", "red")</c> или все сразу: <c>robot.Light("all", "green")</c>.</summary>
    public void Light(string light = "all", string color = "white")
    {
        ArgumentNullException.ThrowIfNull(light);
        ArgumentNullException.ThrowIfNull(color);
        var info = Info();
        var key = color.Trim();
        var target = ColorWords.TryGetValue(key, out var word) ? word : key.ToLowerInvariant();
        if (!Colors.Contains(target))
        {
            throw new GearbitException($"Не знаю цвет «{color}». Можно: {string.Join(", ", Colors)}.");
        }

        var lights = Components(info, "light").ToList();
        List<string> ids;
        if (light == "all")
        {
            ids = [.. lights.Select(c => (string)c["id"]!)];
        }
        else
        {
            var found = lights.FirstOrDefault(c => (string?)c["id"] == light || Aliases(c).Contains(light));
            if (found is null)
            {
                var names = lights.Count > 0 ? string.Join(", ", lights.Select(c => (string?)c["id"])) : "нет огоньков";
                throw new GearbitException($"У этого робота нет огонька «{light}». Есть: {names}.");
            }

            ids = [(string)found["id"]!];
        }

        foreach (var id in ids)
        {
            if (!_lights.TryGetValue(id, out var current) || current != target)
            {
                Command("light.setColor", new JsonObject { ["id"] = id, ["color"] = target });
                _lights[id] = target;
            }
        }
    }

    /// <summary>Выключить все огоньки.</summary>
    public void LightsOff() => Light("all", "off");

    // ---------- Датчики ----------

    /// <summary>Уровень датчика расстояния: 0 — препятствие вплотную, 6 — далеко или ничего нет.</summary>
    public int Distance(string sensor = "front")
    {
        var id = SensorId(sensor);
        Pause();
        return Check().Telemetry?["distances"]?[id] is JsonValue value && value.TryGetValue<int>(out var level) ? level : DistanceMax;
    }

    /// <summary>Расстояние в сантиметрах, если датчик откалиброван (иначе null).</summary>
    public double? DistanceCm(string sensor = "front")
    {
        var id = SensorId(sensor);
        Pause();
        return Check().Telemetry?["distancesCm"]?[id] is JsonValue value && value.TryGetValue<double>(out var cm) ? cm : null;
    }

    /// <summary>Есть ли препятствие близко (уровень меньше 2).</summary>
    public bool Obstacle(string sensor = "front") => Distance(sensor) < ObstacleLevel;

    /// <summary>Наклон робота (X, Y). Если гироскопа нет — (0, 0).</summary>
    public (int X, int Y) Tilt()
    {
        Info();
        Pause();
        var tilt = Check().Telemetry?["tilt"];
        return (Int(tilt?["x"]), Int(tilt?["y"]));
    }

    /// <summary>Заряд батареи, как его сообщает робот.</summary>
    public int Battery()
    {
        Info();
        return Int(Check().Telemetry?["battery"]);
    }

    // ---------- Разное ----------

    /// <summary>Показать надпись в облачке над роботом (в Gearbit) или напечатать её.</summary>
    public void Say(object? text)
    {
        var message = Convert.ToString(text, CultureInfo.CurrentCulture) ?? "";
        if (InsideGearbit)
        {
            Markers.Emit(new JsonObject { ["type"] = "say", ["text"] = message });
        }
        else if (message.Length > 0)
        {
            // Пустая надпись в Gearbit убирает облачко, а в консоли печатать нечего.
            Console.WriteLine($"Робот: {message}");
        }
    }

    /// <summary>Подождать столько секунд. Робот при этом продолжает делать то, что ему сказали.</summary>
    public void Wait(double seconds)
    {
        var duration = Duration(seconds);
        var hub = _hub;
        if (hub is null)
        {
            Thread.Sleep(duration);
            return;
        }

        ThrowIfStopped(hub);
        if (hub.Interrupted.WaitHandle.WaitOne(duration))
        {
            ThrowIfStopped(hub);
        }
    }

    /// <summary>Программа закончилась: свои моторы — в 0, управление — свободно, соединение закрыто.</summary>
    public void Dispose()
    {
        HubConnection? hub;
        lock (_lock)
        {
            if (_finished)
            {
                return;
            }

            _finished = true;
            hub = _hub;
        }

        if (hub is null || hub.Closed)
        {
            hub?.Dispose();
            return;
        }

        var moving = _drive != (0, 0) || _motors.Values.Any(p => p != 0);
        try
        {
            if (!hub.Interrupted.IsCancellationRequested)
            {
                var timeout = TimeSpan.FromSeconds(2);
                if (_drive != (0, 0))
                {
                    hub.Call("drive.stop", new JsonObject { ["source"] = "program" }, timeout);
                }

                foreach (var (id, power) in _motors)
                {
                    if (power != 0)
                    {
                        hub.Call("motor.setPower", new JsonObject { ["id"] = id, ["power"] = 0, ["source"] = "program" }, timeout);
                    }
                }

                hub.Call("control.release", null, timeout);
                if (moving)
                {
                    Console.WriteLine("Программа закончилась, и робот остановился. Чтобы ехать дольше, добавьте Wait(секунды) или цикл while (true).");
                }
            }
        }
        catch (GearbitException)
        {
            // Хаб уже закрылся или робот отключён: останавливать нечего.
        }
        finally
        {
            hub.Dispose();
        }
    }

    // ---------- Внутреннее ----------

    private HubConnection Connection()
    {
        if (_hub is { } hub)
        {
            return hub;
        }

        lock (_lock)
        {
            ObjectDisposedException.ThrowIf(_finished, this);
            if (_hub is null)
            {
                var url = _url ?? Environment.GetEnvironmentVariable("GEARBIT_URL") ?? DefaultUrl;
                var name = _name ?? Environment.GetEnvironmentVariable("GEARBIT_NAME") ?? $"C#: {AppDomain.CurrentDomain.FriendlyName}";
                if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
                {
                    throw new GearbitException($"Неверный адрес Gearbit: {url}");
                }

                _hub = HubConnection.Connect(uri, name, Environment.GetEnvironmentVariable("GEARBIT_RUN_ID"));
            }

            return _hub;
        }
    }

    private HubConnection Check()
    {
        var hub = Connection();
        ThrowIfStopped(hub);
        return hub;
    }

    private static void ThrowIfStopped(HubConnection hub)
    {
        if (hub.Interrupted.IsCancellationRequested)
        {
            throw new ProgramStoppedException(hub.InterruptMessage);
        }
    }

    private void Command(string method, JsonObject parameters)
    {
        var hub = Check();
        parameters["source"] = "program";
        try
        {
            hub.Call(method, parameters);
        }
        catch (GearbitException) when (hub.Interrupted.IsCancellationRequested)
        {
            throw new ProgramStoppedException(hub.InterruptMessage);
        }
    }

    private void StopDrive()
    {
        if (_drive != (0, 0))
        {
            Command("drive.stop", []);
            _drive = (0, 0);
        }
    }

    private JsonObject Info()
    {
        var info = Check().Robot;
        if (info is null || (string?)info["state"] != "connected")
        {
            throw new GearbitException("Робот не подключён. Нажмите «Нет робота» вверху Gearbit и выберите робота или эмулятор.");
        }

        return info;
    }

    private string SensorId(string sensor)
    {
        ArgumentNullException.ThrowIfNull(sensor);
        var info = Info();
        var key = PlaceWords.TryGetValue(sensor.Trim(), out var word) ? word : sensor.Trim();
        var places = UserSensorPlaces();
        foreach (var component in Components(info, "distance"))
        {
            var id = (string)component["id"]!;
            var place = places.TryGetValue(id, out var chosen) ? chosen : Aliases(component).FirstOrDefault(SensorPlaces.Contains);
            if (place == "none")
            {
                continue;
            }

            if (id == key || place == key)
            {
                return id;
            }
        }

        var names = new Dictionary<string, string> { ["front"] = "впереди", ["right"] = "справа", ["left"] = "слева", ["back"] = "сзади" };
        throw new GearbitException(
            $"У этой сборки нет датчика «{names.GetValueOrDefault(key, key)}». Проверьте, куда он поставлен, в карточке «Датчики» на вкладке «Пульт».");
    }

    private static IEnumerable<JsonObject> Components(JsonObject info, string kind) =>
        (info["components"] as JsonArray ?? []).OfType<JsonObject>().Where(c => (string?)c["kind"] == kind && c["id"] is not null);

    private static IEnumerable<string> Aliases(JsonObject component) =>
        (component["aliases"] as JsonArray ?? []).Select(a => (string?)a).OfType<string>();

    /// <summary>Куда пользователь поставил датчики (карточка «Датчики»). Gearbit передаёт это при запуске.</summary>
    private static Dictionary<string, string> UserSensorPlaces()
    {
        var raw = Environment.GetEnvironmentVariable("GEARBIT_SENSOR_PLACES");
        if (string.IsNullOrEmpty(raw))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, string>>(raw) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    /// <summary>Секунды для <c>Wait</c>: не меньше 0 и не больше, чем принимают WaitOne и Sleep (почти 25 дней).</summary>
    internal static TimeSpan Duration(double seconds)
    {
        if (double.IsNaN(seconds))
        {
            throw new GearbitException("Время — это число секунд.");
        }

        return seconds <= 0 ? TimeSpan.Zero : TimeSpan.FromMilliseconds(Math.Min(seconds * 1000, int.MaxValue - 1));
    }

    private static void Pause() => Thread.Sleep(SensorPause);

    private static int Int(JsonNode? node) => node is JsonValue value && value.TryGetValue<double>(out var number) ? (int)number : 0;

    private static int Power(double value, string what = "Мощность")
    {
        if (double.IsNaN(value))
        {
            throw new GearbitException($"{what} — это число от -100 до 100.");
        }

        return (int)Math.Round(Math.Clamp(value, -100, 100), MidpointRounding.AwayFromZero);
    }
}
