# Python: a program in text

[Русский](../../user/python.md) · **English**

On the **Python** tab the robot program is written in the real Python language. It's the next step after Blocks, roughly from age 10. The commands are the same: drive, turn, wait, look at sensors. Only now they are lines of text, for example `robot.forward(50)`.

## What you need

Python 3.9 or newer on the computer. Gearbit finds it by itself.

1. Download Python from [python.org](https://www.python.org/downloads/).
2. During installation, tick **Add python.exe to PATH**.
3. Restart Gearbit.

If Python is not found, a yellow bar with a hint and a **Check again** button appears above the program. To the right of **Run** Gearbit shows which Python it found, for example "Python 3.13.0".

For grown-ups: Gearbit looks for Python in this order:

1. the path from the `Hub:PythonPath` setting, for example `Gearbit.exe --Hub:PythonPath="C:\Python313\python.exe"`;
2. the `python\runtime` folder next to Gearbit (you can put a portable Python there);
3. the `py` launcher from python.org;
4. `python.exe` in `PATH`.

## Screen

| Where | What |
|---|---|
| Top | **Run**, **Stop**, the program state, **Examples**, **New program**, **Open**, **Save**, **History**. |
| Center | The program text. Above it — the file name and the **changed** mark if the program isn't saved to a file yet. |
| Bottom | **Output**: `print()` writes here, errors and the "The program has ended" message show up here too. |
| Right | The robot (emulator room or radar) with the `robot.say` bubble, the **Commands** card and **Sensors**. |

Clicking a command in the Commands card inserts it into the program at the cursor. While you type `robot.`, Gearbit suggests commands. **Enter** or **Tab** inserts a command, and **Tab** then jumps to the next number in the parentheses.

## The first program

1. Connect the robot or the emulator (the **No robot** badge at the top).
2. Open **Examples** → **First ride**.
3. Click **Run** or press **F5**.

```python
from gearbit import robot, wait

robot.say("Let's go!")
robot.forward(50)        # forward with power 50
wait(1)                  # drive for 1 second
robot.turn_right(40)
wait(0.5)
robot.backward(50, 1)    # backward for 1 second and stop
robot.say("We're there!")
```

The examples are in the language of the interface: in English the comments and captions are English, in Russian — Russian.

The first line `from gearbit import robot, wait` is needed in every robot program: it gives you the `robot` and `wait` commands.

## Commands

### Motion

Power is from 0 to 100. If you give seconds, the robot drives that long and stops. Without seconds it drives until told otherwise.

| Command | What it does |
|---|---|
| `robot.forward(50)` | Forward. `robot.forward(50, 2)` — 2 seconds, then stop. |
| `robot.backward(50)` | Backward. |
| `robot.turn_left(40)` | Turn left on the spot. |
| `robot.turn_right(40)` | Turn right on the spot. |
| `robot.drive(50, 30)` | Throttle and steering, like a gamepad stick. Steering above 0 — right, below 0 — left. |
| `robot.tank(50, 20)` | Left and right wheel separately. Negative power — backward. |
| `robot.motor("M3", 50)` | One motor. |
| `robot.stop()` | Stop. |
| `wait(1)` | Wait 1 second. The robot keeps doing what it was told. |

### Sensors

| Command | What it returns |
|---|---|
| `robot.distance("front")` | Distance: 0 — touching, 6 — far or nothing there. |
| `robot.obstacle("front")` | `True` if an obstacle is close (distance below 2). |
| `robot.distance_cm("front")` | Centimeters if the sensor is calibrated ([measurements](measurements.md)), otherwise `None`. |
| `robot.on_line("down_left")` | `True` if a sensor looking at the floor sees the black line. Without a name — the first **Down** sensor. More in [Line following](line-following.md). |
| `robot.tilted("forward")` | `True` if the robot is tilted that way by more than 15°. Directions: `"forward"`, `"backward"`, `"left"`, `"right"`, `"any"`; Russian works too: `"вперёд"`, `"назад"`, `"влево"`, `"вправо"`. Without a direction — `"any"`. |
| `robot.tilt()` | The robot's tilt in degrees: two numbers `(x, y)`. `y` above 0 — the nose is down (forward), `x` above 0 — tilted right. |
| `robot.battery()` | Battery level. |

A sensor is named by its place: `"front"`, `"right"`, `"left"`, `"back"` and the diagonal `"front_right"`, `"front_left"`, `"back_right"`, `"back_left"`. Russian works too: `"впереди"`, `"справа"`, `"слева"`, `"сзади"`. Or by number: `"D1"`, `"D2"`. Sensors that look at the floor: `"down"`, `"down_left"`, `"down_right"` (`"вниз"`, `"вниз слева"`, `"вниз справа"`). The sensor's place is the one set in the Sensors card on the Remote tab: move the sensor there and the program knows it.

### Lights and captions

| Command | What it does |
|---|---|
| `robot.light("all", "green")` | All lights green. One light: `robot.light("L1", "red")`. |
| `robot.lights_off()` | Turn the lights off. |
| `robot.say("Hello!")` | A bubble above the robot on the screen. `robot.say("")` removes it. |
| `print("Hello!")` | Print a line to **Output**. |

Colors: `red`, `orange`, `yellow`, `green`, `cyan`, `blue`, `purple`, `white`, `off`. Russian works too: `"красный"`, `"зелёный"` and so on.

## How to stop

- **Stop** on the toolbar, **Shift+F5**, the big **STOP** button in the header or **Esc** stop the program and the robot. **Space** does too, but only when the cursor is not in the program text: there it types a space.
- The program also stops by itself when:
  - you switch to another tab or minimize the window;
  - the connection to the robot is lost;
  - there is an error in the program.
- **The program ended** — the robot stops. If it was still driving, Gearbit suggests: to drive longer, add `wait(seconds)` or a `while True:` loop.

## Errors

If the program has an error, Gearbit highlights the line in red, puts the cursor on it and writes what's wrong to **Output**. The messages are in the language of the interface: English or Russian. For example:

- "A line with if, elif, else, for, while or def needs a colon «:» at the end.";
- "The robot has no command «forwrd». Maybe robot.forward?";
- "Python does not know «robot». Add this as the first line: from gearbit import robot, wait".

Hover over the underlined spot to see the same message. The **Show line** button in **Output** takes you back to the error.

`input()` doesn't work here: the program has no keyboard to read from. Put numbers right into the program.

## Keys

| Keys | What they do |
|---|---|
| **F5** or **Ctrl+Enter** | Run |
| **Shift+F5** or **Esc** | Stop |
| **Tab** / **Shift+Tab** | Indent right / left (indents matter in Python: they show what is inside a loop or `if`) |
| **Ctrl+Z** / **Ctrl+Y** | Undo / redo |
| **Ctrl+F** | Find in the program |
| **Ctrl+/** | Comment out a line |

## Examples

| Example | What it teaches |
|---|---|
| First ride | A sequence of commands |
| Square | The `for` loop |
| Explorer | `while True`, `if … elif … else`, two sensors |
| Careful driver | Variables and computing speed from a sensor |
| Follow the line | `on_line` with two sensors and `and` / `not` |
| Along the line edge | One sensor and a zigzag along the edge |
| Traffic light | Lists and nested loops |
| Tilt me | `tilted` and `if … elif`: lights show where the robot is tilted |
| Counting | Variables and `print` without a robot |

## Saving

- The program **is remembered automatically**: close Gearbit, open it again — the text is there.
- **Save** writes a regular `*.py` file. You can open it in any editor.
- **Open** loads a `*.py` file. **New program** starts from a clean sheet.
- **History** (the clock) keeps earlier versions: before **New program**, an example and **Open**, on run and every 5 minutes of work. Accidentally deleted text can be brought back: [Program history](history.md).

## Python outside Gearbit (for grown-ups)

The same program can run from VS Code, IDLE or a console while Gearbit is open and the robot is connected. The `gearbit` package is in the `python` folder next to Gearbit.exe (in the sources — in the repository's `python` folder):

```bash
pip install -e python
python my_program.py
```

Without installing, it's enough to add that folder to the `PYTHONPATH` variable. Package description — [python/README.en.md](../../../python/README.en.md).
