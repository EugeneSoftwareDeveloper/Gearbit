using System.Globalization;
using Gearbit.Core.Robots;

namespace Gearbit.Hub;

/// <summary>
/// Тексты, которые хаб показывает пользователю: ошибки методов, <c>safety.event</c>, советы при подключении.
/// У каждого клиента свой язык (<c>hub.hello</c> с <c>lang</c>), поэтому текст выбирается в момент отправки.
/// Новый текст добавляйте сюда и в оба класса: без перевода проект не соберётся.
/// Журнал и описания методов (<c>hub.methods</c>) остаются по-русски: они для разработчика.
/// </summary>
public interface IHubText
{
    /// <summary>Код языка: <c>ru</c>, <c>en</c>.</summary>
    string Language { get; }

    string InvalidJson { get; }

    string InvalidRequest { get; }

    string MethodNotFound(string method);

    string InternalError(string detail);

    string MissingParam(string name);

    string MissingNumber(string name);

    string BadValue(string name, string allowed);

    string RobotNotConnected { get; }

    string NoMotor(string id);

    string NoLight(string id);

    string NoDrive { get; }

    string ControlBusy(ControllerKind owner, string name);

    string StoppedByStop { get; }

    string RemoteSilent { get; }

    string ClientLeft(string name);

    string RobotLost { get; }

    /// <summary>Ошибка робота или транспорта по её коду; <paramref name="detail"/> — статус BLE и т. п.</summary>
    string RobotError(RobotErrorCode code, string? detail);

    string UnnamedDevice { get; }

    string ScanFailed(string transport, string detail);

    string DeviceGone { get; }

    string NoDeviceDescription(string id);

    string ModelUnknown { get; }

    string NoProfile(string id);

    string NoTransport(string kind);

    string ProtocolNotSupported(string name);

    string ConnectFailed(string detail);

    string EmulatorOff { get; }

    string EmulatorNotConnected { get; }

    string ServiceBlocksControl(string owner);

    string ServiceAlreadyRunning(string owner);

    string ServiceOwnedBy(string owner);

    string ServiceNotStarted { get; }

    string ServiceWatchdog(double seconds);

    string FrameEmpty { get; }

    string FrameOddDigits { get; }

    string FrameBadChars { get; }

    string FrameTooLong(int maxBytes);

    string LanguageNotSupported(string id, string available);

    string ProgramTooLarge { get; }

    string ProgramStartFailed(string language, string detail);

    /// <summary>Название программы, если вкладка его не передала.</summary>
    string DefaultProgramName { get; }

    string ProgramErrorFallback { get; }

    string OutputDropped { get; }

    string PythonNotFound { get; }

    string PythonPackageMissing(string folder);

    string CSharpHostMissing(string fileName);
}

/// <summary>Выбор текстов по языку клиента.</summary>
public static class HubText
{
    public static IHubText Russian { get; } = new RuHubText();

    public static IHubText English { get; } = new EnHubText();

    public static IReadOnlyList<IHubText> All { get; } = [Russian, English];

    /// <summary>Тексты для языка <c>ru</c>, <c>en</c>, <c>en-US</c>…; неизвестный язык — null.</summary>
    public static IHubText? Find(string? language)
    {
        if (string.IsNullOrWhiteSpace(language))
        {
            return null;
        }

        var code = language.Split('-', '_')[0];
        return All.FirstOrDefault(t => string.Equals(t.Language, code, StringComparison.OrdinalIgnoreCase));
    }

    internal static string Paren(string? detail) => string.IsNullOrWhiteSpace(detail) ? "" : $" ({detail})";
}

internal sealed class RuHubText : IHubText
{
    private static readonly CultureInfo Culture = CultureInfo.GetCultureInfo("ru-RU");

    public string Language => "ru";

    public string InvalidJson => "Некорректный JSON.";

    public string InvalidRequest => "Ожидался объект JSON-RPC с полем method.";

    public string MethodNotFound(string method) => $"Нет метода «{method}».";

    public string InternalError(string detail) => $"Внутренняя ошибка: {detail}";

    public string MissingParam(string name) => $"Не задан параметр «{name}».";

    public string MissingNumber(string name) => $"Не задан числовой параметр «{name}».";

    public string BadValue(string name, string allowed) => $"Недопустимое значение «{name}». Возможные: {allowed}.";

    public string RobotNotConnected => "Робот не подключён.";

    public string NoMotor(string id) => $"Нет мотора «{id}».";

    public string NoLight(string id) => $"Нет светодиода «{id}».";

    public string NoDrive => "У этой сборки нет привода. Управляйте моторами по отдельности.";

