# Gearbit — implementation plan

[Русский](../PLAN.md) · **English**

> Working name: **Gearbit**. A Windows program in which a child at a PC (a big monitor, keyboard, mouse, gamepad) controls a construction robot and programs it in **Scratch**, **Python** and **C#**.
> The first robot is the **Apitor / Makerzoid SuperBot** (the TUDAO controller). The architecture is designed for other similar robots from the start.

Related documents:
- [ARCHITECTURE.md](ARCHITECTURE.md) — component diagrams, languages and technologies, a command's path to the robot;
- [PROTOCOL-SUPERBOT.md](PROTOCOL-SUPERBOT.md) — what is known about the protocol;
- [STAGE0-CHECKLIST.md](STAGE0-CHECKLIST.md) — measurements on the robot;
- [devices/tudao-superbot.json](../../devices/tudao-superbot.json), [profiles/superbot-car.json](../../profiles/superbot-car.json) — the robot and build descriptions (still with placeholders, `verified: false`).

> This is a planning document. Some ideas below were later done differently; the "Done differently" notes in the stages say how.

---

## 1. Goals and principles

| Goal | How we get there |
|---|---|
| Comfortable to work with a child at a PC | A full-screen window, large elements, Russian language, keyboard and gamepad, a big STOP button |
| Three levels of programming | A **Remote · Scratch · Python · C#** switcher, the same API in all languages |
| Different robots | A robot is described by a **set of capabilities** (motors, sensors, lights…), not by a specific class. The protocol and transport plug in as adapters |
| Safety | STOP from any screen, a watchdog, a speed limit, stopping on connection loss and when a program ends |
| Privacy | Everything is local, no cloud, accounts or telemetry. No third-party SDKs |
| Works without a robot | The simulator is a "robot" just like the real one |

**Non-goals of the first version:** mobile platforms, cloud storage, multi-user work over the internet.

---

## 2. Architecture

### 2.1. The main idea: one "hub" owns the robot, there are many clients

