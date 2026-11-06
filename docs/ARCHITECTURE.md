# Gearbit — архитектура компонентов

Сопутствующие документы: [PLAN.md](PLAN.md) (план и этапы), [PROTOCOL-SUPERBOT.md](PROTOCOL-SUPERBOT.md) (протокол).

## 1. Общая схема

Цвет обозначает язык: 🟪 C# · 🟩 TypeScript/JS · 🟧 Python · ⬜ данные и железо.

```mermaid
flowchart TB
    subgraph WIN["Окно Gearbit.App — WPF + WebView2 (C#)"]
        UI["Пульт, телеметрия, редактор Monaco<br/><i>TypeScript</i>"]
        SCR["Блоки: scratch-blocks<br/>+ интерпретатор<br/><i>TypeScript</i>"]
    end

    subgraph PROC["Программы пользователя — отдельные процессы"]
        PY["Python-программа<br/>+ пакет gearbit<br/><i>Python</i>"]
        CS["C#-программа<br/>ScriptHost (Roslyn)<br/><i>C#</i>"]
        IDE["Внешние IDE:<br/>VS Code, Visual Studio,<br/>Polyglot Notebooks"]
    end

    subgraph HUB["Gearbit.Hub — ASP.NET Core (C#)"]
        RPC["JSON-RPC API<br/>WebSocket, localhost"]
        ARB["ControlArbiter<br/>кто за рулём"]
        SAFE["SafetySupervisor<br/>СТОП, watchdog, лимиты"]
        TEL["Telemetry bus<br/>~20 Гц"]
        RUN["ProgramRunner<br/>запуск и kill процессов"]
    end

    subgraph CORE["Gearbit.Core + драйверы (C#)"]
        MODEL["Модель робота<br/>IRobot, компоненты,<br/>сборки, калибровка"]
        DRV["Драйвер<br/>желаемое состояние → кадры"]
        PROTO["Протоколы (чистые функции)<br/>TudaoUart · ApitorF0FF"]
        TR["Транспорты<br/>WinRT BLE · Loopback ·<br/>позже Serial/TCP"]
        SIM["Симулятор<br/>2D-комната, лучи-датчики"]
    end

    JSON[("devices/*.json<br/>profiles/*.json")]
    BOT["SuperBot<br/>BLE, Nordic UART"]
    EXT["micro:bit / ESP32<br/>доп. датчики (позже)"]

    UI & SCR -->|WebSocket| RPC
    PY & CS -->|WebSocket| RPC
    IDE -.->|те же клиенты| RPC
    RPC --> ARB --> SAFE --> MODEL
    TEL --> RPC
    RUN -->|старт/kill| PY & CS
    MODEL --> DRV --> PROTO
    DRV --> TR
    MODEL -. профиль .- JSON
    TR -->|Bluetooth LE| BOT
    TR -.-> EXT
    SIM -. вместо BLE .- DRV

    classDef cs fill:#EEEDFE,stroke:#534AB7,color:#3C3489
    classDef ts fill:#E1F5EE,stroke:#0F6E56,color:#085041
    classDef py fill:#FAECE7,stroke:#993C1D,color:#712B13
    classDef data fill:#F1EFE8,stroke:#5F5E5A,color:#444441
    class RPC,ARB,SAFE,TEL,RUN,MODEL,DRV,PROTO,TR,SIM,CS cs
    class UI,SCR ts
    class PY py
    class JSON,BOT,EXT,IDE data
```

## 2. Компоненты: язык, технология, ответственность

