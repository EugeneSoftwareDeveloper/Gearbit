namespace Gearbit.Core.Robots;

/// <summary>Что пошло не так у робота или транспорта: по коду хаб показывает понятный текст на языке клиента.</summary>
public enum RobotErrorCode
{
    /// <summary>Робот или транспорт не подключён.</summary>
    NotConnected,

    /// <summary>Устройство не нашлось при подключении (выключено, далеко, Bluetooth на ПК выключен).</summary>
    DeviceNotFound,

    /// <summary>У устройства нет нужного сервиса или характеристики: это другая модель или сбой связи.</summary>
    ServiceNotFound,

    /// <summary>Не удалось подписаться на уведомления устройства.</summary>
    SubscribeFailed,

    /// <summary>Не удалось записать данные в устройство.</summary>
    WriteFailed,

    /// <summary>В описании устройства (devices/*.json) ошибка.</summary>
    BadDescriptor,

    /// <summary>Сырые кадры можно отправлять только в режиме замеров.</summary>
    ManualModeRequired,
}

/// <summary>
/// Ошибка робота или транспорта с кодом. Текст исключения — по-русски, для журнала;
/// пользователю хаб показывает текст по <see cref="Code"/>, а <see cref="Detail"/> — техническая подробность (статус BLE и т. п.).
/// </summary>
public sealed class RobotException(RobotErrorCode code, string message, string? detail = null) : InvalidOperationException(message)
{
    public RobotErrorCode Code { get; } = code;

    public string? Detail { get; } = detail;
}
