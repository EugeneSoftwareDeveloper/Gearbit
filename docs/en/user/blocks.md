# Blocks: a program for the robot

[Русский](../../user/blocks.md) · **English**

On the **Blocks** tab a child builds a program from colored blocks, like in Scratch, and the robot runs it on its own. Good for children from 7. Little reading is needed: each block is a short phrase ("move forward power 50").

## Screen

| Where | What |
|---|---|
| Left | **Palette**: categories and blocks. Drag a block with the mouse onto the canvas. |
| Center | **Canvas**: the program is built here. The mouse wheel scrolls the canvas, the "+" and "−" buttons in the corner zoom, "=" returns to normal size. |
| Right | The robot (emulator room or radar), **Variables** and **Sensors**. |
| Top | **Run**, **Stop**, the program state, **Examples**, **New program**, **Open**, **Save**, **History**. |

## The first program

1. Connect the robot or the emulator (the **No robot** badge at the top).
2. Click **Examples** and pick **First steps**.
3. Click the green **Run** button with the flag.
4. The robot drives forward, turns and comes back. While the program runs, its blocks glow and the **Run** button pulses.

A program starts with the "when flag clicked" block from **Events**. Blocks not attached to it don't run. If there is no such block, Gearbit tells you to add it.

Clicking a separate stack of blocks runs only that stack. Clicking again stops it. Clicking a round block (for example, "distance front") shows its value right now.

## Categories

| Category | Blocks |
|---|---|
| **Events** | "when flag clicked"; "when distance … < 2" — fires when an obstacle comes closer; "when tilted [forward]" — when the robot is tilted that way. |
| **Motion** | Move forward or backward; turn on the spot; move for a given time; drive with different wheel power (smooth turn); spin one motor; stop. |
| **Lights** | LED color; lights off; "say" — a caption above the robot on the screen. |
| **Control** | wait, repeat, forever, if, if … else, wait until, repeat until, stop. |
| **Sensing** | Distance (0 — touching, 6 — far) front, right, left, back or by sensor number (D1, D2); "obstacle ?" (yes if the distance is less than 2); "sensor [down left] sees the black line?" — for [line following](line-following.md); "tilted [forward] ?" (yes if the robot is tilted that way by more than 15°) and the tilt in degrees; battery level; timer. "front" is the sensor that the **Sensors** card on the **Remote** tab places at the front. |
| **Operators** | Arithmetic, comparisons, and, or, not, random number, join text. |
| **Variables** | Create a variable, set and change its value. |

**Power** in blocks goes from 0 to 100 (in "drive: left wheel … right …" and "motor" it can be negative, which means backward). The power limit from the settings applies here too: with a 60 % limit, "power 100" gives 60 %. The **Speed** slider on the remote doesn't affect programs.

## How to stop

- **Stop** on the blocks toolbar stops the program and the robot.
- **STOP** in the header, **Space** or **Esc** work as always: they stop both the program and the robot.
- The program also stops by itself when:
  - you switch to another tab (**Remote**, **Python**, **C#**) or minimize the window;
  - the connection to the robot is lost;
  - there is an error in the program — Gearbit shows a message and highlights the block where it happened.
- **The program ended while the robot was moving** — Gearbit stops it and suggests how to drive longer: add "wait" or "forever".
- If the program has a "when distance < …" or "when tilted …" event, it doesn't end by itself: the robot waits for an obstacle or a tilt until you click **Stop**.

On the **Blocks** tab the W A S D keys and the gamepad stick don't move the robot: only the program controls it. Space, Esc and **B / ○ / Start** on the gamepad are still STOP.

## Variables

1. Open the **Variables** category and click **Make a Variable**.
2. Think of a name, for example "count".
3. Tick the checkbox next to the variable in the palette. Its value appears on the right, in the **Variables** card, and changes while the program runs.

An example with a variable — **Counting obstacles**.

## Examples

| Example | What it teaches |
|---|---|
| First steps | A sequence of commands |
| Square | The "repeat" loop |
| Traffic light | Lights and pauses |
| Smart brake | The distance sensor and "wait until" |
| Explorer | "if … else" inside "forever", two sensors |
| Careful driver | The "when distance <" event |
| Follow the line | Two sensors look at the floor, "if … else" inside "if … else" |
| Along the line edge | One **Down** sensor and a zigzag along the edge |
| Counting obstacles | A variable and the "say" caption |
| Tilt me | The "when tilted" event: lights show where the robot is tilted |

An example replaces the blocks on the canvas. If the canvas has an unsaved program, Gearbit asks first; the previous program stays in the [history](history.md).

## Tilt

The robot has a gyroscope: it feels that the robot is tilted. "forward" — the nose is down, "backward" — the nose is up, "left" and "right" — the robot leans on its side. The robot counts as tilted when the angle is over 15°. "any way" — in any direction.

Only robots with the new firmware have a gyroscope. If there is none, the "tilted ?" block says so. In the emulator the **Tilt** buttons under the room tilt the car: it stays tilted while the button is held.

> Which way a real robot counts as "forward", Gearbit knows from Makerzoid's programs, not from its own measurements. If forward and backward are swapped, tell the developer.

## Saving

- The program on the canvas **is remembered automatically**: close Gearbit, open it again — the blocks are there.
- **Save** writes the program to a `*.gearbit.json` file. You can keep it in your own folder, move it to another computer and show it to friends.
- **Open** loads such a file. **New program** clears the canvas.
- **History** (the clock) keeps earlier versions: before **New program**, an example and **Open**, on run and every 5 minutes of work. This way accidentally deleted blocks can be brought back: [Program history](history.md).

## Tips

- Start with low power (30–50): the robot crashes less.
- If the robot "doesn't see" a wall, check the **Sensors** card on the right: which sensor shows a small number.
- Don't know what a block does — hover over it and wait for the tooltip.
- To delete a block, drag it back to the palette or press Delete.
- Right-click on the canvas: **Clean up Blocks**, undo, redo.
