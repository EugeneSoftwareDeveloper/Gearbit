# Gearbit: developer guide

[Русский](../../dev/README.md) · **English**

## How it works

```
 Gearbit.exe (WPF + WebView2)          browser / Python / C# client
        │  embedded hub                         │
        ▼                                       ▼
 ┌──────────────── Gearbit.Hub (ASP.NET Core, localhost:5280) ────────────────┐
 │  /ws  JSON-RPC 2.0     /api/info     static wwwroot (web interface)        │
 │  RpcDispatcher → HubMethods → RobotManager ─┬─ ControlArbiter (who drives) │
 │                                             ├─ SafetyWatchdog (stop 600 ms)│
 │                                             └─ Notifier (telemetry 10 Hz)  │
 └─────────────────────────────────────────────┬──────────────────────────────┘
                                               ▼
                        IRobot = ProtocolRobot(DeviceDescriptor, BuildProfile)
                               │                         │
                        IRobotProtocol              ITransport
                     (TudaoProtocol: frames)  (WinRT BLE │ Loopback → emulator)
```

The main rule: **the hub is the only owner of the robot connection.** The remote, the block editor, Python and C# are just JSON-RPC clients. That is why safety (STOP, the dead man's switch, the power limit, the control arbiter) lives in one place and doesn't depend on the client.

## Projects

| Project | What's inside |
|---|---|
| `Gearbit.Core` | The model: components (`IMotor`, `IDistanceSensor`, `IImu`, `ILight`, `IBattery`), `IRobot`, `ProtocolRobot`, `DifferentialDrive`, descriptions (`DeviceDescriptor`, `BuildProfile`, `RobotCatalog`), the interfaces `IRobotProtocol`, `ITransport`, `IDeviceScanner`, `ITransportFactory`, `LoopbackTransport`. No Windows dependencies. |
| `Gearbit.Protocols.Tudao` | The SuperBot protocol: `FF FE … FD FC` frames, stream parsing, telemetry v1/v2. |
| `Gearbit.Transport.WinRtBle` | BLE via WinRT (`Windows.Devices.Bluetooth`): the scanner and the Nordic UART transport. |
| `Gearbit.Emulator` | A virtual TUDAO controller and a 2D world (room, obstacles, sensors). Connects through `LoopbackTransport` and speaks the same byte protocol. |
| `Gearbit.Hub` | The hub: JSON-RPC, methods, arbiter, watchdog, notifications, serving `wwwroot`. `GearbitHub.Build(args, addTransports)`. `Programs/` holds `ProgramRunner`: Python and C# programs in separate processes. |
| `Gearbit.Client` | The hub client for C#: a synchronous `Robot` (the same commands as in Python), `RobotScript` (`robot`, `Wait`) for scripts and console programs. |
| `Gearbit.ScriptHost` | The C# program runner: Roslyn Scripting, compile and runtime errors in Russian. Copied into the `csharp` folder next to the hub (`CopyToHost.targets`). |
| `Gearbit.Server` | A console hub without a window (for development and external clients). |
| `Gearbit.App` | Gearbit.exe: a WPF + WebView2 window, the hub runs in-process. |
| `tests/Gearbit.Tests` | xUnit: protocol, catalog, robot, emulator, the whole hub over WebSocket. |
| `web/studio-ui` | The web interface: TypeScript without a framework + Vite. The block editor is scratch-blocks with our own interpreter (`src/blocks`). The Python and C# tabs use CodeMirror 6 (`src/code`). |
| `python/` | The `gearbit` package for Python: a synchronous hub client on the standard library, clear errors in Russian and English, its own tests (`unittest`). See [python/README.en.md](../../../python/README.en.md). |

## Sections

- [Building, running, tests](building.md)
- [Hub API (JSON-RPC)](hub-api.md)
- [Adding a robot or a build](adding-a-robot.md)
- [Interface and themes](ui-and-themes.md)
- [Languages: Russian and English](i18n.md)
- [Block editor](blocks.md)
- Python and C# programs: [Hub API → Programs](hub-api.md#programs-python-c), [the gearbit package](../../../python/README.en.md), [C# for users](../user/csharp.md), [how it works](../ARCHITECTURE.md#5-how-a-python-or-c-program-works)
- [Architecture in detail](../ARCHITECTURE.md), [stage plan](../PLAN.md)
- [SuperBot protocol](../PROTOCOL-SUPERBOT.md), [measurement checklist (stage 0)](../STAGE0-CHECKLIST.md)
- For AI agents: [AGENTS.md](../../../AGENTS.md) (in Russian)

## Documentation in two languages

Russian is the main language: `docs/`, `README.md`, `python/README.md`. The English copy mirrors the same structure in `docs/en/`, and folder READMEs have a `README.en.md` next to them. Every file starts with a language switcher right after the heading. When you change a document, change its copy in the other language in the same commit. `AGENTS.md`, `CLAUDE.md`, `LICENSE` and `THIRD-PARTY-NOTICES.md` are not translated.

The interface is in two languages, so English docs write labels the way the English interface shows them: **Connect**.

## Principles

- **Safety over convenience.** Every new motion command goes through `ControlArbiter.Authorize` and the power limit. `robot.stop` always works.
- **Devices are described by data.** New robots and builds are added as JSON files in `devices/` and `profiles/`, without code changes, as long as the protocol is known.
- **Unverified values are marked.** Values from public sources carry `"verified": false`. The interface shows the `draft` status.
- **Everything is local.** The hub listens only on `localhost` and checks `Origin`. No telemetry.
- **User-facing texts are in Russian and English**, in simple words: a child reads them. How to add a text — [Languages](i18n.md).
- **License:** GPL-3.0-only ([LICENSE](../../../LICENSE)). A new library that ships with Gearbit must have a GPL-3.0-compatible license and goes into [THIRD-PARTY-NOTICES.md](../../../THIRD-PARTY-NOTICES.md).
