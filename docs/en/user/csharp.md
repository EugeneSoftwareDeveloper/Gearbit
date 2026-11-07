# C#: a program in Gearbit's language

[Русский](../../user/csharp.md) · **English**

On the **C#** tab the robot program is written in C#. Gearbit itself is written in it, as are Unity games and many Windows programs. It's the step after Blocks and Python, roughly from age 11–12. The commands are the same as in Python, only with a capital letter and a semicolon at the end: `robot.Forward(50);`.

## What you need

Nothing to install: everything for C# is already in Gearbit. To the right of **Run** you see the language version, for example "C# 14".

The program here is a **script**: commands are written right away, without `class` and `Main`. `robot` and `Wait` are ready, and `System`, `System.Linq`, `System.Collections.Generic` and other common namespaces are imported.

## Screen

| Where | What |
|---|---|
| Top | **Run**, **Stop**, the program state, **Examples**, **New program**, **Open**, **Save**, **History**. |
| Center | The program text. Above it — the file name and the **changed** mark if the program isn't saved to a file yet. |
| Bottom | **Output**: `Console.WriteLine()` writes here, errors and the "The program has ended" message show up here too. |
| Right | The robot (emulator room or radar) with the `robot.Say` bubble, the **Commands** card and **Sensors**. |

Clicking a command in the Commands card inserts it into the program at the cursor. If it's a loop or `if`, the cursor lands inside the curly braces. While you type `robot.`, Gearbit suggests commands. **Enter** or **Tab** inserts a command, and **Tab** then jumps to the next number in the parentheses. **Ctrl+Space** shows suggestions anywhere.

## The first program

1. Connect the robot or the emulator (the **No robot** badge at the top).
2. Open **Examples** → **First ride**.
3. Click **Run** or press **F5**.

```csharp
robot.Say("Let's go!");
robot.Forward(50);        // forward with power 50
Wait(1);                  // drive for 1 second
robot.TurnRight(40);
Wait(0.5);
robot.Backward(50, 1);    // backward for 1 second and stop
robot.Say("We're there!");
```

The examples are in the language of the interface: in English the comments and captions are English, in Russian — Russian.

Three C# rules that are forgotten most often:

- every command ends with a semicolon `;`;
- capital and small letters differ: `Forward`, not `forward`;
- what is inside a loop or `if` goes in curly braces `{ }`.

## Commands

### Motion

Power is from 0 to 100. If you give seconds, the robot drives that long and stops. Without seconds it drives until told otherwise.

| Command | What it does |
|---|---|
| `robot.Forward(50);` | Forward. `robot.Forward(50, 2);` — 2 seconds, then stop. |
| `robot.Backward(50);` | Backward. |
| `robot.TurnLeft(40);` | Turn left on the spot. |
| `robot.TurnRight(40);` | Turn right on the spot. |
| `robot.Drive(50, 30);` | Throttle and steering, like a gamepad stick. Steering above 0 — right, below 0 — left. |
| `robot.Tank(50, 20);` | Left and right wheel separately. Negative power — backward. |
| `robot.Motor("M3", 50);` | One motor. |
| `robot.Stop();` | Stop. |
| `Wait(1);` | Wait 1 second. The robot keeps doing what it was told. |

### Sensors

| Command | What it returns |
|---|---|
| `robot.Distance("front")` | Distance (`int`): 0 — touching, 6 — far or nothing there. |
| `robot.Obstacle("front")` | `true` if an obstacle is close (distance below 2). |
| `robot.DistanceCm("front")` | Centimeters (`double?`) if the sensor is calibrated ([measurements](measurements.md)), otherwise `null`. |
| `robot.OnLine("down_left")` | `true` if a sensor looking at the floor sees the black line. Without a name — the first **Down** sensor. More in [Line following](line-following.md). |
| `robot.Tilted("forward")` | `true` if the robot is tilted that way by more than 15°. Directions: `"forward"`, `"backward"`, `"left"`, `"right"`, `"any"`; Russian works too: `"вперёд"`, `"назад"`, `"влево"`, `"вправо"`. Without a direction — `"any"`. |
| `robot.Tilt()` | The robot's tilt in degrees: `var (x, y) = robot.Tilt();`. `y` above 0 — the nose is down (forward), `x` above 0 — tilted right. |
| `robot.Battery()` | Battery level. |
| `robot.Connected` | `true` if the robot is connected. |

