namespace Gearbit.Hub;

/// <summary>Настройки хаба (секция «Hub» в appsettings.json или параметры командной строки).</summary>
public sealed class HubOptions
{
    public const int DefaultPort = 5280;

    public int Port { get; set; } = DefaultPort;

    /// <summary>Папка с описаниями устройств. По умолчанию — devices рядом с программой.</summary>
    public string? DevicesDirectory { get; set; }

    public string? ProfilesDirectory { get; set; }

    /// <summary>
    /// «Кнопка мертвеца» для пульта: если пульт не присылал команд движения столько миллисекунд,
    /// а моторы крутятся — робот останавливается (зависла вкладка, отпустили клавишу, пропала сеть).
    /// </summary>
    public int RemoteWatchdogMs { get; set; } = 600;

    /// <summary>
    /// Страж режима замеров: после последнего кадра, отправленного вручную, прошло столько миллисекунд — моторы в 0.
    /// Длиннее, чем у пульта: в чек-листе есть проверка «робот останавливается сам через 10 с без кадров».
    /// </summary>
    public int ServiceWatchdogMs { get; set; } = 15_000;

    /// <summary>
    /// Откуда разрешено подключаться к WebSocket. Запросы без заголовка Origin (Python, C#) разрешены.
    /// Без этой проверки любой сайт в браузере мог бы управлять роботом через localhost.
    /// </summary>
    public IList<string> AllowedOrigins { get; } = [];

    /// <summary>
    /// Путь к python.exe. По умолчанию Python ищется сам: python\runtime рядом с программой,
    /// py.exe (лаунчер с python.org), python.exe в PATH.
    /// </summary>
    public string? PythonPath { get; set; }

    /// <summary>Папка, в которой лежит пакет gearbit для Python. По умолчанию — python рядом с программой.</summary>
    public string? PythonPackageDirectory { get; set; }

    /// <summary>Путь к Gearbit.ScriptHost.exe — запускателю программ на C#. По умолчанию — рядом с программой.</summary>
    public string? CSharpHostPath { get; set; }

    /// <summary>Куда сохраняются запускаемые программы. По умолчанию — %TEMP%\Gearbit\programs.</summary>
    public string? ProgramsDirectory { get; set; }

    /// <summary>
    /// Где хранятся настройки интерфейса (settings.json) и история программ (History).
    /// По умолчанию — %LOCALAPPDATA%\Gearbit: не %TEMP%, его чистит Windows.
    /// </summary>
    public string? DataDirectory { get; set; }

    internal string EffectiveDataDirectory =>
        DataDirectory ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Gearbit");

    /// <summary>Сколько длится сканирование по умолчанию, мс.</summary>
    public int ScanDurationMs { get; set; } = 4000;

    internal IEnumerable<string> EffectiveOrigins =>
        AllowedOrigins.Concat(
        [
            $"http://localhost:{Port}",
            $"http://127.0.0.1:{Port}",
            "http://localhost:5173", // Vite в режиме разработки
            "http://127.0.0.1:5173",
        ]);
}
