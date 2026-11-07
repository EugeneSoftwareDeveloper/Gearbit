# Remote control

[Русский](../../user/remote-control.md) · **English**

![Gearbit logo](../../images/logo.png)

The remote screen has a header and five cards: **Driving**, **Robot** (the emulator room or the radar), **Sensors**, **Light**, **Motors**.

## Header

| Element | What it does |
|---|---|
| **Remote / Blocks / Python / C#** | Modes: Remote, [Blocks](blocks.md), [Python](python.md) and [C#](csharp.md). |
| Robot badge | Connection state and build. Click it to connect, change or disconnect the robot. The dot: gray — no robot, yellow — connecting, green — connected, red — connection lost. |
| ☰ | Protocol log: the bytes between the computer and the robot. Useful for development. |
| ? | Key hints. Also opens with **F1**. |
| ⚙ | Settings: language, looks and the power limit. |
| **STOP** | Stops all motors. Always works, even when a program or another remote controls the robot. The button pulses while the robot is moving. |

## Driving

**Buttons or joystick.** On the **Buttons** tab the on-screen arrows work like keys: press and hold. On the **Joystick** tab drag the circle with the mouse or a finger: the farther from the center, the faster.

**The keyboard** always works while the remote is open:

| Keys | Action |
|---|---|
| W, ↑ | Forward |
| S, ↓ | Backward |
| A, D (←, →) | Turn: with throttle — an arc, without — on the spot |
| Q, E | Spin on the spot |
| Space, Esc | STOP |
| F1 | Hints |

**Gamepad.** Connect it and its name appears in the card. The left stick controls throttle and turning, and small deflections give slow, precise movement. The D-pad works like the arrows. **B / ○ / Start** — STOP.

**Speed** is a share of the build's power limit. For example, with a 60 % limit and 50 % speed the motors get 30 %.

## Emulator room

Shown when the emulator is connected. The room is 240 × 160 cm, the grid cell is 10 cm.

- **Draw an obstacle:** hold the mouse button on an empty spot and drag.
- **Remove an obstacle:** double-click it.
- **To start** returns the car to its starting place. **Remove obstacles** clears the room.
- **Room / Line** under the map change the floor. **Room** — obstacles and walls. **Line** — a white sheet with a black stadium-shaped track for [line following](line-following.md); the car is placed on the track.
- The rays are sensors, the light line behind the car is its path. If the car bumps into a wall, it is highlighted.
- Sensors that look at the floor are drawn as small squares in front of the car: a black square — there is a line under it, a white one — paper.
- **Tilt** — the arrows tilt the car forward, backward, left or right by 30° while the button is held. This is how you test programs with "tilted?" and "when tilted" without a real robot. The emulator room is also visible on the **Blocks**, **Python** and **C#** tabs, so you can tilt the car while a program is running.

## Radar (real robot)

For a real robot you see a radar instead of the room. The rays show which way each sensor looks and what it sees. A short red ray means an obstacle is close. Sensors that look at the floor are drawn as squares in front of the robot labeled "black" or "white". If the robot has no sensors, the radar is empty — that's fine.

## Sensors

- **Distance**: a level from 0 (touching) to 6 (far or nothing). A bar of 7 segments: red — close, yellow — medium, green — far. When the sensor is calibrated, centimeters are shown next to it.
- **Where the sensor is.** The SuperBot kit has two (IR) sensors, and every model places them differently. The sensor's name (**Front**, **Right**) is a button: click it and choose where it sits on your robot: front, back, left, right or diagonal. The radar, the emulator room and blocks like "distance front" take it into account right away.
- **The sensor looks at the floor.** The list has a group **Looks at the floor: line**: **Down**, **Down left**, **Down right**. Then instead of the distance the card shows **Black** or **White** and the level; the bar is gray, the dark segments are the black zone (from the threshold, usually 3). This is how the robot follows a line: [Line following](line-following.md).
- **No sensor.** If your model has no such sensor, choose **Not on the robot**: the row disappears, and at the bottom you see "Not on the robot: D1" with a **Bring back** button. The robot sends some numbers even without a sensor, so Gearbit can't find out by itself.
- The choice is remembered per build on this computer.
- **Battery**: a raw value from the robot for now. When it's low, the card is highlighted.
- **Tilt X / Y**: only robots with the new firmware have a gyroscope. With the old firmware this card is missing.

## Light

The **All** row colors all LEDs at once, the other rows one at a time (L1–L4). A crossed-out circle turns the LED off.

## Motors

One slider per motor: right — forward, left — backward. A double click on a slider returns it to 0. While a slider is not at zero, the motor spins. STOP returns all sliders to 0.

## Who controls the robot

At any moment only one controls the robot: this remote, another Gearbit window or a Python/C# program. If someone else is in control, a yellow bar with a **Take control** button appears at the top. STOP works for everyone, always.

During [protocol measurements](measurements.md) the remote is off, and the yellow bar has a **Finish measurements** button.

## Settings (⚙)

- **Language · Язык:** **Русский** or **English**. The page reloads, the programs on the tabs stay in place.
- **Theme:** Day, Night or Auto (as in Windows). The night theme doesn't dazzle in the evening.
- **Color:** Ocean, Forest, Sunset, Cosmos, Candy.
- **Large text:** for a big monitor at a distance or for young readers.
- **Motor power limit** (when a robot is connected): a common limit for the remote and programs. The **Car** build suggests 60 %. A grown-up should raise the limit.

### What Gearbit remembers

On this computer, in the file `%LOCALAPPDATA%\Gearbit\settings.json`:

- the language, theme, color and large text;
- the speed and how to drive (buttons or joystick);
- where the sensors are — for each build;
- the last tab: Gearbit opens where you left off;
- the last build for each robot: it is already selected in the connection window.

The Gearbit.exe window opens in the same place and with the same size as when it was closed. The power limit is not remembered: the build suggests it again on every connection.