A sensor is named by its place: `"front"`, `"right"`, `"left"`, `"back"` and the diagonal `"front_right"`, `"front_left"`, `"back_right"`, `"back_left"`. Russian works too: `"впереди"`, `"справа"`, `"слева"`, `"сзади"`. Or by number: `"D1"`, `"D2"`. Sensors that look at the floor: `"down"`, `"down_left"`, `"down_right"` (`"вниз"`, `"вниз слева"`, `"вниз справа"`). The sensor's place is the one set in the Sensors card on the Remote tab: move the sensor there and the program knows it.

### Lights and captions

| Command | What it does |
|---|---|
| `robot.Light("all", "green");` | All lights green. One light: `robot.Light("L1", "red");`. |
| `robot.LightsOff();` | Turn the lights off. |
| `robot.Say("Hello!");` | A bubble above the robot on the screen. `robot.Say("");` removes it. |
| `Console.WriteLine("Hello!");` | Print a line to **Output**. |

Colors: `red`, `orange`, `yellow`, `green`, `cyan`, `blue`, `purple`, `white`, `off`. Russian works too: `"красный"`, `"зелёный"` and so on.

## How to stop

- **Stop** on the toolbar, **Shift+F5**, the big **STOP** button in the header or **Esc** stop the program and the robot. **Space** does too, but only when the cursor is not in the program text: there it types a space.
- The program also stops by itself when:
  - you switch to another tab or minimize the window;
  - the connection to the robot is lost;
  - there is an error in the program.
- **The program ended** — the robot stops. If it was still driving, Gearbit suggests: to drive longer, add `Wait(seconds)` or a `while (true)` loop.

Before running, Gearbit compiles the whole program, so the first run takes a second or two.

## Errors

C# checks the whole program **before** running it. If there is an error, the robot doesn't move, and Gearbit highlights the line in red, puts the cursor on it and writes what's wrong to **Output**. The messages are in the language of the interface: English or Russian. For example:

- "A command needs a semicolon «;» at the end.";
- "The robot has no command «Forwrd». Maybe robot.Forward?";
- "Write Wait with a capital letter: Wait(1);".

Below, in parentheses, is the same message from C# itself with the error code (for example, `CS1002`). The code makes it easy to search for an answer online.

Errors while running (division by zero, a wrong color) also show the line. Hover over the underlined spot to see the same message. The **Show line** button in **Output** takes you back to the error.

`Console.ReadLine()` doesn't work here: the program has no keyboard to read from. Put numbers right into the program.

## Keys

| Keys | What they do |
|---|---|
| **F5** or **Ctrl+Enter** | Run |
| **Shift+F5** or **Esc** | Stop |
| **Ctrl+Space** | Command suggestions |
| **Tab** / **Shift+Tab** | Indent right / left |
| **Ctrl+Z** / **Ctrl+Y** | Undo / redo |
| **Ctrl+F** | Find in the program |
| **Ctrl+/** | Comment out a line |

## Examples

| Example | What it teaches |
|---|---|
| First ride | A sequence of commands |
| Square | The `for` loop and strings with `$"…{variable}"` |
| Explorer | `while (true)`, `if … else if … else`, two sensors |
| Careful driver | `var` variables and computing speed from a sensor |
| Follow the line | `OnLine` with two sensors and `&&` / `!` |
| Along the line edge | One sensor and a zigzag along the edge |
| Traffic light | An array of pairs and `foreach` |
| Tilt me | `Tilted` and `if … else if`: lights show where the robot is tilted |
| Counting | Variables and `Console.WriteLine` without a robot |

## Saving

- The program **is remembered automatically**: close Gearbit, open it again — the text is there.
- **Save** writes a regular `*.cs` file. You can open it in any editor.
- **Open** loads a `*.cs` or `*.csx` file. **New program** starts from a clean sheet.
- **History** (the clock) keeps earlier versions: before **New program**, an example and **Open**, on run and every 5 minutes of work. Accidentally deleted text can be brought back: [Program history](history.md).

## C# outside Gearbit (for grown-ups)

The same program can run from Visual Studio, VS Code or a console while Gearbit is open and the robot is connected. You need the `Gearbit.Client` library: the `src/Gearbit.Client` project in the Gearbit sources (the NuGet package is not published yet).

```bash
dotnet new console -n MyRobot
cd MyRobot
dotnet add reference ..\Gearbit\src\Gearbit.Client\Gearbit.Client.csproj
```

Add one line at the top of `Program.cs`, the rest is as in Gearbit:

```csharp
using static Gearbit.Client.RobotScript;

robot.Forward(50);
Wait(1);
Console.WriteLine($"Front: {robot.Distance("front")}");
```

`robot` connects to Gearbit at `ws://localhost:5280/ws` on the first command. For another address use the `GEARBIT_URL` environment variable or your own object: `using var bot = new Robot("ws://localhost:5290/ws");`. When the program ends, the robot stops and control is released.