| Компонент | Язык / технология | Отвечает за | Этап |
|---|---|---|---|
| **Gearbit.App** | C#, WPF + WebView2 | Окно на весь экран, запуск хаба, хостинг веб-UI | 1 |
| **studio-ui** | TypeScript, Vite, Lit/Preact, Monaco | Пульт, телеметрия, переключатель режимов, редакторы Python/C#, консоль | 1, 3, 4 |
| **studio-ui / blocks** | TypeScript, scratch-blocks (Blockly 12) | Вкладка «Блоки»: редактор, блоки робота на русском, интерпретатор — клиент хаба | 2 |
| **Gearbit.Hub** | C#, ASP.NET Core (Kestrel), JSON-RPC | Единственный владелец робота: API, арбитр, безопасность, телеметрия, запуск программ | 1 |
| **Gearbit.Core** | C# (.NET 10, без I/O) | `IRobot`, компоненты-возможности, сборки, калибровка, лимиты | 1 |
| **Gearbit.Protocols.Tudao** | C# (чистые функции) | Кодирование кадров `FF FE…FD FC`, разбор телеметрии 11/19 байт | 1 |
| **Gearbit.Protocols.Apitor** | C# | Кадры `55 AA…` (Robot J) — проверка расширяемости | 6 |
| **Gearbit.Transport.WinRtBle** | C#, WinRT `Windows.Devices.Bluetooth` | Скан, подключение, запись чанками, уведомления, переподключение | 1 |
| **Gearbit.Simulator** | C# (модель) + TS (отрисовка на canvas) | Виртуальный робот с теми же компонентами | 5 |
| **Gearbit.ScriptHost** | C#, Roslyn Scripting | Компиляция и запуск C#-скриптов в отдельном процессе | 4 |
| **Gearbit.Client** | C# (NuGet) | Клиент хаба для своих C#-программ и Notebooks | 4 |
| **gearbit** (pip) | Python 3 (`websockets`) | Клиент хаба для Python, простой синхронный API | 3 |
| **Python embeddable** | CPython (portable) | Python без установки | 3 |
| **devices/\*.json** | JSON | Описание модели робота: как найти, UUID, компоненты, параметры протокола | 1 |
| **profiles/\*.json** | JSON | Сборки: какой мотор левый, инверсия, куда смотрят датчики, лимиты | 1 |
| **tools/ble-sniffer** | C# (консоль) | Скан, сырые кадры, ручная отправка hex (разбор новых роботов) | 0/1 |

## 3. Как проходит команда

```mermaid
sequenceDiagram
    participant S as Блок «ехать вперёд мощность 50»
    participant H as Hub (RPC)
    participant A as Arbiter + Safety
    participant D as Драйвер SuperBot
    participant P as TudaoUartProtocol
    participant T as WinRT BLE
    participant R as Робот

    S->>H: drive.tank {left:50, right:50, source:"program"}
    H->>A: есть lease? лимиты сборки
    A->>D: желаемое состояние M1=+50%, M2=+50% (инверсия по сборке)
    Note over D: цикл отправки ≤ 20 Гц, «последняя запись побеждает»
    D->>P: Encode(state)
    P-->>D: FF FE 09 01 02 05 FB 00 … FD FC
    D->>T: Write (по 20 байт)
    T->>R: GATT write 6e400002
    R-->>T: notify 6e400003: FF FE 06 … (датчики)
    T-->>D: байты
    D->>P: Decode(frame)
    P-->>D: D1=3, D2=1, батарея, наклон
    D-->>H: TelemetryFrame
    H-->>S: telemetry (все клиенты)
```

СТОП идёт мимо очереди: `emergency.stop` → Safety → нулевое состояние → немедленная отправка, без ожидания цикла.

## 4. Как устроен драйвер (адаптеры)

```mermaid
classDiagram
    class IRobotDriverFactory {
        +Probe(Advertisement) MatchResult
        +CreateAsync(DeviceDescriptor, BuildProfile) IRobot
    }
    class IRobot {
        +Info
        +Components
        +Get~T~(id) T
        +Telemetry IObservable
        +StopAllAsync()
    }
    class ITransport {
        +ConnectAsync()
        +WriteAsync(bytes)
        +Received IObservable~bytes~
        +State
    }
    class IRobotProtocol {
        +Handshake() frames
        +Encode(RobotState) bytes
        +Decode(bytes) TelemetryFrame?
    }
    class DeviceDescriptor {
        json: match, transport, protocol, components
    }
    class BuildProfile {
        json: drive, aliases, limits, calibration
    }
    IRobotDriverFactory ..> IRobot : создаёт
    IRobot o-- ITransport
    IRobot o-- IRobotProtocol
    IRobot ..> DeviceDescriptor
    IRobot ..> BuildProfile
    ITransport <|.. WinRtBleTransport
    ITransport <|.. LoopbackTransport
    IRobotProtocol <|.. TudaoUartProtocol
    IRobotProtocol <|.. ApitorF0FFProtocol
    IRobotProtocol <|.. SimulatorProtocol
```

**Чтобы добавить новый робот**, нужно:
1. описать его в `devices/<id>.json`;
2. если формат кадров новый, написать `IRobotProtocol`: чистые функции и тесты на захваченных кадрах;
3. если связь новая (USB, Wi-Fi), написать `ITransport`;
4. добавить сборки в `profiles/`.

Хаб, UI, редактор блоков, Python- и C#-клиенты при этом не меняются: они видят только возможности.
