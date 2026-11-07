# Gearbit: руководство разработчика

**Русский** · [English](../en/dev/README.md)

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
| `Gearbit.Hub` | Хаб: JSON-RPC, методы, арбитр, страж, уведомления, раздача `wwwroot`. `GearbitHub.Build(args, addTransports)`. В `Programs/` — `ProgramRunner`: программы на Python и C# в отдельных процессах. |
| `Gearbit.Client` | Клиент хаба для C#: синхронный `Robot` (те же команды, что в Python), `RobotScript` (`robot`, `Wait`) для скриптов и консольных программ. |
| `Gearbit.ScriptHost` | Запускатель программ на C#: Roslyn Scripting, ошибки компиляции и выполнения по-русски. Копируется в папку `csharp` рядом с хабом (`CopyToHost.targets`). |
| `Gearbit.Server` | Консольный хаб без окна (для разработки и внешних клиентов). |
| `Gearbit.App` | Gearbit.exe: окно WPF + WebView2, хаб работает внутри процесса. |
| `tests/Gearbit.Tests` | xUnit: протокол, каталог, робот, эмулятор, хаб целиком через WebSocket. |
| `web/studio-ui` | Веб-интерфейс: TypeScript без фреймворка + Vite. Редактор блоков — scratch-blocks и свой интерпретатор (`src/blocks`). Вкладки Python и C# — CodeMirror 6 (`src/code`). |
| `python/` | Пакет `gearbit` для Python: синхронный клиент хаба на стандартной библиотеке, понятные ошибки на русском и английском, свои тесты (`unittest`). См. [python/README.md](../../python/README.md). |

## Разделы

- [Сборка, запуск, тесты](building.md)
- [API хаба (JSON-RPC)](hub-api.md)
- [Как добавить робота или сборку](adding-a-robot.md)
- [Интерфейс и темы](ui-and-themes.md)
- [Языки: русский и английский](i18n.md)
- [Редактор блоков](blocks.md)
- Программы на Python и C#: [API хаба → Программы](hub-api.md#программы-python-c), [пакет gearbit](../../python/README.md), [C# для пользователя](../user/csharp.md), [как это устроено](../ARCHITECTURE.md#5-как-работает-программа-на-python-или-c)
- [Архитектура подробно](../ARCHITECTURE.md), [план этапов](../PLAN.md)
- [Протокол SuperBot](../PROTOCOL-SUPERBOT.md), [чек-лист замеров (этап 0)](../STAGE0-CHECKLIST.md)
- Для ИИ-агентов: [AGENTS.md](../../AGENTS.md)

## Документация на двух языках

Основной язык — русский: `docs/`, `README.md`, `python/README.md`. Английская копия повторяет ту же структуру в `docs/en/`, а у README в папках рядом лежит `README.en.md`. Каждый файл начинается с переключателя языка сразу после заголовка. Меняете документ — поменяйте в том же коммите и его копию на другом языке. `AGENTS.md`, `CLAUDE.md`, `LICENSE` и `THIRD-PARTY-NOTICES.md` не переводятся.

Интерфейс на двух языках, поэтому английские документы пишут надписи так, как их показывает английский интерфейс: **Connect**.

## Принципы

- **Безопасность важнее удобства.** Любая новая команда движения проходит через `ControlArbiter.Authorize` и предел мощности. `robot.stop` работает всегда.
- **Устройство описывается данными.** Новые роботы и сборки добавляются JSON-файлами в `devices/` и `profiles/`, без правки кода, пока протокол знаком.
- **Непроверенное помечается.** Значения из открытых источников идут с `"verified": false`. Интерфейс показывает статус `draft`.
- **Всё локально.** Хаб слушает только `localhost` и проверяет `Origin`. Никакой телеметрии.
- **Тексты для пользователя — на русском и английском**, простыми словами: их читает ребёнок. Как добавить текст — [Языки](i18n.md).
- **Лицензия:** GPL-3.0-only ([LICENSE](../../LICENSE)). Новая библиотека, которая попадает в сборку, должна иметь лицензию, совместимую с GPL-3.0, и записывается в [THIRD-PARTY-NOTICES.md](../../THIRD-PARTY-NOTICES.md).