    public string ControlBusy(ControllerKind owner, string name) => owner switch
    {
        ControllerKind.Program => $"Роботом сейчас управляет программа «{name}». Нажмите «Забрать управление» или СТОП.",
        ControllerKind.Service => $"Робот занят замерами протокола («{name}»). Нажмите «Забрать управление» или СТОП.",
        _ => $"Роботом сейчас управляет пульт «{name}». Нажмите «Забрать управление» или СТОП.",
    };

    public string StoppedByStop => "Остановлено кнопкой СТОП";

    public string RemoteSilent => "Пульт перестал отвечать — робот остановлен.";

    public string ClientLeft(string name) => $"«{name}» отключился — робот остановлен.";

    public string RobotLost => "Связь с роботом потеряна. Проверьте питание и расстояние.";

    public string RobotError(RobotErrorCode code, string? detail) => code switch
    {
        RobotErrorCode.NotConnected => RobotNotConnected,
        RobotErrorCode.DeviceNotFound => "Робот не найден. Включён ли робот и Bluetooth на ПК?",
        RobotErrorCode.ServiceNotFound or RobotErrorCode.SubscribeFailed =>
            $"Робот ответил не так, как ожидалось{HubText.Paren(detail)}. Выключите и включите робота и подключитесь ещё раз.",
        RobotErrorCode.WriteFailed => $"Не удалось отправить команду роботу{HubText.Paren(detail)}. Проверьте питание и расстояние.",
        RobotErrorCode.BadDescriptor => $"Ошибка в описании робота (devices/*.json): не задан UUID «{detail}».",
        RobotErrorCode.ManualModeRequired => "Кадры вручную можно отправлять только в режиме замеров.",
        _ => $"Ошибка робота: {code}{HubText.Paren(detail)}.",
    };

    public string UnnamedDevice => "(без имени)";

    public string ScanFailed(string transport, string detail) =>
        transport == "ble" ? $"Bluetooth недоступен: {detail}" : $"{transport}: {detail}";

    public string DeviceGone => "Устройство не найдено. Запустите поиск ещё раз.";

    public string NoDeviceDescription(string id) => $"Нет описания устройства «{id}».";

    public string ModelUnknown => "Не удалось определить модель робота. Выберите её вручную.";

    public string NoProfile(string id) => $"Нет сборки «{id}».";

    public string NoTransport(string kind) => $"Нет транспорта «{kind}».";

    public string ProtocolNotSupported(string name) => $"Протокол «{name}» не поддерживается.";

    public string ConnectFailed(string detail) => $"Не удалось подключиться: {detail}";

    public string EmulatorOff => "Эмулятор не включён.";

    public string EmulatorNotConnected => "Эмулятор не подключён.";

    public string ServiceBlocksControl(string owner) =>
        $"Идут замеры протокола («{owner}»): пульт и программы выключены. Закончите замеры в журнале протокола или нажмите СТОП.";

    public string ServiceAlreadyRunning(string owner) => $"Замеры уже ведёт «{owner}».";

    public string ServiceOwnedBy(string owner) => $"Замеры ведёт «{owner}».";

    public string ServiceNotStarted => "Сначала включите режим замеров.";

    public string ServiceWatchdog(double seconds) =>
        $"Замеры: {seconds.ToString("0.#", Culture)} с без новых кадров — моторы остановлены.";

    public string FrameEmpty => "Пустой кадр: введите байты в hex, например FF FE 01 04 FD FC.";

    public string FrameOddDigits => "Нечётное число hex-символов: у каждого байта две цифры (0A, а не A).";

    public string FrameBadChars => "В кадре есть символы, которых нет в hex: допустимы 0–9 и A–F.";

    public string FrameTooLong(int maxBytes) => $"Кадр длиннее {maxBytes} байт.";

    public string LanguageNotSupported(string id, string available) => $"Язык «{id}» не поддерживается. Есть: {available}.";

    public string ProgramTooLarge => "Программа слишком большая.";

    public string ProgramStartFailed(string language, string detail) => $"Не удалось запустить {language}: {detail}";

    public string DefaultProgramName => "программа";

    public string ProgramErrorFallback => "Ошибка";

    public string OutputDropped => "… программа печатает слишком быстро: часть строк пропущена.";

    public string PythonNotFound =>
        "Python не найден. Установите Python 3 с сайта python.org (при установке отметьте «Add python.exe to PATH») и перезапустите Gearbit.";

    public string PythonPackageMissing(string folder) => $"Не найден пакет gearbit в папке {folder}. Переустановите Gearbit.";

    public string CSharpHostMissing(string fileName) => $"Не найден запускатель программ на C# ({fileName}). Переустановите Gearbit.";
}

internal sealed class EnHubText : IHubText
{
    public string Language => "en";

    public string InvalidJson => "Invalid JSON.";

    public string InvalidRequest => "Expected a JSON-RPC object with a method field.";

    public string MethodNotFound(string method) => $"There is no method «{method}».";

    public string InternalError(string detail) => $"Internal error: {detail}";

    public string MissingParam(string name) => $"Parameter «{name}» is missing.";

