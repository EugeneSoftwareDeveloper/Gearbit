# Apitor / Makerzoid SuperBot protocol (TUDAO controller)

[Русский](../PROTOCOL-SUPERBOT.md) · **English**

> Status: **assembled from public implementations, not yet checked on our robot** (this is stage 0 of the plan).
> The protocol is unofficial and was reverse-engineered. Marks: ✅ confirmed by several sources, ⚠️ one source or an inference, ❓ unknown.

## Sources

| Repository | What was taken |
|---|---|
| [amsdams/ApitorCommander](https://github.com/amsdams/ApitorCommander) (Python, bleak) | Explicitly for SuperBot: UUIDs, authorization, handshake, the state frame, sensor parsing |
| [pez2001/apitor](https://github.com/pez2001/apitor) (Python, bluepy, GPL-3.0) | The state frame, 11-byte telemetry, UID, Lua script upload |
| [LuanVinii/BlocosLab](https://github.com/LuanVinii/BlocosLab) (a Scratch fork, AGPL-3.0) | Captures from Makerzoid Lab: signed speed, 19-byte telemetry with a gyroscope |
| [initialed85/apitor](https://github.com/initialed85/apitor) (Rust, Robot Q) | The same authorization key |
| [kaxpur/apitor-ble](https://github.com/kaxpur/apitor-ble) | A **different** protocol (Robot J, `55 AA`, service `F0FF`). For SuperBot it's useful only as an example of the authorization format |

Only facts about the protocol were taken from these projects, not code.

## 1. Discovery and connection

| What | Value | |
|---|---|---|
| Advertised name | `Nordic_TUDAO` (code also looks for `Apitor`, `TUDAO`) | ⚠️ |
| Service | Nordic UART `6e400001-b5a3-f393-e0a9-e50e24dcca9e` | ✅ |
| Write (PC → robot) | `6e400002-b5a3-f393-e0a9-e50e24dcca9e` | ✅ |
| Notifications (robot → PC) | `6e400003-b5a3-f393-e0a9-e50e24dcca9e` | ✅ |
| Write size | up to 20 bytes at a time, larger data is split into chunks | ⚠️ |
| Pairing in Windows | not required | ⚠️ |

## 2. Sequence after connecting

1. Subscribe to `6e400003` notifications.
2. Send the **authorization** (20 bytes):
   `55 AA 11 20 64 79 6F 7A 57 4F 50 66 30 35 32 67 57 56 50 34`
   (`55 AA` + `11` authorize + `20` mode + the ASCII key `dyozWOPf052gWVP4`) ✅ (ApitorCommander, initialed85)
3. Send the **handshake / UID request**: `FF FE 01 04 FD FC` ✅
   Reply: a 13-byte frame `FF FE 08 <8-byte UID> FD FC` ⚠️ (pez2001)

## 3. Frame format

```
FF FE [len] [payload: len bytes] FD FC        total length = len + 5
```

`FF FE` is the start, `FD FC` is the end, there is no checksum. ✅
The third byte is the **payload length**. This matches all known frames: `FF FE 01 04 FD FC` (1 byte),
`FF FE 09 01 02 …` (9 bytes), `FF FE 08 <UID> FD FC` (8 bytes), telemetry `FF FE 06 …` (6 bytes, 11 total).
For the 19-byte telemetry we expect `FF FE 0E …` ❓.

The driver (`TudaoStreamSplitter`) assembles a frame by `len`, and if the `FD FC` tail isn't in place,
tries the known lengths 11/13/19. So a frame is parsed even if the third byte turns out to be a type rather than a length.
Garbage between frames is skipped and written to the protocol log.

### 3.1. State frame (PC → robot), 14 bytes ✅

```
FF FE 09 01 02 [M1] [M2] [M3] [L1] [L2] [L3] [L4] FD FC
```

- `M1..M3` — motor power, a **signed byte** (two's complement): `0A` = +10, `F6` = −10, `FB` = −5, `00` = stop. The sign sets the direction.
  - Range ❓: Makerzoid captures show ±5 and ±10 (the block default is 6), while ApitorCommander sends up to ±100. **To check**.
  - Ports: Makerzoid Lab has `port1..port3` and `all ports`. The car apparently uses M1 and M2 (the left and right sides). ApitorCommander inverts M2 because of mirrored mounting. **Checked on a real car (2026-11-06):** with M2 inverted the car drove the opposite way (forward↔backward, left↔right), so `profiles/superbot-car.json` inverts M1. Which port is the left one is clarified by checklist item 6.
- `L1..L4` — colors of the four LEDs, the color code ❓. Presumably as in Makerzoid: red, orange, yellow, green, cyan, blue, purple and "off". The code table is to be checked.
- The frame carries the **full state**, so the driver must remember the current values and send everything at once.
- Whether the frame has to be repeated periodically (a watchdog in the firmware) ❓.

### 3.2. Telemetry (robot → PC) ✅

The variant is determined by the full frame length (as in the Makerzoid/BlocosLab parser).

The robot sends it by itself after connecting.

**Old firmware — 11 bytes** (pez2001, ApitorCommander, BlocosLab):
```
FF FE 06 [mode] ?? [battery] ?? [D1] [D2] FD FC
idx: 0  1  2   3     4    5     6   7    8   9  10
```

**New firmware — 19 bytes** (BlocosLab, after the Makerzoid parser):
```
idx 6 = D1, idx 7 = D2, idx 8 = gyroscope X (+90 offset), idx 9 = gyroscope Y (+90), idx 10 = acceleration sum
```

- `D1`, `D2` — distance sensors (IR). A coarse scale, BlocosLab clamps it to **0–6**. `FF` = no data. Smaller means closer ❓ (check the scale direction).
- `battery` — charge level (byte 5 in the 11-byte frame), scale ❓.
- The gyroscope gives the **tilt**, not the heading (yaw). It's not suitable for precise "90°" turns.
- **Tilt directions ⚠️.** The Makerzoid "tilted [front/back/left/right/any]" blocks in BlocosLab (`TILT_THRESHOLD = 15` in `scratch3_kitrobotica/index.js`): forward — `y ≥ 15`, backward — `y ≤ −15`, left — `x ≤ −15`, right — `x ≥ 15`, "any" — `|x| ≥ 15` or `|y| ≥ 15`. Gearbit uses the same rules (`isTilted` in `model.ts`, `tilted()` in Python, `Tilted()` in C#). Which sign belongs to which direction on a real robot is **not checked** (checklist item 17).
- **Line sensors ⚠️.** There is no separate module: the Makerzoid "line tracker" blocks read the same `D1` (left) and `D2` (right) bytes. In the build the sensor is mounted "eye down", towards the floor. The "sees the line" state in BlocosLab is a value **≥ 3** (`_isLineTrackerMatchState` in `scratch3_kitrobotica/index.js`, analyzed in `docs/mapeamento-robotmaster-bluetooth.md` of the [BlocosLab](https://github.com/LuanVinii/BlocosLab) repository). Hence Gearbit's hypothesis: about 0 over a white sheet, about 6 over a black line, the default threshold is 3 (`(maxLevel + 1) / 2`). **Not checked** on a real robot: the threshold for your build can be measured in «Замеры» (Measurements) → «Датчики» (Sensors) → «Порог линии» (Line threshold) and written into the profile's `calibration.distance.<id>.lineLevel`.

### 3.3. Other ⚠️

- `FF FE 09 02 [len_hi] [len_lo] 00 00 00 00 00 00 FD FC`, then ASCII text — **uploading a Lua script** to the controller (pez2001, commented out in the code). Possibly autonomous programs. Not checked, experiment carefully.
- `FF FE 09 03 00 … FD FC` — "test" in pez2001, purpose ❓.

## 4. What to check in stage 0

- [ ] The device name and the presence of the Nordic UART service.
- [ ] Whether the authorization is accepted. Are commands ignored without it?
- [ ] Telemetry frame length (11 or 19), rate, whether a subscription or a request is needed.
- [ ] Power range: 10, 50, 100 → real speed. What happens above 10.
- [ ] Which ports the motors use (2 or 4 motors; paired connection?).
- [ ] Direction and scale of the distance sensors: 5 / 10 / 20 / 40 cm.
- [ ] A sensor looking at the floor: the level over a white sheet and over black tape (line threshold).
- [ ] LED color codes.
- [ ] Tilt: the sign of X and Y when tilted forward and right (in Makerzoid forward is `y > 0`, right is `x > 0`).
- [ ] Whether the robot stops by itself when frames stop arriving.
- [ ] Latency: command → movement, obstacle → telemetry change.
