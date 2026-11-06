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
    /// Откуда разрешено подключаться к WebSocket. Запросы без заголовка Origin (Python, C#) разрешены.
    /// Без этой проверки любой сайт в браузере мог бы управлять роботом через localhost.
    /// </summary>
    public IList<string> AllowedOrigins { get; } = [];

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