Only **the hub** (a local .NET service) connects to the robot over BLE. Everything else (the remote, Scratch, Python and C# programs) works with the hub through **one API** (JSON-RPC over WebSocket on `localhost`).

This is how Scratch Link for LEGO and micro:bit works, as do many industrial systems. What it gives:
- one place where safety (STOP, watchdog, limits) and logging live;
- clients know nothing about BLE or bytes, only "motor", "sensor", "light";
- a new programming language is added as another thin client;
- user programs can run **in a separate process**, which can simply be killed if needed.

```
┌──────────────────────────── Gearbit (WPF + WebView2 window) ───────────────────────────┐
│  [Remote]  [Scratch]   [Python]   [C#]          Robot ▾   Build ▾   🔋   ● Connected  [STOP] │
│                                                                                           │
│   UI (HTML/TS): remote, Monaco editor, embedded Scratch (TurboWarp), telemetry, console    │
└───────────────┬───────────────────────────────────────────────────────────────────────────┘
                │ JSON-RPC / WebSocket  ws://localhost:PORT
┌───────────────▼───────────────────── Gearbit.Hub (ASP.NET Core) ────────────────────────┐
│ RobotManager ─ ControlArbiter ─ SafetySupervisor (STOP, watchdog, limits) ─ Telemetry bus │
│ ProgramRunner: runs Python/C# in separate processes, STOP = kill + motors off            │
└───────────────┬───────────────────────────────────────────────────────────────────────────┘
                │ IRobot (capabilities)
┌───────────────▼──────────── Drivers (adapters) ─────────────────────────────────────────────┐
│ RobotDriver = DeviceDescriptor + IProtocol + ITransport                                    │
│   Protocols: TudaoUart (FF FE…FD FC) │ ApitorF0FF (55 AA…) │ Simulator │ later: micro:bit…  │
│   Transports: WinRT BLE │ Loopback (simulator/tests) │ later: Serial/USB, TCP (ESP32)      │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
       ▲                         ▲                              ▲
 Python script             C# script / NuGet               Scratch extension
 (`gearbit` package)    (`Gearbit.Client`)          (JS, the same WebSocket)
```

### 2.2. The robot model: capabilities, not classes

Robots differ in the number of motors and sensors, firmware and connection method. That's why there are **no** classes like `SuperBot : Robot`. A robot is a container of components (composition over inheritance, similar to components in ROS and hub/ports in LEGO SPIKE).

```csharp
public interface IRobot : IAsyncDisposable
{
    RobotInfo Info { get; }                       // model, firmware, battery, transport
    IReadOnlyList<IRobotComponent> Components { get; }
    T Get<T>(string id) where T : IRobotComponent; // robot.Get<IDistanceSensor>("front")
    IEnumerable<T> All<T>() where T : IRobotComponent;
    ConnectionState State { get; }
    IObservable<TelemetryFrame> Telemetry { get; }
    Task StopAllAsync(CancellationToken ct = default);
}

// Capabilities (each one is a small interface)
public interface IMotor          : IRobotComponent { Task SetPowerAsync(int percent); }   // -100..100
public interface IDistanceSensor : IRobotComponent { DistanceReading Current { get; } }   // raw + level + cm (if calibrated)
public interface IImu            : IRobotComponent { Tilt Current { get; } }              // tilt X/Y, acceleration
public interface ILight          : IRobotComponent { Task SetColorAsync(RobotColor c); }
public interface ILineSensor     : IRobotComponent { bool OnLine { get; } }   // SuperBot does it more simply: the same IDistanceSensor eye down + LineLevel
public interface IBattery        : IRobotComponent { int? Percent { get; } bool Low { get; } }
// later: IServo, ISpeaker, IColorSensor, IButton, ICompass ...
```

Above the physical components there is a **build** (build profile): what is assembled from what. There is one controller, but you can build a car, a crane or a dinosaur from it.

```jsonc
// profiles/superbot-car.json — "Car"
{
  "id": "superbot-car",
  "title": "Машинка",
  "robot": "tudao-superbot",
  "drive": { "type": "differential", "left": "M1", "right": "M2", "invertRight": true },
  "aliases": { "front": "D1", "right": "D2" },         // where the sensors look in this build
  "limits": { "maxPower": 60 },                         // kid mode
  "calibration": { "D1": { "levels": [0, 3, 6, 10, 15, 20, 30] } } // level → cm (filled by the calibration wizard)
}
```

From here come the "high-level" capabilities: `IDifferentialDrive.Drive(left, right)`, `Turn(...)`. It's a **decorator** over two `IMotor`s that accounts for inversion and limits.

### 2.3. Adapters: descriptor + protocol + transport

| Abstraction | Responsible for | v1 implementations | Later |
|---|---|---|---|
| `ITransport` | Send and receive bytes, connection state | `WinRtBleTransport` (Nordic UART / any GATT), `LoopbackTransport` | `SerialTransport`, `TcpTransport` (ESP32 Wi-Fi), `WebBluetoothTransport` (Blazor WASM) |
| `IRobotProtocol` | Encode commands and parse notifications. **Pure functions, no I/O** | `TudaoUartProtocol` | `ApitorF0FFProtocol` (Robot J and others), `MicroBitProtocol` |
| `DeviceDescriptor` (JSON) | How to find the device (name prefixes, service UUIDs), what components it has, what firmware version to expect | `tudao-superbot.json` | One file per model |
| `IRobotDriverFactory` | `Probe(advertisement) → match / confidence`, then `CreateAsync()` | `TudaoDriverFactory`, `SimulatorDriverFactory` | Plugins from separate assemblies |

Patterns: **Adapter** (protocol and transport), **Strategy** (the protocol is chosen by the descriptor), **Factory + Registry** (finding drivers via DI, `services.AddRobotDriver<TFactory>()`), **Decorator** (limits, inversion, traffic logging), **Observer** (telemetry via `IObservable`/`IAsyncEnumerable`), **State machine** (the connection).

A descriptor example:

```jsonc
// devices/tudao-superbot.json
{
  "id": "tudao-superbot",
  "title": "Apitor / Makerzoid SuperBot",
  "match": { "namePrefixes": ["Nordic_TUDAO", "Apitor"], "services": ["6e400001-b5a3-f393-e0a9-e50e24dcca9e"] },
  "transport": { "type": "ble-gatt", "write": "6e400002-…", "notify": "6e400003-…", "mtu": 20 },
  "protocol": "tudao-uart",
  "components": [
    { "id": "M1", "type": "motor" }, { "id": "M2", "type": "motor" }, { "id": "M3", "type": "motor" },
    { "id": "D1", "type": "distance", "range": [0, 6] }, { "id": "D2", "type": "distance", "range": [0, 6] },
    { "id": "IMU", "type": "imu", "firmware": ">=v2" },
    { "id": "L1", "type": "light" }, { "id": "L2", "type": "light" }, { "id": "L3", "type": "light" }, { "id": "L4", "type": "light" },
    { "id": "BAT", "type": "battery" }
  ]
}
```

Components that depend on the firmware (for example, the gyroscope only exists in 19-byte frames) are enabled by the driver **after** the first telemetry frame. The UI and Scratch show only the blocks and indicators that are really available.

**A composite robot** (for the future, but the model already allows it): a logical robot = SuperBot (motors) + micro:bit or ESP32 (compass, laser rangefinder). It's one build whose components come from two devices.

### 2.4. SuperBot specifics the driver handles

- The protocol is **state-based**: the full 14-byte frame (all motors and lights) is sent every time. So the driver keeps the **desired state**, and `SetPower` calls only change it. A separate loop sends the frame **on change, but no more often than N Hz**: the last write wins, BLE isn't clogged with a queue.
- Speed in the API is always a percentage −100..100. The protocol translates it into device bytes. The range is checked in stage 0.
- Sensors arrive by themselves, in notifications. The driver tells 11- and 19-byte frames apart (old and new firmware).

### 2.5. The hub: API (JSON-RPC 2.0 over WebSocket)

```
robots.scan()                         → [{id, name, model, rssi}]
robots.connect({id}) / disconnect()
robot.info()                          → model, firmware, components, build
control.acquire({client, priority})   → lease (who is "driving" now)
motor.set({id, power})                ; drive.set({left, right}) ; drive.stop()
light.set({id, color})
sensor.read({id})                     → value (usually not needed: there is a subscription)
emergency.stop()                      → always works, no lease needed
program.run({lang, source}) / program.stop()
── server notifications ──
telemetry   {t, distance:{front, right}, imu:{x, y, acc}, battery, motors:{…}}   ~20 Hz
connection  {state, reason}
program     {state, stdout, stderr, error:{line, message}}
log         {dir:"tx"|"rx", hex}      (developer mode)
```

The implemented API differs in names and details; see [Hub API](dev/hub-api.md).

**ControlArbiter.** At any moment one client controls the motors: the remote **or** a program. When a program starts, the remote switches to "watch only", except for the STOP button. The emergency stop always works, out of turn.

**SafetySupervisor:**
- **Watchdog (deadman)**: the client with the lease sends a heartbeat. No contact for more than 500 ms — motors stop.
- BLE loss, a program ending or crashing, the window closing — motors stop.
- A power limit from the build (kid mode) and smooth acceleration, no jerks from 0 to 100.
- Low battery — a warning in the UI.
- STOP hotkeys: **Space / Esc** on any screen, the "B" button on the gamepad.

### 2.6. Running programs

| Language | Where it's edited | How it runs | STOP |
|---|---|---|---|
| Blocks (Scratch) | The Blocks tab: scratch-blocks (the editor) | Our own interpreter in the interface, a hub client with `source:"program"` | «Стоп» on the toolbar + the common STOP; leaving the tab — stop |
| Python | Monaco in Gearbit **or** any external editor (VS Code, IDLE) | A separate process: an embedded portable Python + the `gearbit` package | Kill the process + motors off |
| C# | CodeMirror in Gearbit **or** Visual Studio / Polyglot Notebooks | A separate `Gearbit.ScriptHost` process (Roslyn Scripting), a global `robot` variable | Kill the process + motors off |

User code runs in a separate process because an endless `while(true){}` loop in .NET can't be interrupted inside the process. Killing a process always works.

### 2.7. One API for the child in all languages

The same concepts and names, different syntax. Below is the same "Explorer" program.

**Scratch** (blocks in Russian; translation on the right):
```
когда нажат флаг                          when flag clicked
повторять всегда                          forever
  если <(расстояние [впереди]) < (2)> то    if <(distance [front]) < (2)> then
    ехать [влево] мощность (40)               drive [left] power (40)
    ждать (0.4) секунд                        wait (0.4) seconds
  иначе                                     else
    если <(расстояние [справа]) < (2)> то     if <(distance [right]) < (2)> then
      ехать левым (30) правым (50)              drive left (30) right (50)
    иначе                                     else
      ехать [вперёд] мощность (50)              drive [forward] power (50)
```

**Python:**
```python
from gearbit import robot, wait

while True:
    if robot.distance("front") < 2:
        robot.turn_left(40)
        wait(0.4)
    elif robot.distance("right") < 2:
        robot.drive(30, 50)
    else:
        robot.forward(50)
```

**C#:**
```csharp
while (true)
{
    if (robot.Distance("front") < 2)
    {
        robot.TurnLeft(40);
        Wait(0.4);
    }
    else if (robot.Distance("right") < 2)
        robot.Drive(30, 50);
    else
        robot.Forward(50);
}
```

The v1 API: `forward/backward/turn_left/turn_right/drive(l, r)/stop`, `motor(id).power(p)`, `distance(id)`, `tilt()`, `battery()`, `light(id).color(c)`, `wait(s)`, the events `on_distance(id, below=…)`, `on_tilt(dir)`.
For grown-ups: `robot.raw.send(bytes)` and a subscription to raw frames (developer mode).

---

## 3. Interface

One window with a mode switcher at the top. Layout: see the picture in the discussion and §3.1.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Gearbit   [🎮 Remote][🧩 Scratch][🐍 Python][C#]   SuperBot ▾ Car ▾ 🔋78% ●  [ STOP ] │
├──────────────────────────────────────────────────────┬────────────────────────┤
│                                                      │ Sensors                │
│        The mode's workspace                          │ front   ███░░ 3        │
│  (remote / Scratch / code editor)                    │ right   █░░░░ 1        │
│                                                      │ tilt    X 2°  Y -1°    │
│                                                      │ Motors  M1 +50 M2 +50  │
│                                                      │ Lights  ● ● ● ●        │
│                                                      ├────────────────────────┤
│ [▶ Run] [■ Stop]   Speed ▬▬▬●▬ 60%  ☐ Simulator       │ Console / log          │
└──────────────────────────────────────────────────────┴────────────────────────┘
```

### 3.1. Modes

- **Remote**: WASD or arrows, a gamepad (Gamepad API), separate ▲/▼ buttons for each motor, a speed slider, a headlight color picker, big sensor indicators. A "Smart brake" checkbox: an example of a program working together with manual control.
- **Scratch**: an embedded editor with a "Robot" category. The same sensor panel on the right.
- **Python / C#**: a code editor (CodeMirror) with highlighting, robot API completion (from stub files), error line highlighting and a console. ▶ and ■ buttons.
- **"View as code"** (stage 6): Python or C# is generated from a Scratch project, read-only at first. A bridge from blocks to text, as in MakeCode and LEGO SPIKE.

### 3.2. Cross-cutting elements

- A big **STOP button** top right, always visible, Space/Esc.
- Connection and battery indicators. On a disconnect — a clear message and auto-reconnect.
- **A "Simulator" switch**: the same interface, a virtual robot.
- **Kid / grown-up mode**: the grown-up mode shows the byte log, raw frames, build and calibration settings.
- **A sensor calibration wizard**: "put a box at 5 cm → click" → a level → cm table in the build.
- **Tasks** (stage 6): cards "Smart brake", "Explorer", "Maze", "Robot dog" with hints and templates in three languages.
- Projects are stored as regular files in `Documents\Gearbit\` (`.sb3`, `.py`, `.cs`) with autosave.

---

## 4. Technologies

| Layer | Choice | Why |
|---|---|---|
| Platform | **.NET 10 (LTS)**, `net10.0-windows10.0.19041.0` for BLE | The main language is C#, LTS |
| BLE | WinRT `Windows.Devices.Bluetooth` (GattSession, MaintainConnection) | Native in Windows 10/11, no drivers. No need to pair the robot |
| Hub | ASP.NET Core (Kestrel, `localhost` only), StreamJsonRpc or our own thin JSON-RPC | One process, WebSocket out of the box |
| Shell | WPF + **WebView2** | A full-screen window. The UI can also be opened in a regular browser |
| UI | TypeScript + Vite without a framework, CodeMirror 6 | A light frontend. Monaco was planned first; CodeMirror was chosen: smaller and easier to theme |
| Blocks | **scratch-blocks** (Apache-2.0, Blockly 12) + our own interpreter | No Scratch VM, a theme shared with the interface. TurboWarp scratch-gui was planned first, see [docs/dev/blocks.md](dev/blocks.md) |
| C# scripts | Roslyn Scripting (`Microsoft.CodeAnalysis.CSharp.Scripting`) in the `ScriptHost` process, in the `csharp` folder next to the hub | Compiled on the fly, clear errors with line numbers, nothing to install |
| Python | Python 3.9+ from the computer (later — an embedded portable one) + the `gearbit` package on the standard library | The package works from external IDEs too |
| Tests | xUnit + "golden" frames from real captures, Playwright for the UI | The protocol is pure functions, easy to test |
| Installation | A single folder or MSIX, auto-update later | — |

---

## 5. Repository layout

```
/docs                       PLAN.md, PROTOCOL-SUPERBOT.md, capture notes
/src
  Gearbit.Core            abstractions: IRobot, components, telemetry, builds, safety (no I/O)
  Gearbit.Protocols.Tudao the FF FE…FD FC codec + tests on golden frames
  Gearbit.Protocols.Apitor  (stage 6) the 55 AA… codec — an extensibility check
  Gearbit.Transport.WinRtBle
  Gearbit.Simulator       a virtual robot: 2D physics, rays for distance sensors
  Gearbit.Hub             ASP.NET Core: RobotManager, Arbiter, Safety, JSON-RPC, ProgramRunner
  Gearbit.ScriptHost      the C# script runner (Roslyn)
  Gearbit.Client          NuGet for your own C# programs (Polyglot Notebooks, console)
  Gearbit.App             the WPF + WebView2 shell
/web
  studio-ui                 remote, block editor, code editors, telemetry (TS)
/python
  gearbit                 the Python client (pip install -e)
/devices                    device descriptors (*.json)
/profiles                   builds (*.json)
/tools
  ble-sniffer               a console tool: scan, connect, raw frame log, sending hex by hand
/tests
```

---

## 6. Stages

Every stage ends with a working result you can show the child.

### Stage 0. Checking the robot and the protocol (0.5–1 day)
> Runs **in parallel** with stage 1: stage 1 starts on the placeholders from `devices/tudao-superbot.json` (`status: draft`). Measurements follow [STAGE0-CHECKLIST.md](STAGE0-CHECKLIST.md) (a phone + nRF Connect), then the placeholders are replaced with real values without code changes. The safe speed placeholder is a ±10 limit.

- [ ] Check BLE on the PC. If there is no adapter, buy a USB BT 5.0 one.
- [ ] Run **ApitorCommander** (Python + bleak) and drive around.
- [ ] A C# `tools/ble-sniffer` tool: scan, connect, authorize, log all notifications, send hex.
- [ ] Find out: the device name, the telemetry frame length (11 or 19 bytes, that is, the firmware), the **speed range** (±10? ±100?), which ports the motors use (2 or 4 motors), the sensor response at 5/10/20 cm, whether the state frame has to be repeated periodically.
- [x] The measurement helper in Gearbit itself (protocol log → «Замеры»): manual frames without the power limit (`service.*`), a power test, sensor calibration, session recording. Replaces `tools/ble-sniffer` and the phone for most checklist items.
- [x] The motor direction of the «Машинка» (Car) is checked on a real robot: M1 is inverted.
- [ ] Record **golden frames** in `docs/captures/` and update PROTOCOL-SUPERBOT.md.
- **Result:** a confirmed protocol and test data.

### Stage 1. Core, hub and remote — MVP (≈1–2 weeks of evenings)
- [ ] `Core`: components, telemetry, builds, limits.
- [ ] `Protocols.Tudao` + tests on golden frames.
- [ ] `Transport.WinRtBle`: scan, connect, auto-reconnect, sending in 20-byte chunks.
- [ ] The SuperBot driver: a desired-state send loop, parsing 11- and 19-byte frames.
- [ ] `Hub`: JSON-RPC, telemetry, Arbiter, Safety (STOP, watchdog, stopping on disconnect).
- [ ] `App` + the Remote UI: keyboard, gamepad, speed slider, lights, sensor and battery indicators, log.
- [ ] A "Smart brake" checkbox (the first automation example).
- **Result:** the child drives with a keyboard or gamepad on a big screen and sees the sensors.

### Stage 2. Scratch (≈1 week)
Done differently than planned: instead of TurboWarp — the Blocks tab on scratch-blocks with our own interpreter ([why](dev/blocks.md#why-not-turbowarp)).
- [x] Robot blocks in Russian: motors, driving, lights, "say", distance, obstacle, tilt, battery, timer; the "when distance < N" event.
- [x] The "when tilted" event and the "tilted?" block (a 15° threshold, as in Makerzoid), `tilted()` / `Tilted()`, the «Наклонить» (Tilt) buttons in the emulator. Axis signs are not checked on the robot.
- [x] The editor is built into Gearbit and loads the first time the tab opens.
- [ ] Blocks are shown according to the connected robot's capabilities. For now the menus are static, and a sensor missing from the build gives a clear error at run time.
- [x] Examples: «Первые шаги» (First steps), «Квадрат» (Square), «Светофор» (Traffic light), «Умный тормоз» (Smart brake), «Исследователь» (Explorer), «Осторожный водитель» (Careful driver), «Считаем препятствия» (Counting obstacles), «По линии» (Along the line), «По краю линии» (Along the line edge), «Наклони меня» (Tilt me).
- [x] Line following: a sensor can be set "down" (at the floor), the "sensor … sees the black line?" block, `on_line` / `OnLine` in Python and C#, the threshold in «Замеры» ([docs/en/user/line-following.md](user/line-following.md)).
- [x] Variables with a value monitor, saving to a `*.gearbit.json` file and autosave.
- **Result:** programming with blocks on a big screen, the robot runs the program live.

### Stage 3. Python (≈1 week)
Done differently than planned: instead of Monaco — CodeMirror 6 (smaller, no web workers, easily themed with tokens), and Python is not embedded but found on the computer.
- [x] The `gearbit` package: a synchronous and simple API for children (`robot.forward(50)`), inside — a WebSocket to the hub on the standard library, errors in Russian.
- [x] `ProgramRunner` in the hub: a separate process, output to the tab, STOP = kill the process tree + motors to 0. Python from python.org, via `py` or from `python\runtime`.
- [ ] An embedded portable Python in the Gearbit installation.
- [x] The editor: highlighting, completions for robot commands, sensor places and colors, the error line, the «Команды» (Commands) card, examples.
- [x] Working from VS Code (`pip install -e python/`).
- **Result:** the same tasks as text in Python.

### Stage 4. C# (≈1 week)
Done differently than planned: the API is synchronous, like in Python (`robot.Forward(50); Wait(1);`), without `async`/`await` — so the same tasks are solved in both languages, and the child doesn't need to understand tasks. The editor is the same CodeMirror 6 as for Python.
- [x] `Gearbit.Client`: `Robot` (synchronous, `IDisposable`), `RobotScript` (`robot`, `Wait`) for scripts and console programs, errors in Russian.
- [ ] Publishing `Gearbit.Client` on nuget.org (for now — a project reference).
- [x] `ScriptHost`: Roslyn Scripting (C# 14), ready `robot` and `Wait`, compile and runtime errors in Russian with the line and Roslyn's original text.
- [x] The C# tab: highlighting, completions for robot commands, sensor places and colors, the error line, the «Команды» card, examples.
- [ ] Examples for Polyglot Notebooks in VS Code ("cell → the robot drives").
- **Result:** C# inside the program and in "real" tools.

### Stage 5. Simulator (≈1–2 weeks)
- [ ] A 2D room (canvas), walls and boxes drawn with the mouse, a virtual car with a differential drive.
- [ ] Virtual distance sensors (rays), the same scale as the real ones (0–6), optional noise.
- [ ] Turned on with a switch. All programs work unchanged.
- **Result:** you can program without a robot and debug the logic on screen.

### Stage 6. Extensions (optional, in any order)
- [ ] **Scratch → Python/C#**: viewing code generated from `.sb3`.
- [ ] **A second protocol** `ApitorF0FF` (Robot J and others): checking that the architecture really extends without core changes.
- [ ] **A composite robot**: SuperBot + micro:bit or ESP32 (a compass for precise turns, a laser rangefinder, a color sensor).
- [ ] **Robot taxi**: a webcam above + an ArUco marker, click a point on the map with the mouse.
- [ ] Voice commands (Web Speech API, Russian), webcam gestures.
- [ ] An experiment: uploading a Lua script to the controller (`FF FE 09 02 …`) for autonomous work.
- [ ] Task cards with checks ("got through the maze in 40 s"), records.

---

## 7. Best practices we build in from the start

1. **Hardware Abstraction Layer + capabilities.** Program code doesn't know the robot model. (ROS, LEGO SPIKE, Open Roberta)
2. **One connection owner, many clients.** (Scratch Link)
3. **Safety in the hub, not in clients:** STOP, watchdog, limits, stopping on any failure.
4. **The protocol is pure functions**, tested with golden frames from real captures. The transport is separate.
5. **State instead of a command stream:** a desired state + a rate-limited send loop.
6. **Device descriptors and builds in JSON**: a new robot or a new build often needs no code.
7. **Detecting the firmware from data** (frame length) and enabling components based on facts.
8. **User code in a separate process**, STOP always works.
9. **The simulator as a full driver**: learning without hardware, automated tests without hardware.
10. **Developer mode**: a hex log, sending frames by hand, recording and replaying telemetry. It helps with studying new robots.
11. **The same API in all languages** and a growth path: Scratch → "view as code" → Python/C#.
12. **Kid UX**: large, in Russian, clear errors ("The robot is not connected — turn it on and click Find"), autosave.
13. **Privacy**: everything offline, no accounts, analytics or third-party SDKs.

---

## 8. Ideas from similar applications

What LEGO SPIKE / EV3 Classroom, Microsoft MakeCode, Open Roberta Lab, VEXcode (VR), mBlock, Sphero Edu, Thymio VPL, Pybricks, Thonny and Mu have. The list is based on these products' known features, without a fresh check against their current versions.

| # | Idea | Seen in | Why we want it | Stage |
|---|---|---|---|---|
| 1 | **Highlighting the running block or line** | VEXcode, MakeCode, Open Roberta | The child sees where the program is and why the robot behaves this way | 2–4 |
| 2 | **Step-by-step and slowed-down execution** | VEXcode (Step), MakeCode (slow-mo), Thonny | "Step" debugging: the robot does one action per click | 3–4 |
| 3 | **Sensor graphs and data logging (CSV)** | LEGO SPIKE/EV3 data logging, micro:bit, Sphero Edu | "Plot the distance while driving to the wall" — small experiments | 1 (graph), 6 (logging) |
| 4 | **Visual robot configuration**: a picture of the controller, a motor or sensor on a port with the mouse | Open Roberta (robot configuration), SPIKE (port view) | A build editor without editing JSON | 2 |
| 5 | **A variable monitor and `print` to a panel** | VEXcode Monitor, Thonny (variables) | Sensor and program variable values are visible side by side | 3–4 |
| 6 | **Clear errors in Russian** | Thonny (friendly tracebacks), MakeCode | "Line 5 has no colon after if" instead of a traceback | 3–4 |
| 7 | **Mode switches like in Mu** | Mu editor (modes) | Confirms our choice: Remote · Scratch · Python · C# | 1 |
| 8 | **Auto-connect to the last robot, "find me" (blinking), renaming** | SPIKE, Pybricks, Sphero | A quick start; telling robots apart if there are several | 1 |
| 9 | **A battery warning before starting** | SPIKE, Sphero | The robot won't die in the middle of a task | 1 |
| 10 | **A digital twin on the Scratch stage**: a sprite repeats the robot's moves, the robot reacts to sprites | mBlock | "Robot + screen" games: the robot hit a wall — an explosion on screen | 2, 5 |
| 11 | **Live mode and uploading to the robot** | mBlock (Live/Upload), Pybricks | Our Lua experiment: the program lives in the robot without a PC | 6 |
| 12 | **Virtual arenas with tasks** (maze, sumo, line) | VEXcode VR, Open Roberta (simulator scenes) | The simulator becomes a game with levels | 5 |
| 13 | **Built-in step-by-step lessons** with hints | MakeCode tutorials, SPIKE units | "Tasks" with hints and result checks | 6 |
| 14 | **Icon blocks for younger kids** (no text) | SPIKE Icon Blocks, ScratchJr | You can start at 5–6 | 6 |
| 15 | **"When → then" rules** (events and reactions in pairs) | Thymio VPL | The simplest model of programming behavior | 6 |
| 16 | **Teaching by demonstration**: drive with the remote → record → a ready program | Teach mode of robot arms | A bridge from "I drive" to "the robot drives". The recording can be opened as Scratch or Python | 3 |
| 17 | **Drawing a route with the mouse** → the robot drives it | Sphero Edu (Draw), Ozobot | Visual, fun, no code | 6 |
| 18 | **Sound and speech through the PC** ("the robot talks") | mBlock, Scratch Text to Speech | A simple extension children love | 2 |
| 19 | **Several robots at once** | Sphero Edu, Pybricks (multi-hub) | Races, sumo, a "train". The architecture already allows it | 6 |
| 20 | **Parent mode**: speed limit, session timer, settings lock | Parental controls in kids' apps | Peace of mind for the grown-up | 1 (limits), 6 |
| 21 | **Project version history** and rollback | MakeCode | "Put it back the way it was before I broke it" | 6 |
| 22 | **Achievements and badges** for tasks | Code.org, Sphero Edu | Motivation | 6 |
| 23 | **Opening the remote from a tablet on the home network** (off by default) | Pybricks Code, web IDEs | A second remote for the child while the grown-up is at the PC | 6 |

What we **don't** take: mandatory accounts and the cloud, analytics, updating the firmware from our program (the risk of bricking the robot).

---

## 9. Risks and open questions

| Question | How we close it |
|---|---|
| The speed range and the reaction to the frame rate are not confirmed | Stage 0, captures |
| 2 or 4 motors, which ports | Stage 0. The build describes the mapping, the code doesn't change |
| Different firmware (11/19 bytes), possibly a different authorization key | Detection from data, the key in the descriptor |
| WinRT BLE quirks (GATT cache, reconnecting) | `BluetoothCacheMode.Uncached`, `GattSession.MaintainConnection`, clear errors |
| BLE latency when reacting to sensors | Moderate speeds in autonomous modes, a 20–30 Hz send rate. Measure in stage 0 |
| Licenses: scratch-gui (BSD-3), TurboWarp (GPL-3.0), BlocosLab (AGPL-3.0) | Gearbit is GPL-3.0-only; scratch-blocks (Apache-2.0) and the other dependencies are compatible with it ([THIRD-PARTY-NOTICES.md](../../THIRD-PARTY-NOTICES.md)). Only protocol facts are taken from BlocosLab, not code |
| The protocol is unofficial, the firmware may update | Don't update the firmware from the official app without need. Descriptors are versioned |

---

## 10. Next steps

1. The solution skeleton (`/src`, `/web`, `/python`), loading `devices/*.json` and `profiles/*.json`, protocol tests on frames from public sources.
2. Stage 1 on placeholders: the core, a placeholder simulator (Loopback), the hub, the remote. Works without a robot.
3. In the evening: measurements per [STAGE0-CHECKLIST.md](STAGE0-CHECKLIST.md) → update the JSON (`verified: true`) → the first ride from the PC.
