using System.Globalization;

namespace Gearbit.Client;

/// <summary>
/// Тексты клиента для ребёнка. Новый текст добавьте сюда и в оба класса ниже: без перевода проект не соберётся.
/// Те же тексты у Python — в <c>python/gearbit/_texts.py</c>.
/// </summary>
internal interface IClientText
{
    /// <summary>Код языка для <c>hub.hello {lang}</c>: «ru» или «en».</summary>
    string Language { get; }

    string Stopped { get; }

    string ConnectionLost { get; }

    string HubError { get; }

    string NoRobot { get; }

    string Power { get; }

    string PowerLeft { get; }

    string PowerRight { get; }

    string Throttle { get; }

    string Turn { get; }

    string NotSeconds { get; }

    string NoLights { get; }

    string NoDownSensor { get; }

    string NoGyro { get; }

    string FinishedMoving { get; }

    string CannotConnect(Uri url, string detail);

    string NoAnswer(string method);

    string BadUrl(string url);

    string NotNumber(string what);

    string UnknownColor(string color, string colors);

    string NoLight(string light, string lights);

    /// <param name="place">Место датчика из <see cref="Robot.SensorPlaces"/> или имя датчика.</param>
    string NoSensor(string place);

    string UnknownTilt(string? direction);

    string RobotSays(string text);
}

/// <summary>Выбор языка: <c>GEARBIT_LANG</c> (его передаёт Gearbit), иначе язык Windows.</summary>
internal static class ClientText
{
    public static readonly IClientText Russian = new RuClientText();
    public static readonly IClientText English = new EnClientText();

    /// <summary>Язык программы. Тесты ставят русский, английские тесты передают <see cref="English"/> явно.</summary>
    public static IClientText Current { get; set; } = Detect(Environment.GetEnvironmentVariable("GEARBIT_LANG"), CultureInfo.CurrentUICulture);

    /// <summary>«en», «en-US», «ru_RU» → тексты языка; пусто или незнакомо → null.</summary>
    public static IClientText? Find(string? lang)
    {
        var code = lang?.Trim().Replace('_', '-').Split('-')[0].ToLowerInvariant();
        return code switch
        {
            "ru" => Russian,
            "en" => English,
            _ => null,
        };
    }

    /// <summary>Как в интерфейсе: русский, украинский, белорусский и казахский — русский, остальные — английский.</summary>
    public static IClientText Detect(string? explicitLang, CultureInfo culture)
    {
        ArgumentNullException.ThrowIfNull(culture);
        if (!string.IsNullOrWhiteSpace(explicitLang))
        {
            return Find(explicitLang) ?? English;
        }

        return culture.TwoLetterISOLanguageName switch
        {
            "ru" or "uk" or "be" or "kk" => Russian,
            "iv" => Russian, // нейтральная культура (нет языка в системе): как хаб без lang
            _ => English,
        };
    }
}

internal sealed class RuClientText : IClientText
{
    private static readonly Dictionary<string, string> PlaceNames = new()
    {
        ["front"] = "впереди",
        ["right"] = "справа",
        ["left"] = "слева",
        ["back"] = "сзади",
        ["down"] = "вниз",
        ["down_left"] = "вниз слева",
        ["down_right"] = "вниз справа",
    };

    public string Language => "ru";

    public string Stopped => "Программу остановили.";

    public string ConnectionLost => "Связь с Gearbit потеряна.";

    public string HubError => "Ошибка Gearbit.";

    public string NoRobot => "Робот не подключён. Нажмите «Нет робота» вверху Gearbit и выберите робота или эмулятор.";

    public string Power => "Мощность";

    public string PowerLeft => "Мощность левого колеса";

    public string PowerRight => "Мощность правого колеса";

    public string Throttle => "Газ";

    public string Turn => "Поворот";

    public string NotSeconds => "Время — это число секунд.";

    public string NoLights => "нет огоньков";

    public string NoDownSensor =>
        "Ни один датчик не смотрит в пол. Поставьте датчик «Вниз» в карточке «Датчики» на вкладке «Пульт» " +
        "или напишите, какой датчик спросить: robot.OnLine(\"down_left\").";

    public string NoGyro => "У этого робота нет гироскопа: наклон знают только роботы с новой прошивкой.";

    public string FinishedMoving =>
        "Программа закончилась, и робот остановился. Чтобы ехать дольше, добавьте Wait(секунды) или цикл while (true).";

    public string CannotConnect(Uri url, string detail) =>
        $"Не получилось связаться с Gearbit ({url}). Запустите Gearbit и попробуйте ещё раз. Подробно: {detail}";

    public string NoAnswer(string method) => $"Gearbit не ответил на команду {method}.";

    public string BadUrl(string url) => $"Неверный адрес Gearbit: {url}";

    public string NotNumber(string what) => $"{what} — это число от -100 до 100.";

    public string UnknownColor(string color, string colors) => $"Не знаю цвет «{color}». Можно: {colors}.";

    public string NoLight(string light, string lights) => $"У этого робота нет огонька «{light}». Есть: {lights}.";

    public string NoSensor(string place) =>
        $"У этой сборки нет датчика «{PlaceNames.GetValueOrDefault(place, place)}». Проверьте, куда он поставлен, в карточке «Датчики» на вкладке «Пульт».";

    public string UnknownTilt(string? direction) =>
        $"Не знаю, куда это — «{direction}». Напишите \"forward\", \"backward\", \"left\", \"right\" или \"any\".";

    public string RobotSays(string text) => $"Робот: {text}";
}

internal sealed class EnClientText : IClientText
{
    public string Language => "en";

    public string Stopped => "The program was stopped.";

    public string ConnectionLost => "Lost connection to Gearbit.";

    public string HubError => "Gearbit error.";

    public string NoRobot => "No robot connected. Press «No robot» at the top of Gearbit and choose a robot or the emulator.";

    public string Power => "Power";

    public string PowerLeft => "Left wheel power";

    public string PowerRight => "Right wheel power";

    public string Throttle => "Throttle";

    public string Turn => "Turn";

    public string NotSeconds => "Time is a number of seconds.";

    public string NoLights => "no lights";

    public string NoDownSensor =>
        "No sensor looks at the floor. Set a sensor to «Down» in the «Sensors» card on the «Remote» tab, " +
        "or write which sensor to ask: robot.OnLine(\"down_left\").";

    public string NoGyro => "This robot has no gyroscope: only robots with new firmware know their tilt.";

    public string FinishedMoving =>
        "The program ended, and the robot stopped. To drive longer, add Wait(seconds) or a while (true) loop.";

    public string CannotConnect(Uri url, string detail) =>
        $"Could not reach Gearbit ({url}). Start Gearbit and try again. Details: {detail}";

    public string NoAnswer(string method) => $"Gearbit did not answer the command {method}.";

    public string BadUrl(string url) => $"Wrong Gearbit address: {url}";

    public string NotNumber(string what) => $"{what} is a number from -100 to 100.";

    public string UnknownColor(string color, string colors) => $"I don't know the color «{color}». You can use: {colors}.";

    public string NoLight(string light, string lights) => $"This robot has no light «{light}». There are: {lights}.";

    public string NoSensor(string place) =>
        $"This model has no «{place}» sensor. Check where it is placed in the «Sensors» card on the «Remote» tab.";

    public string UnknownTilt(string? direction) =>
        $"I don't know which way «{direction}» is. Write \"forward\", \"backward\", \"left\", \"right\" or \"any\".";

    public string RobotSays(string text) => $"Robot: {text}";
}
