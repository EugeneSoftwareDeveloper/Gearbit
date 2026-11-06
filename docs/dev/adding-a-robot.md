# Как добавить робота или сборку

Есть три уровня, от простого к сложному:

1. **Новая сборка** из того же набора (танк, пёс): только JSON в `profiles/`.
2. **Новый робот с известным протоколом** (другое имя, другой набор портов): JSON в `devices/`.
3. **Новый протокол или транспорт**: код, реализация `IRobotProtocol` или `ITransport`.

Файлы из `devices/` и `profiles/` копируются рядом с программой. Их можно править без пересборки: перезапустите Gearbit.

## 1. Сборка (`profiles/*.json`)

Сборка отвечает на вопросы: какие моторы — колёса, куда смотрят датчики, какой разумный предел мощности.

```json
{
  "$schemaVersion": 1,
  "id": "superbot-tank",
  "title": "Танк",
  "device": "tudao-superbot",
  "status": "draft",
  "drive": { "type": "differential", "left": "M1", "right": "M2", "invertLeft": true, "invertRight": false },
  "aliases": { "front": "D1", "left_track": "M1", "right_track": "M2", "turret": "M3" },
  "limits": { "maxPowerPercent": 50, "kidMode": true },
  "calibration": { "distance": { "D1": { "levelToCm": null } } }
}
```

| Поле | Смысл |
|---|---|
| `device` | `id` модели из `devices/`. |
| `drive` | Привод. Сейчас бывает только `differential`: левый и правый мотор и их инверсия. Если поля нет, `drive.*` вернёт `NotSupported`, но моторами можно управлять по отдельности. |
| `aliases` | Понятные имена для портов. Их видят программы (`motor.setPower {id:"turret"}`) и радар (`front`, `right`, `left`, `front_left`, `front_right`, `back` задают направление луча). |
| `limits.maxPowerPercent` | Предел мощности, который предлагается при подключении. |
| `calibration.distance.<id>.levelToCm` | Массив из 7 чисел: уровень 0–6 → сантиметры. `null` — не откалибровано. |
| `status` | `draft`, пока сборка не проверена на настоящем роботе. |

Проверка: `dotnet test` (тест `CatalogTests` загружает все JSON), затем подключение к эмулятору с этой сборкой.

## 2. Модель робота (`devices/*.json`)

Описание модели: как её найти, через что подключиться, параметры протокола, список компонентов. Пример — `devices/tudao-superbot.json`.

- `match.namePrefixes` и `match.services` — по ним `RobotCatalog.Match` узнаёт устройство при сканировании.
- `transport` — тип (`ble-gatt`), UUID сервиса и характеристик, размер куска, запись с подтверждением или без.
- `protocol.name` — какой `IRobotProtocolFactory` использовать (`tudao-uart`). Остальные поля `protocol` читает сам протокол: коды цветов, диапазон мощности, частота отправки, варианты телеметрии.
- `components` — `[{id, type, title, requiresFirmware?}]`. Типы: `motor`, `distance`, `imu`, `light`, `battery`.

**Правило `verified`.** Значение, взятое из чужого кода или догадки, получает `"verified": false` и пояснение в `note`. После замера на роботе — `true` и короткая заметка, как проверяли. Чек-лист — [STAGE0-CHECKLIST.md](../STAGE0-CHECKLIST.md).

## 3. Новый протокол

Реализуйте в отдельном проекте `Gearbit.Protocols.<Имя>`:

```csharp
public sealed class MyProtocolFactory : IRobotProtocolFactory
{
    public string Name => "my-protocol";               // совпадает с devices/*.json → protocol.name
    public IRobotProtocol Create(DeviceDescriptor d) => new MyProtocol(MyOptions.From(d));
}

public sealed class MyProtocol : IRobotProtocol
{
    public string Name => "my-protocol";
    public ProtocolTiming Timing { get; }              // частота и повтор кадра состояния
    public int DistanceMaxLevel => 6;
    public IReadOnlyList<ConnectStep> ConnectSequence { get; }  // авторизация, запрос UID…
    public byte[] EncodeState(RobotOutputState state) { … }     // моторы и свет → кадр
    public IFrameReader CreateReader() => new MyFrameReader();  // байты → TelemetryMessage / DeviceInfoMessage
}
```

- Протокол **не знает о транспорте**: получает байты и отдаёт байты.
- `ProtocolRobot` сам отправляет состояние с нужной частотой и повторяет его (`Timing`), применяет предел мощности (инверсию колёс делает `DifferentialDrive`), разбирает телеметрию в компоненты.
- `IFrameReader.Feed` получает куски произвольной длины: собирайте кадры сами (пример — `TudaoStreamSplitter`).
- Зарегистрируйте фабрику в `GearbitHub.AddHub`: `services.AddSingleton<IRobotProtocolFactory, MyProtocolFactory>()`.

Тесты: кодирование кадров по эталонным байтам, разбор потока, нарезанного на случайные куски, `ProtocolRobot` поверх `LoopbackTransport`. По образцу `TudaoProtocolTests` и `ProtocolRobotTests`.

## 4. Новый транспорт

Реализуйте `IDeviceScanner` и `ITransportFactory` с общим `TransportKind` (например, `"serial"`) и `ITransport`:

- `ConnectAsync` / `DisconnectAsync`, событие `StateChanged`. Неожиданный разрыв сообщается состоянием `Faulted` с причиной: робот переходит в `lost`, хаб рассылает `safety.event`.
- `WriteAsync` сам режет данные на куски допустимого размера.
- `DataReceived` — сырые байты, без разбора.
- `DiscoveredDevice.Id` — с префиксом вида: `serial:COM5`.

Регистрация — через `addTransports` в `GearbitHub.Build` (как BLE в `Gearbit.Server/Program.cs` и `Gearbit.App/App.xaml.cs`) с `TryAddEnumerable`, чтобы сканеры складывались, а не заменяли друг друга.

## 5. Эмулятор

Эмулятор (`Gearbit.Emulator`) говорит на байтовом протоколе TUDAO через `LoopbackTransport`, поэтому проверяет весь путь: кадры, частоту, разбор телеметрии. Для другого протокола сделайте свой эмулятор контроллера по образцу `TudaoEmulator`. Мир (`EmulatorWorld`: комната, дифференциальный привод, лучи датчиков) можно использовать повторно.
