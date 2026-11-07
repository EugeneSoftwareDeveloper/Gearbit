# Gearbit — component architecture

[Русский](../ARCHITECTURE.md) · **English**

Related documents: [PLAN.md](PLAN.md) (plan and stages), [PROTOCOL-SUPERBOT.md](PROTOCOL-SUPERBOT.md) (protocol).

## 1. Overview

Color shows the language: 🟪 C# · 🟩 TypeScript/JS · 🟧 Python · ⬜ data and hardware.

```mermaid
flowchart TB
    subgraph WIN["Gearbit.App window — WPF + WebView2 (C#)"]
        UI["Remote, telemetry,<br/>CodeMirror code editor<br/><i>TypeScript</i>"]
        SCR["Blocks: scratch-blocks<br/>+ interpreter<br/><i>TypeScript</i>"]
    end

    subgraph PROC["User programs — separate processes"]
        PY["Python program<br/>+ gearbit package<br/><i>Python</i>"]
        CS["C# program<br/>ScriptHost (Roslyn)<br/><i>C#</i>"]
        IDE["External IDEs:<br/>VS Code, Visual Studio,<br/>Polyglot Notebooks"]
    end

    subgraph HUB["Gearbit.Hub — ASP.NET Core (C#)"]
        RPC["JSON-RPC API<br/>WebSocket, localhost"]
        ARB["ControlArbiter<br/>who is driving"]
        SAFE["SafetySupervisor<br/>STOP, watchdog, limits"]
        TEL["Telemetry bus<br/>~20 Hz"]
        RUN["ProgramRunner<br/>starting and killing processes"]
    end

    subgraph CORE["Gearbit.Core + drivers (C#)"]
        MODEL["Robot model<br/>IRobot, components,<br/>builds, calibration"]
        DRV["Driver<br/>desired state → frames"]
        PROTO["Protocols (pure functions)<br/>TudaoUart · ApitorF0FF"]
        TR["Transports<br/>WinRT BLE · Loopback ·<br/>later Serial/TCP"]
        SIM["Simulator<br/>2D room, sensor rays"]
    end

    JSON[("devices/*.json<br/>profiles/*.json")]
    BOT["SuperBot<br/>BLE, Nordic UART"]
    EXT["micro:bit / ESP32<br/>extra sensors (later)"]

    UI & SCR -->|WebSocket| RPC
    PY & CS -->|WebSocket| RPC
    IDE -.->|same clients| RPC
    RPC --> ARB --> SAFE --> MODEL
    TEL --> RPC
    RUN -->|start/kill| PY & CS
    MODEL --> DRV --> PROTO
    DRV --> TR
    MODEL -. profile .- JSON
    TR -->|Bluetooth LE| BOT
    TR -.-> EXT
    SIM -. instead of BLE .- DRV

    classDef cs fill:#EEEDFE,stroke:#534AB7,color:#3C3489
    classDef ts fill:#E1F5EE,stroke:#0F6E56,color:#085041
    classDef py fill:#FAECE7,stroke:#993C1D,color:#712B13
    classDef data fill:#F1EFE8,stroke:#5F5E5A,color:#444441
    class RPC,ARB,SAFE,TEL,RUN,MODEL,DRV,PROTO,TR,SIM,CS cs
    class UI,SCR ts
    class PY py
    class JSON,BOT,EXT,IDE data
```

## 2. Components: language, technology, responsibility

| Component | Language / technology | Responsible for | Stage |
|---|---|---|---|
| **Gearbit.App** | C#, WPF + WebView2 | A full-screen window, starting the hub, hosting the web UI | 1 |
| **studio-ui** | TypeScript, Vite, no framework | Remote, telemetry, mode switcher, protocol log | 1 |
| **studio-ui / code** | TypeScript, CodeMirror 6 | The Python and C# tabs: editor, output, «Команды» (Commands), running via `program.run` | 3, 4 |
| **studio-ui / blocks** | TypeScript, scratch-blocks (Blockly 12) | The Blocks tab: editor, robot blocks in Russian, the interpreter is a hub client | 2 |
| **Gearbit.Hub** | C#, ASP.NET Core (Kestrel), JSON-RPC | The only owner of the robot: API, arbiter, safety, telemetry, running programs | 1 |
| **Gearbit.Core** | C# (.NET 10, no I/O) | `IRobot`, capability components, builds, calibration, limits | 1 |
| **Gearbit.Protocols.Tudao** | C# (pure functions) | Encoding `FF FE…FD FC` frames, parsing 11/19-byte telemetry | 1 |
| **Gearbit.Protocols.Apitor** | C# | `55 AA…` frames (Robot J) — an extensibility check | 6 |
| **Gearbit.Transport.WinRtBle** | C#, WinRT `Windows.Devices.Bluetooth` | Scan, connect, chunked writes, notifications, reconnect | 1 |
| **Gearbit.Simulator** | C# (model) + TS (canvas rendering) | A virtual robot with the same components | 5 |
| **Gearbit.ScriptHost** | C#, Roslyn Scripting | Compiling and running C# scripts in a separate process | 4 |
| **Gearbit.Client** | C# (a library, later NuGet) | A synchronous hub client: scripts in ScriptHost, your own C# programs and Notebooks | 4 |
| **gearbit** (the `python/` folder) | Python 3.9+, standard library only | The hub client for Python, a simple synchronous API, clear errors in Russian | 3 |
| **Python** | CPython 3.9+ from python.org or portable in `python\runtime` | Runs Python programs; the hub finds it itself (`PythonLanguage`) | 3 |
| **devices/\*.json** | JSON | A robot model description: how to find it, UUIDs, components, protocol parameters | 1 |
| **profiles/\*.json** | JSON | Builds: which motor is left, inversion, where sensors look, limits | 1 |
| **tools/ble-sniffer** | C# (console) | Scanning, raw frames, sending hex by hand (studying new robots) | 0/1 |

