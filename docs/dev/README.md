# Gearbit: руководство разработчика

## Как устроено

```
 Gearbit.exe (WPF + WebView2)          браузер / Python / C#-клиент
        │  встроенный хаб                       │
        ▼                                       ▼
 ┌──────────────── Gearbit.Hub (ASP.NET Core, localhost:5280) ────────────────┐
 │  /ws  JSON-RPC 2.0     /api/info     статика wwwroot (веб-интерфейс)       │
 │  RpcDispatcher → HubMethods → RobotManager ─┬─ ControlArbiter (кто рулит)  │
 │                                             ├─ SafetyWatchdog (стоп 600 мс)│
 │                                             └─ Notifier (телеметрия 10 Гц) │
 └─────────────────────────────────────────────┬──────────────────────────────┘
                                               ▼
                        IRobot = ProtocolRobot(DeviceDescriptor, BuildProfile)
                               │                         │
                        IRobotProtocol              ITransport
                     (TudaoProtocol: кадры)   (WinRT BLE │ Loopback → эмулятор)
```

Главное правило: **хаб — единственный владелец связи с роботом.** Пульт, редактор блоков, Python и C# — всего лишь клиенты JSON-RPC. Поэтому безопасность (СТОП, «кнопка мертвеца», предел мощности, арбитр управления) реализована в одном месте и не зависит от клиента.

## Проекты

| Проект | Что внутри |
|---|---|
| `Gearbit.Core` | Модель: компоненты (`IMotor`, `IDistanceSensor`, `IImu`, `ILight`, `IBattery`), `IRobot`, `ProtocolRobot`, `DifferentialDrive`, описания (`DeviceDescriptor`, `BuildProfile`, `RobotCatalog`), интерфейсы `IRobotProtocol`, `ITransport`, `IDeviceScanner`, `ITransportFactory`, `LoopbackTransport`. Без зависимостей от Windows. |
| `Gearbit.Protocols.Tudao` | Протокол SuperBot: кадры `FF FE … FD FC`, разбор потока, телеметрия v1/v2. |
| `Gearbit.Transport.WinRtBle` | BLE через WinRT (`Windows.Devices.Bluetooth`): сканер и транспорт Nordic UART. |
| `Gearbit.Emulator` | Виртуальный контроллер TUDAO и 2D-мир (комната, препятствия, датчики). Подключается через `LoopbackTransport` и говорит на том же байтовом протоколе. |
| `Gearbit.Hub` | Хаб: JSON-RPC, методы, арбитр, страж, уведомления, раздача `wwwroot`. `GearbitHub.Build(args, addTransports)`. |
| `Gearbit.Server` | Консольный хаб без окна (для разработки и внешних клиентов). |
| `Gearbit.App` | Gearbit.exe: окно WPF + WebView2, хаб работает внутри процесса. |
| `tests/Gearbit.Tests` | xUnit: протокол, каталог, робот, эмулятор, хаб целиком через WebSocket. |
| `web/studio-ui` | Веб-интерфейс: TypeScript без фреймворка + Vite. Редактор блоков — scratch-blocks и свой интерпретатор (`src/blocks`). |

## Разделы

- [Сборка, запуск, тесты](building.md)
- [API хаба (JSON-RPC)](hub-api.md)
- [Как добавить робота или сборку](adding-a-robot.md)
- [Интерфейс и темы](ui-and-themes.md)
- [Редактор блоков](blocks.md)
- [Архитектура подробно](../ARCHITECTURE.md), [план этапов](../PLAN.md)
- [Протокол SuperBot](../PROTOCOL-SUPERBOT.md), [чек-лист замеров (этап 0)](../STAGE0-CHECKLIST.md)
- Для ИИ-агентов: [AGENTS.md](../../AGENTS.md)

## Принципы

- **Безопасность важнее удобства.** Любая новая команда движения проходит через `ControlArbiter.Authorize` и предел мощности. `robot.stop` работает всегда.
- **Устройство описывается данными.** Новые роботы и сборки добавляются JSON-файлами в `devices/` и `profiles/`, без правки кода, пока протокол знаком.
- **Непроверенное помечается.** Значения из открытых источников идут с `"verified": false`. Интерфейс показывает статус `draft`.
- **Всё локально.** Хаб слушает только `localhost` и проверяет `Origin`. Никакой телеметрии.
- **Тексты для пользователя — на русском**, простыми словами: их читает ребёнок.
