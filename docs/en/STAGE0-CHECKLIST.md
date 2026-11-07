# Stage 0 — measurement checklist on the robot

[Русский](../STAGE0-CHECKLIST.md) · **English**

Goal: replace the placeholders in [devices/tudao-superbot.json](../../devices/tudao-superbot.json) and [profiles/superbot-car.json](../../profiles/superbot-car.json) with real values. Takes 30–40 minutes.

> **Safety:** while testing the motors, put the car on a stand (a box) so the wheels spin in the air. Close the official phone app: only one device can be connected to the robot at a time.

## Tool (any of the three)

**A. Gearbit itself: the measurement helper** — the easiest, nothing to install.
1. Turn the robot on → in Gearbit «Подключить» (Connect) → `Nordic_TUDAO`.
2. In the top bar click the protocol log button (☰) → in the log, the **«Замеры»** (Measurements) button.
3. The **«Запись»** (Recording) tab → «Начать запись» (Start recording). All frames, your notes and the wizards' results go into the recording.
4. The **«Кадры»** (Frames) tab: ready buttons for items 3–11 (hover to see the item number), a state frame builder for items 13–14 and a field for any hex. At the bottom you see what went to the robot (→) and what came back (←), and how many seconds passed since the last frame (for item 8).
5. The **«Мощность»** (Power) tab — item 12: the motor gets values one by one, you mark how the wheel spins.
6. The **«Датчики»** (Sensors) tab — items 15–16: put an obstacle at 1, 2, 3… cm (the sensor sees only close) and click «Замерить» (Measure); the helper computes the "level → cm" table for the profile. Below it — **«Порог линии»** (Line threshold, item 19): the sensor looks at the floor, a measurement over a white sheet and over a black line.
7. The «Запись» tab → «Остановить и сохранить…» (Stop and save…) → put the file into `docs/captures` (see [docs/captures](../captures/README.en.md)) or send it.

While measurements run, the remote and programs are off, and frames go out as they are, **without the power limit** — that's why the stand is a must. STOP and Space always work; if no frames are sent for 15 s, the hub stops the motors by itself. Closing the helper window ends the measurements, motors to 0.

> Item 2 (a motor **without** authorization) can't be checked in Gearbit: the hub sends the authorization itself on connection. You need nRF Connect for it.

**B. Phone: nRF Connect for Mobile** (free, Android/iOS, by Nordic Semiconductor). Nothing to install on the PC.
1. Turn the robot on → in nRF Connect tap **Scan** → find the device (expected `Nordic_TUDAO`) → **Connect**.
2. Open the **Nordic UART Service** (`6E400001…`).
3. On the **TX Characteristic** (`6E400003`) tap the triple-arrow icon to enable notifications. Frames from the robot arrive here.
4. On the **RX Characteristic** (`6E400002`) tap the up arrow (Write) → type **BYTE ARRAY** → enter hex **without spaces** → Send.
5. Received frames are visible in the TX value and in the **log** (swipe right or menu → Show log). The log can be copied whole and sent.

**C. PC: ApitorCommander** (Python + bleak), it has a hex traffic log. Suitable if Python is already on the PC.

## Tests

Frames to copy are given without spaces. The state frame template:
`FFFE090102` + `M1 M2 M3` + `L1 L2 L3 L4` + `FDFC`

| # | What we do | What to send (hex) | What to write down |
|---|---|---|---|
| 1 | Scan | — | The device name. Is there a `6E400001` service |
| 2 | Subscribe to TX, **without** authorization — a motor | `FFFE0901020A000000000000FDFC` → after 2 s `FFFE09010200000000000000FDFC` | Does M1 spin without authorization? |
| 3 | Authorization | `55AA112064796F7A574F50663035326757565034` | Did a reply come? Which one? |
| 4 | Handshake / UID | `FFFE0104FDFC` | The reply (expect 13 bytes `FFFE08…FDFC`) |
| 5 | Telemetry stream | — | Do frames come by themselves? How often? **Length: 11 or 19 bytes?** A whole example frame |
| 6 | Motor M1 forward | `FFFE0901020A000000000000FDFC` | Which wheel spins, which way |
| 7 | Stop | `FFFE09010200000000000000FDFC` | Did it stop? |
| 8 | Self-stop | item 6 again and **send nothing for 10 s** | Does it keep spinning or stop by itself (after how long)? |
| 9 | M1 backward | `FFFE090102F6000000000000FDFC` | Direction of rotation |
| 10 | M2 | `FFFE090102000A0000000000FDFC` | Which wheel, direction |
| 11 | M3 | `FFFE09010200000A00000000FDFC` | Is there a motor on port 3 |
| 12 | Speed range | M1 = `05`, `0A`, `14` (20), `32` (50), `64` (100) — put in place of `0A` in item 6 | Does the speed grow past 10? Anything odd at 50/100 |
| 13 | Lights: all 4 in one color | `FFFE09010200000001010101FDFC`, then `02`, `03`, `04`, `05`, `06`, `07`, `0A` instead of `01` | Which color each code gives. How many LEDs really exist |
| 14 | Lights one by one | `FFFE09010200000001000000FDFC` (L1 only) and so on | Which LED is where |
| 15 | Sensor 1 | a hand at ~2, 5, 10 cm and "nothing" | Which byte changes and the values |
| 16 | Sensor 2 | the same | The same |
| 17 | Tilt | tilt forward, backward, left, right | Bytes 8–10 (if the frame is 19 bytes). The sign of Y when tilted forward and of X when tilted right (both expected above 0) |
| 18 | Battery | — | The value of byte 5 (or another stable one) |
| 19 | Line threshold | the sensor eye down, ~1 cm above a white sheet, then over black tape | The level over white and over black (on our robot 0 and 3–4) |

> ⚠️ All state frames are exactly 14 bytes (28 hex characters), the authorization is 20 bytes (40 characters). For example, item 6 = `FF FE 09 01 02 0A 00 00 00 00 00 00 FD FC`. Check that no zeros got lost when copying.

## Where to record the results

You can simply send the table or the log in the chat, and the JSON and docs get updated. If you want to do it yourself:

| Result | Field |
|---|---|
| Device name | `devices/tudao-superbot.json` → `match.namePrefixes` |
| Whether authorization is needed | `protocol.auth.requiredForCommands` |
| Speed limit | `protocol.power.deviceMin/deviceMax` |
| Color codes | `protocol.lightColors` |
| Self-stop / repeat needed | `protocol.sendLoop.resendIntervalMs` |
| Frame length and indexes | `protocol.telemetry.variants` |
| Sensor scale | `protocol.distance` |
| Which motor is left, inversion | `profiles/superbot-car.json` → `drive` (already checked: forward/backward and turns were reversed, now M1 is inverted) |
| Where the sensors look | `profiles/superbot-car.json` → `aliases` (in Gearbit itself a sensor can be moved in the Sensors card — that's an interface setting) |
| Centimeters per level | `profiles/superbot-car.json` → `calibration.distance.<id>.levelToCm` (the measurement helper, the Sensors tab, ready JSON) |
| Line threshold | `profiles/superbot-car.json` → `calibration.distance.<id>.lineLevel` (same place, the «Порог линии» section) |

After checking, change the `verified` field to `true`.
