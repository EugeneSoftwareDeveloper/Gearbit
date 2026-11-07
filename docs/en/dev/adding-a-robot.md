# Adding a robot or a build

[Русский](../../dev/adding-a-robot.md) · **English**

There are three levels, from simple to complex:

1. **A new build** from the same kit (a tank, a dog): only JSON in `profiles/`.
2. **A new robot with a known protocol** (another name, another set of ports): JSON in `devices/`.
3. **A new protocol or transport**: code, an implementation of `IRobotProtocol` or `ITransport`.

Files from `devices/` and `profiles/` are copied next to the program. They can be edited without rebuilding: restart Gearbit.

## 1. A build (`profiles/*.json`)

A build answers the questions: which motors are wheels, where the sensors look, what a sensible power limit is.

```json
{
  "$schemaVersion": 1,
  "id": "superbot-tank",
  "title": { "ru": "Танк", "en": "Tank" },
  "device": "tudao-superbot",
  "status": "draft",
  "drive": { "type": "differential", "left": "M1", "right": "M2", "invertLeft": true, "invertRight": false },
  "aliases": { "front": "D1", "left_track": "M1", "right_track": "M2", "turret": "M3" },
  "limits": { "maxPowerPercent": 50, "kidMode": true },
  "calibration": { "distance": { "D1": { "levelToCm": null, "lineLevel": null } } }
}
```

| Field | Meaning |
|---|---|
| `title` | The name for the interface: an object by language `{"ru": …, "en": …}` or one string for all languages ([Languages](i18n.md#descriptions-of-robots-devices-profiles)). The `title` of a model and of components is written the same way. |
| `device` | The model `id` from `devices/`. |
| `drive` | The drive. Only `differential` exists for now: the left and right motor and their inversion. Without this field `drive.*` returns `NotSupported`, but the motors can still be controlled one by one. |
| `aliases` | Friendly names for ports. Programs see them (`motor.setPower {id:"turret"}`), and so does the radar (`front`, `right`, `left`, `front_left`, `front_right`, `back` set the ray direction). |
| `limits.maxPowerPercent` | The power limit suggested on connection. |
| `calibration.distance.<id>.levelToCm` | An array of 7 numbers: level 0–6 → centimeters. `null` — not calibrated. |
| `calibration.distance.<id>.lineLevel` | The level from which a sensor looking at the floor sees the black line. `null` — the default `(maxLevel + 1) / 2`. Measured in **Measurements** → **Sensors** → **Line threshold**. |
| `status` | `draft` until the build is checked on a real robot. |

Check: `dotnet test` (the `CatalogTests` test loads all the JSON), then connect to the emulator with this build.

## 2. A robot model (`devices/*.json`)

The model description: how to find it, how to connect, protocol parameters, the list of components. Example — `devices/tudao-superbot.json`.

- `match.namePrefixes` and `match.services` — `RobotCatalog.Match` recognizes the device by them during a scan.
- `transport` — the type (`ble-gatt`), service and characteristic UUIDs, chunk size, write with or without response.
- `protocol.name` — which `IRobotProtocolFactory` to use (`tudao-uart`). The rest of the `protocol` fields are read by the protocol itself: color codes, power range, send rate, telemetry variants.
- `components` — `[{id, type, title, requiresFirmware?}]`. Types: `motor`, `distance`, `imu`, `light`, `battery`.

**The `verified` rule.** A value taken from someone else's code or a guess gets `"verified": false` and an explanation in `note`. After a measurement on the robot — `true` and a short note on how it was checked. The checklist is [STAGE0-CHECKLIST.md](../STAGE0-CHECKLIST.md).

## 3. A new protocol

Implement it in a separate project `Gearbit.Protocols.<Name>`:

```csharp
public sealed class MyProtocolFactory : IRobotProtocolFactory
{
    public string Name => "my-protocol";               // matches devices/*.json → protocol.name
    public IRobotProtocol Create(DeviceDescriptor d) => new MyProtocol(MyOptions.From(d));
}

public sealed class MyProtocol : IRobotProtocol
{
    public string Name => "my-protocol";
    public ProtocolTiming Timing { get; }              // state frame rate and repeat
    public int DistanceMaxLevel => 6;
    public IReadOnlyList<ConnectStep> ConnectSequence { get; }  // authorization, UID request…
    public byte[] EncodeState(RobotOutputState state) { … }     // motors and lights → frame
    public IFrameReader CreateReader() => new MyFrameReader();  // bytes → TelemetryMessage / DeviceInfoMessage
}
```

- The protocol **knows nothing about the transport**: it takes bytes and gives bytes.
- `ProtocolRobot` sends the state at the right rate and repeats it (`Timing`), applies the power limit (wheel inversion is done by `DifferentialDrive`), parses telemetry into components.
- `IFrameReader.Feed` gets chunks of any length: assemble frames yourself (example — `TudaoStreamSplitter`).
- Register the factory in `GearbitHub.AddHub`: `services.AddSingleton<IRobotProtocolFactory, MyProtocolFactory>()`.

Tests: frame encoding against reference bytes, parsing a stream cut into random chunks, `ProtocolRobot` over `LoopbackTransport`. Follow `TudaoProtocolTests` and `ProtocolRobotTests`.

## 4. A new transport

Implement `IDeviceScanner` and `ITransportFactory` with a shared `TransportKind` (for example, `"serial"`) and `ITransport`:

- `ConnectAsync` / `DisconnectAsync`, the `StateChanged` event. An unexpected disconnect is reported with the `Faulted` state and a reason: the robot goes `lost`, the hub broadcasts `safety.event`.
- `WriteAsync` cuts data into chunks of an allowed size itself.
- `DataReceived` — raw bytes, no parsing.
- `DiscoveredDevice.Id` — with a kind prefix: `serial:COM5`.

Register it via `addTransports` in `GearbitHub.Build` (like BLE in `Gearbit.Server/Program.cs` and `Gearbit.App/App.xaml.cs`) with `TryAddEnumerable`, so scanners add up instead of replacing each other.

## 5. The emulator

The emulator (`Gearbit.Emulator`) speaks the TUDAO byte protocol over `LoopbackTransport`, so it checks the whole path: frames, rate, telemetry parsing. For another protocol, write your own controller emulator following `TudaoEmulator`. The world (`EmulatorWorld`: the room, the differential drive, sensor rays) can be reused.
