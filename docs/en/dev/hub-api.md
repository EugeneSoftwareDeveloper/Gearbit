# Hub API (JSON-RPC 2.0)

[Русский](../../dev/hub-api.md) · **English**

The hub listens on `ws://localhost:5280/ws`. Messages are JSON-RPC 2.0, one JSON object per WebSocket text frame. Field names are camelCase, enums are camelCase strings (`"connected"`, `"remote"`).

`hub.methods` returns the live list of methods with descriptions (the descriptions are in Russian).

## Connecting

1. Open a WebSocket. Browser clients go through an `Origin` check: `localhost:<hub port>`, `localhost:5173` and the addresses from `Hub:AllowedOrigins` are allowed. Clients without an `Origin` header (Python, C#) are let through.
2. Call `hub.hello` first:

```json
→ {"jsonrpc":"2.0","id":1,"method":"hub.hello","params":{"name":"Python: explorer","lang":"en"}}
← {"jsonrpc":"2.0","id":1,"result":{"hub":"Gearbit","version":"0.1.0","clientId":"c3","transports":["emulator","ble"],"robot":null,"control":{"clientId":null,"clientName":null,"kind":null,"mine":false}}}
```

`name` is shown to other clients in the «Сейчас управляет…» (Now in control…) bar.

`lang` is the message language for this client: `ru` or `en` (`en-US` works too). The error `message`, `safety.event`, the scan `warnings` and `problem` in `program.languages` come in it. Without `lang`, or with an unknown language, they are in Russian, as in earlier versions. Each client gets the same event in its own language. Descriptions in `hub.methods` and the hub log are always in Russian.

## Methods

### Hub and catalog

| Method | Parameters | Result |
|---|---|---|
| `hub.hello` | `{name, lang?, runId?}` | `{hub, version, clientId, transports, robot, control}`. `lang` — the message language (`ru`, `en`). `runId` is passed by a program the hub started (`GEARBIT_RUN_ID`): this is how the hub recognizes its connection. |
| `hub.methods` | — | a list of `{name, summary}` |
| `catalog.get` | — | `{devices: [{id, title, status, protocol, components}], profiles: [{id, title, device, status, maxPowerPercent, aliases}]}` |

### Robot

| Method | Parameters | Result and behavior |
|---|---|---|
| `robot.scan` | `{durationMs?}` (default `Hub:ScanDurationMs` = 4000) | `{devices: [{id, name, rssi, transport, deviceId, deviceTitle, known}], warnings}`. Scanners run in parallel. |
| `robot.connect` | `{id, deviceId?, profileId?}` | `RobotDto`. `deviceId` — the model for an unknown device, `profileId` — the build (by default the first one for the model). Resets the arbiter, motors to 0. |
| `robot.disconnect` | — | Stops the motors and disconnects. |
| `robot.info` | — | `RobotDto` or `null`. |
| `robot.telemetry` | — | `TelemetryDto` (see below). |
| `robot.stop` | — | **Allowed to everyone, always.** Motors to 0, broadcasts `safety.event {reason:"stop"}`. Works in measurement mode too (and disarms the measurement watchdog until the next frame). |
| `robot.setMaxPower` | `{percent}` | The common power limit 0–100. Broadcasts `robot.info`. |

`RobotDto`: `{id, name, state, deviceId, deviceTitle, deviceStatus, profileId, profileTitle, uid, firmware, maxPowerPercent, profileMaxPowerPercent, hasDrive, serviceMode, components: [{id, kind, title, available, aliases, lineLevel}]}`. `lineLevel` exists only for distance sensors: the level from which a sensor looking at the floor sees the black line (from the profile's `calibration.distance.<id>.lineLevel`, otherwise `(maxLevel + 1) / 2`, that is 3). `state`: `disconnected | connecting | connected | lost`. `serviceMode` — protocol measurements are in progress (see below): normal control is off.

`TelemetryDto`: `{distances: {D1: 0..6|null}, distancesCm: {D1: number|null}, tilt: {x, y, acceleration}|null, battery, batteryLow, firmware, motors: {M1: -100..100}, lights: {L1: "red"}, available: {M1: true}}`.

### Motion

All motion commands go through the arbiter (see below) and the power limit. Values are percentages −100..100, the limit is applied in the hub.

| Method | Parameters |
|---|---|
| `motor.setPower` | `{id, power, source?}`: `id` is a port (`M1`) or a build alias (`left_wheel`) |
| `drive.tank` | `{left, right, source?}` |
| `drive.arcade` | `{throttle, turn, source?}`: a positive `turn` is to the right |
| `drive.stop` | `{source?}` |
| `light.setColor` | `{id, color}`: `off, red, orange, yellow, green, cyan, blue, purple, white`. `id` is `L1`…`L4` or an alias. |

`source`: `"remote"` (default: the remote) or `"program"` (a child's program). It determines the owner kind in the arbiter and how the watchdog works.

The block editor sends all commands with `source: "program"`. When the program ends or is stopped, it turns its motors off itself (`drive.stop`, `motor.setPower 0`) and calls `control.release`. More in [Block editor](blocks.md).

### Control

| Method | Parameters | Behavior |
|---|---|---|
| `control.get` | — | `{clientId, clientName, kind, mine}` |
| `control.take` | `{source?}` | Take control, even if it's taken. |
| `control.release` | — | Give it back if you are the owner. |

The arbiter: one client controls the motors. The first motion command takes free control. If another client holds control, the command is rejected with `ControlBusy` (−32002). The owner is released when the client disconnects; the motors stop then (`safety.event {reason:"clientLeft"}`).

The owner `kind`: `remote` (the remote), `program` (a program) or `service` (protocol measurements).

### Programs (Python, C#)

The hub starts the program in a separate process itself, and the process connects to the hub as a regular client (`hub.hello {name, runId}`) and drives with `source:"program"` commands. One program runs at a time.

| Method | Parameters | Behavior |
|---|---|---|
| `program.languages` | — | `[{id, title, available, version, problem}]`. `problem` — what to do if there is nothing to run with (in the client's language, for display). Python is searched for on every call until found; once found, it is remembered. |
| `program.run` | `{language, code, name?, sensors?}` | Run. `language`: `python` or `csharp`. `sensors` — where the sensors are: `{D1: "front", D2: "none"}`. The previous program is stopped (`reason: "replaced"`). Returns `{runId}`. No language — `NotSupported` with a hint. Code longer than 256 KB — `InvalidParams`. |
| `program.stop` | — | End the program process. If it was in control, motors to 0. `false` — nothing was running. |
| `program.status` | — | `{runId, language, name, startedAt}` or `null`. |

The process gets environment variables:

| Variable | Value |
|---|---|
| `GEARBIT_URL` | `ws://localhost:<port>/ws` |
| `GEARBIT_NAME` | `Python: <name>` or `C#: <name>` — the name in the «Сейчас управляет…» bar |
| `GEARBIT_RUN_ID` | `runId` for `hub.hello` |
| `GEARBIT_LANG` | the language of the tab that started the program (`ru`, `en`): the program writes its errors in it and passes it in `hub.hello {lang}` |
| `GEARBIT_SENSOR_PLACES` | JSON `sensors` from `program.run` |

Output lines starting with `@@gearbit:` are service lines: the hub doesn't show them but parses the JSON. `{"type":"say","text"}` is a bubble above the robot (`program.say`), `{"type":"error","line","column","message"}` is an error for line highlighting (it goes into `program.exited.error`).

The program stops and the process ends (together with its children) when:

- `program.stop` or `robot.stop` (STOP) is called;
- another program is started;
- the tab that started it disconnects (`ownerLeft`);
- the robot disconnects or the connection is lost (`robotLost`);
- the hub shuts down (`hubStopping`).

If the hub stopped the program itself, no `safety.event {reason:"clientLeft"}` alarm is broadcast when its connection closes: the motors are already stopped. A program that ends normally turns its motors off and releases control itself (`control.release`).

The process exit code: 0 — finished, 1 — error, 2 — stopped (a `safety.event` arrived). The hub looks at it only if it didn't stop the program itself.

The implementation is `src/Gearbit.Hub/Programs`: `ProgramRunner` (start, output, stop), `IProgramLanguage` (how to run a language), `IProgramLauncher` (the process; replaced in tests). Languages:

- `PythonLanguage` — `python.exe` with the `gearbit` package in `PYTHONPATH`, the program in `program.py`;
- `CSharpLanguage` — `csharp\Gearbit.ScriptHost.exe program.csx`. ScriptHost compiles the script with Roslyn Scripting (C# 14, `System…` imports, `Gearbit.Client` and `using static Gearbit.Client.RobotScript`, hence `robot` and `Wait`), translates compile and runtime errors into Russian (`CompileErrors`, `RuntimeErrors`) and drives through `Gearbit.Client`. The script runs inside the ScriptHost process, so, as with Python, the hub just ends the process.

### Protocol measurements (stage 0)

A mode for the [measurement helper](../STAGE0-CHECKLIST.md): frames go to the robot as they are, byte for byte. It is used by the measurement helper window (protocol log → «Замеры»).

| Method | Parameters | Behavior |
|---|---|---|
| `service.begin` | — | Take the arbiter with kind `service`, stop the motors and put the robot into manual mode: the state frame send loop is silent. Broadcasts `robot.info` with `serviceMode: true`. A repeated call by the same client does nothing; by another one — `ControlBusy`. |
| `service.send` | `{hex}` | Send a frame (spaces, `-` and `:` allowed, up to 64 bytes). Returns the byte count. Only for the measurement owner; without `service.begin` — `NotSupported`; bad hex — `InvalidParams`. |
| `service.end` | — | End measurements (any client may): motors to 0, the send loop works again, the arbiter is free. `true` if measurements were running. |

While measurements run, `motor.setPower`, `drive.*` and `light.setColor` are rejected with `ControlBusy`. The power limit is **not applied** to raw frames: a deliberate exception for measurements on a stand. Protection:

- `robot.stop` always works;
- the measurement watchdog: no new frames for longer than `Hub:ServiceWatchdogMs` (15 s) — a "stop" frame and `safety.event {reason:"watchdog"}`; fires once until the next frame;
- the client that began measurements disconnected — measurements end, motors to 0 (`safety.event {reason:"clientLeft"}`);
- changing or disconnecting the robot ends measurements.

### Debugging and the emulator

| Method | Parameters | Behavior |
|---|---|---|
| `trace.subscribe` | `{enabled}` | Send `robot.trace` for every frame. |
| `emulator.subscribe` | `{enabled}` | Send `emulator.state` ~15 times a second. |
| `emulator.state` | — | A snapshot of the world or `null`. |
| `emulator.reset` | — | The car back to the start of the current scene. |
| `emulator.setObstacles` | `{obstacles: [{x, y, width, height}]}` | Obstacles in centimeters. |
| `emulator.setSensorAngles` | `{angles: {D1: 0}, down: {D2: 2.5}}` | Where the virtual sensors look. `angles` — sideways: degrees from "forward", clockwise. `down` — at the floor: a sideways offset from the robot's axis in centimeters (below 0 — to the left, above 0 — to the right; no farther than `robotRadius − 1`), the point is `downSensorForward` cm ahead of the center. A sensor lives in one of the two dictionaries: put into `down`, it is removed from `angles`, and vice versa. Unknown ids are skipped. Returns `{angles, down}`. The interface calls it when the user moves sensors in the Sensors card. |
| `emulator.setScene` | `{scene: "room" \| "line"}` | The scene: `room` — a room with obstacles, `line` — a white sheet with a black stadium (center 120×80, 90 cm straights, radius 45, 3 cm line) without obstacles. The car goes to the scene's start. Returns `{scene}`; an unknown scene — `InvalidParams`. |
| `emulator.setTilt` | `{x, y}` | Tilt the car (gyroscope), degrees −90..90: `y` above 0 — forward, `x` above 0 — right (as in Makerzoid). Without parameters — level. The tilt holds until it is set back to 0; `emulator.reset` and turning off also zero it. Returns `{x, y}`. The interface calls it while the «Наклонить» (Tilt) buttons are held. |

## Notifications (hub → client)

| Method | When | Data |
|---|---|---|
| `robot.telemetry` | 10 times a second while the robot is connected | `TelemetryDto` |
| `robot.info` | connection, limit change, firmware | `RobotDto` or `null` |
| `robot.state` | connection state change | `{state, reason}` |
| `safety.event` | any emergency stop | `{reason: stop\|lost\|watchdog\|clientLeft, message}` |
| `control.changed` | owner change | `{clientId, clientName, kind, mine}` |
| `robot.trace` | a protocol frame (if subscribed) | `{dir: "out"\|"in", hex, note, t}`, `t` — ms since the hub started |
| `program.output` | the program printed lines (in batches every 100 ms, up to 32 KB) | `{runId, stream: "out"\|"err", text}` — lines separated by `\n`, no trailing `\n` |
| `program.say` | the program called `robot.say` | `{runId, text}` |
| `program.exited` | the program ended | `{runId, exitCode, reason, error, durationMs}`. `reason`: `finished` (code 0), `error`, `stopped` (STOP, `program.stop` or code 2 — the program caught the stop itself), `replaced`, `ownerLeft`, `robotLost`, `hubStopping`. `error`: `{line, column, message}` or `null`. |
| `emulator.state` | ~15 Hz (if subscribed) | `{active, roomWidth, roomHeight, robotRadius, x, y, heading, bumped, motors, lights, sensorCm, sensorLevels, sensorAngles, battery, obstacles, sensorDown, downSensorForward, scene, line, tiltX, tiltY}`. `line` — `{points: [{x, y}], width, closed}` or `null` outside the `line` scene. For sensors in `sensorDown` the level in `sensorLevels` is the floor under them: 0 white … 6 black. |

## Safety

- **Watchdog (dead man's switch)**: if an owner of kind `remote` sent no motion command for longer than `Hub:RemoteWatchdogMs` (600 ms), the motors stop (`safety.event {reason:"watchdog"}`). While a button is held, the remote repeats the command every ~100 ms, and the motor sliders every 250 ms. Programs (`source:"program"`) are not under the watchdog, but are stopped if they disconnect.
- On connection loss — `robot.state {state:"lost"}` and `safety.event {reason:"lost"}`.
- When the hub shuts down, the motors stop before disconnecting.
- A program started with `program.run` ends on STOP, when the tab that started it disconnects and when the robot is lost (see "Programs"). Only the tab that started it receives the `program.*` notifications.

## Errors

| Code | Name | When |
|---|---|---|
| −32700 | Parse error | Not JSON |
| −32600 | Invalid request | Not JSON-RPC 2.0 |
| −32601 | Method not found | No such method |
| −32602 | Invalid params | A parameter is missing or has a wrong type |
| −32603 | Internal error | An exception in the hub |
| −32001 | NotConnected | The robot is not connected |
| −32002 | ControlBusy | Another client is in control |
| −32003 | NotFound | No such device, component, build |
| −32004 | NotSupported | No transport or protocol, the component is unavailable in the firmware |
| −32005 | ConnectFailed | Could not connect |

The error `message` is in the client's language (`hub.hello {lang}`) and is fit to show to the user.

The hub texts live in `src/Gearbit.Hub/HubText.cs`: the `IHubText` interface and the `RuHubText`, `EnHubText` classes. Add a new text to the interface and to both classes — the project will not build without a translation. Throw an error like this: `throw new HubException(HubErrors.NotFound, t => t.NoMotor(id))`; the exception `Message` is the Russian text for the log. Broadcast a notification with text through `ClientRegistry.BroadcastText`. Robot and transport errors (`RobotException`) carry a `RobotErrorCode`, and the hub shows `IHubText.RobotError` for it.

## HTTP

- `GET /api/info` → `{hub: "Gearbit", version, websocket, robot, clients}`. Gearbit.exe uses it to learn that the port is taken by its own hub.
- `GET /` → the web interface from `wwwroot`.

## Settings (`appsettings.json`, `--Hub:…`)

| Key | Default | Meaning |
|---|---|---|
| `Hub:Port` | 5280 | The port (`localhost` only). |
| `Hub:DevicesDirectory` | `devices` next to the program | Robot descriptions. |
| `Hub:ProfilesDirectory` | `profiles` next to the program | Builds. |
| `Hub:RemoteWatchdogMs` | 600 | The dead man's switch timeout. |
| `Hub:ServiceWatchdogMs` | 15000 | The measurement watchdog: how long to wait for a new frame before stopping the motors. Over 10 s — to check whether the robot stops by itself (checklist item 8). |
| `Hub:ScanDurationMs` | 4000 | Search duration. |
| `Hub:AllowedOrigins` | — | Additional allowed `Origin`s. |
| `Hub:Emulator` | true | Show the emulator in the search. |
| `Hub:PythonPath` | — | The path to `python.exe`. Without it: `python\runtime\python.exe` next to the program, `py -3`, `python.exe` in `PATH` (Microsoft Store stubs are skipped). Python 3.9+ is required. |
| `Hub:PythonPackageDirectory` | `python` next to the program | Where the `gearbit` package is (added to `PYTHONPATH`). |
| `Hub:CSharpHostPath` | `csharp\Gearbit.ScriptHost.exe` next to the program | The C# program runner. |
| `Hub:ProgramsDirectory` | `%TEMP%\Gearbit\programs` | Where the program being run is written (a folder per run, deleted afterwards). |

## Example: Python without Gearbit libraries

```python
import asyncio, json, websockets

async def main():
    async with websockets.connect("ws://localhost:5280/ws") as ws:
        n = 0
        async def call(method, **params):
            nonlocal n; n += 1
            await ws.send(json.dumps({"jsonrpc": "2.0", "id": n, "method": method, "params": params}))
            while True:
                msg = json.loads(await ws.recv())
                if msg.get("id") == n:
                    return msg.get("result")

        await call("hub.hello", name="Python: test")
        await call("drive.tank", left=40, right=40, source="program")
        await asyncio.sleep(1)
        await call("robot.stop")

asyncio.run(main())
```

The `gearbit` package is more convenient ([python/README.en.md](../../../python/README.en.md)): `robot.forward(50)`, `wait(1)`, clear errors, stopping on STOP.