    public string MissingNumber(string name) => $"Number parameter «{name}» is missing.";

    public string BadValue(string name, string allowed) => $"Invalid value of «{name}». Allowed: {allowed}.";

    public string RobotNotConnected => "The robot is not connected.";

    public string NoMotor(string id) => $"There is no motor «{id}».";

    public string NoLight(string id) => $"There is no light «{id}».";

    public string NoDrive => "This model has no drive. Control the motors one by one.";

    public string ControlBusy(ControllerKind owner, string name) => owner switch
    {
        ControllerKind.Program => $"The robot is controlled by the program «{name}» right now. Press «Take control» or STOP.",
        ControllerKind.Service => $"The robot is busy with protocol measurements («{name}»). Press «Take control» or STOP.",
        _ => $"The robot is controlled by the remote «{name}» right now. Press «Take control» or STOP.",
    };

    public string StoppedByStop => "Stopped with the STOP button";

    public string RemoteSilent => "The remote stopped responding — the robot is stopped.";

    public string ClientLeft(string name) => $"«{name}» disconnected — the robot is stopped.";

    public string RobotLost => "Lost connection to the robot. Check the power and the distance.";

    public string RobotError(RobotErrorCode code, string? detail) => code switch
    {
        RobotErrorCode.NotConnected => RobotNotConnected,
        RobotErrorCode.DeviceNotFound => "Robot not found. Is the robot switched on, and is Bluetooth on the PC turned on?",
        RobotErrorCode.ServiceNotFound or RobotErrorCode.SubscribeFailed =>
            $"The robot did not answer as expected{HubText.Paren(detail)}. Switch the robot off and on, then connect again.",
        RobotErrorCode.WriteFailed => $"Could not send a command to the robot{HubText.Paren(detail)}. Check the power and the distance.",
        RobotErrorCode.BadDescriptor => $"Error in the robot description (devices/*.json): UUID «{detail}» is not set.",
        RobotErrorCode.ManualModeRequired => "Manual frames can be sent only in measurement mode.",
        _ => $"Robot error: {code}{HubText.Paren(detail)}.",
    };

    public string UnnamedDevice => "(no name)";

    public string ScanFailed(string transport, string detail) =>
        transport == "ble" ? $"Bluetooth is unavailable: {detail}" : $"{transport}: {detail}";

    public string DeviceGone => "Device not found. Search again.";

    public string NoDeviceDescription(string id) => $"There is no description of device «{id}».";

    public string ModelUnknown => "Could not tell the robot model. Choose it yourself.";

    public string NoProfile(string id) => $"There is no model «{id}».";

    public string NoTransport(string kind) => $"There is no transport «{kind}».";

    public string ProtocolNotSupported(string name) => $"Protocol «{name}» is not supported.";

    public string ConnectFailed(string detail) => $"Could not connect: {detail}";

    public string EmulatorOff => "The emulator is turned off.";

    public string EmulatorNotConnected => "The emulator is not connected.";

    public string ServiceBlocksControl(string owner) =>
        $"Protocol measurements are running («{owner}»): the remote and programs are off. Finish the measurements in the protocol log or press STOP.";

    public string ServiceAlreadyRunning(string owner) => $"Measurements are already run by «{owner}».";

    public string ServiceOwnedBy(string owner) => $"Measurements are run by «{owner}».";

    public string ServiceNotStarted => "Turn on measurement mode first.";

    public string ServiceWatchdog(double seconds) =>
        $"Measurements: no new frames for {seconds.ToString("0.#", CultureInfo.InvariantCulture)} s — the motors are stopped.";

    public string FrameEmpty => "Empty frame: type the bytes in hex, for example FF FE 01 04 FD FC.";

    public string FrameOddDigits => "Odd number of hex digits: each byte has two digits (0A, not A).";

    public string FrameBadChars => "The frame has characters that are not hex: use 0–9 and A–F.";

    public string FrameTooLong(int maxBytes) => $"The frame is longer than {maxBytes} bytes.";

    public string LanguageNotSupported(string id, string available) => $"Language «{id}» is not supported. Available: {available}.";

    public string ProgramTooLarge => "The program is too big.";

    public string ProgramStartFailed(string language, string detail) => $"Could not start {language}: {detail}";

    public string DefaultProgramName => "program";

    public string ProgramErrorFallback => "Error";

    public string OutputDropped => "… the program prints too fast: some lines were skipped.";

    public string PythonNotFound =>
        "Python not found. Install Python 3 from python.org (tick «Add python.exe to PATH» during installation) and restart Gearbit.";

    public string PythonPackageMissing(string folder) => $"The gearbit package is not found in {folder}. Reinstall Gearbit.";

    public string CSharpHostMissing(string fileName) => $"The C# program launcher ({fileName}) is not found. Reinstall Gearbit.";
}