## 3. How a command travels

```mermaid
sequenceDiagram
    participant S as Block "drive forward power 50"
    participant H as Hub (RPC)
    participant A as Arbiter + Safety
    participant D as SuperBot driver
    participant P as TudaoUartProtocol
    participant T as WinRT BLE
    participant R as Robot

    S->>H: drive.tank {left:50, right:50, source:"program"}
    H->>A: lease held? build limits
    A->>D: desired state M1=+50%, M2=+50% (inversion per build)
    Note over D: send loop ≤ 20 Hz, "last write wins"
    D->>P: Encode(state)
    P-->>D: FF FE 09 01 02 05 FB 00 … FD FC
    D->>T: Write (20 bytes at a time)
    T->>R: GATT write 6e400002
    R-->>T: notify 6e400003: FF FE 06 … (sensors)
    T-->>D: bytes
    D->>P: Decode(frame)
    P-->>D: D1=3, D2=1, battery, tilt
    D-->>H: TelemetryFrame
    H-->>S: telemetry (all clients)
```

STOP skips the queue: `emergency.stop` → Safety → zero state → sent immediately, without waiting for the loop.

## 4. How the driver is built (adapters)

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
    IRobotDriverFactory ..> IRobot : creates
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

**To add a new robot** you need to:
1. describe it in `devices/<id>.json`;
2. if the frame format is new, write an `IRobotProtocol`: pure functions and tests on captured frames;
3. if the link is new (USB, Wi-Fi), write an `ITransport`;
4. add builds to `profiles/`.

The hub, the UI, the block editor, the Python and C# clients don't change: they only see capabilities.

## 5. How a Python or C# program works

A user program is a **separate process** and a regular hub client. This way a hung or crashed program doesn't take the window down with it, and STOP can always kill it.

```mermaid
sequenceDiagram
    participant U as The Python / C# tab
    participant H as Hub (ProgramRunner)
    participant P as python.exe + gearbit<br/>or ScriptHost + Gearbit.Client
    participant A as Arbiter + Safety

    U->>H: program.run {language, code, sensors}
    H->>P: start: program file, GEARBIT_URL, GEARBIT_RUN_ID
    H-->>U: {runId}
    P->>H: hub.hello {name, runId}
    Note over H,A: the program gets control on behalf of the tab (source:"program")
    P->>H: drive.tank, light.set …
    H->>A: Authorize + power limit
    P-->>H: stdout, @@gearbit:{say|error}
    H-->>U: program.output, program.say
    U->>H: program.stop (or STOP, leaving the tab)
    H->>P: kill the process tree
    H->>A: motors to 0
    H-->>U: program.exited {reason, error, durationMs}
```

- `ProgramRunner` (`src/Gearbit.Hub/Programs`) keeps one program per client, knows who started it, and ends it on STOP, when the owner leaves, when the robot is lost and when the hub closes.
- A language is described by `IProgramLanguage`: how to find the runtime and how to run a file. There are `PythonLanguage` (`python.exe`) and `CSharpLanguage` (`csharp\Gearbit.ScriptHost.exe`).
- A C# program is a Roslyn Scripting script. ScriptHost compiles it whole before running, and `robot` and `Wait` come from the static class `Gearbit.Client.RobotScript`. The API is synchronous and mirrors Python (`robot.Forward(50); Wait(1);`): a child doesn't need `async` and `await`, and STOP interrupts `Wait` via a `CancellationToken`.
- Program errors are turned into clear text **inside** the process (`gearbit/_errors.py`, `CompileErrors.cs`/`RuntimeErrors.cs` in ScriptHost): the error type and the line are visible there. The hub just forwards them to the tab.
- Protocol details — [Hub API](dev/hub-api.md#programs-python-c).
