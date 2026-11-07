# Blocks: a program for the robot

[Русский](../../user/blocks.md) · **English**

On the **«Блоки»** (Blocks) tab a child builds a program from colored blocks, like in Scratch, and the robot runs it on its own. Good for children from 7. Little reading is needed: each block is a short phrase («ехать вперёд мощность 50» — drive forward power 50).

> The blocks are in Russian. Below, block names are given as they appear on screen, with a translation.

## Screen

| Where | What |
|---|---|
| Left | **Palette**: categories and blocks. Drag a block with the mouse onto the canvas. |
| Center | **Canvas**: the program is built here. The mouse wheel scrolls the canvas, the «+» and «−» buttons in the corner zoom, «=» returns to normal size. |
| Right | The robot (emulator room or radar), **«Переменные»** (Variables) and **«Датчики»** (Sensors). |
| Top | **«Запустить»** (Run), **«Стоп»** (Stop), the program state, **«Примеры»** (Examples), **«Новая»** (New), **«Открыть»** (Open), **«Сохранить»** (Save). |

## The first program

1. Connect the robot or the emulator (the «Нет робота» — No robot — badge at the top).
2. Click **«Примеры»** (Examples) and pick **«Первые шаги»** (First steps).
3. Click the green **«Запустить»** (Run) button with the flag.
4. The robot drives forward, turns and comes back. While the program runs, its blocks glow and the Run button pulses.

A program starts with the **«когда флажок нажат»** (when flag clicked) block from «События» (Events). Blocks not attached to it don't run. If there is no such block, Gearbit tells you to add it.

Clicking a separate stack of blocks runs only that stack. Clicking again stops it. Clicking a round block (for example, «расстояние впереди» — distance front) shows its value right now.

## Categories

| Category | Blocks |
|---|---|
| **«События»** (Events) | «когда флажок нажат» (when flag clicked); «когда расстояние … < 2» (when distance … < 2) — fires when an obstacle comes closer; «когда наклонён [вперёд]» (when tilted [forward]) — when the robot is tilted that way. |
| **«Движение»** (Motion) | Drive forward or backward; turn on the spot; drive for a given time; drive with different wheel power (smooth turn); spin one motor; stop. |
| **«Огоньки»** (Lights) | LED color; lights off; «сказать» (say) — a caption above the robot on the screen. |
| **«Управление»** (Control) | wait, repeat, forever, if, if … else, wait until, repeat until, stop. |
| **«Датчики»** (Sensors) | Distance (0 — touching, 6 — far) front, right, left, back or by sensor number (D1, D2); «препятствие?» (obstacle? — yes if the distance is less than 2); «датчик [вниз слева] видит чёрную линию?» (sensor [down left] sees the black line?) — for [line following](line-following.md); «наклонён [вперёд] ?» (tilted [forward]? — yes if the robot is tilted that way by more than 15°) and the tilt in degrees; battery level; timer. «Впереди» (front) is the sensor that the «Датчики» card on the Remote tab places at the front. |
| **«Операторы»** (Operators) | Arithmetic, comparisons, and, or, not, random number, join text. |
| **«Переменные»** (Variables) | Create a variable, set and change its value. |

**Power** in blocks goes from 0 to 100 (in «ехать: левое колесо … правое …» — drive: left wheel … right … — and «мотор» — motor — it can be negative, which means backward). The power limit from the settings applies here too: with a 60 % limit, «мощность 100» (power 100) gives 60 %. The Speed slider on the remote doesn't affect programs.

## How to stop

- **«Стоп»** (Stop) on the blocks toolbar stops the program and the robot.
- **STOP** in the header, **Space** or **Esc** work as always: they stop both the program and the robot.
- The program also stops by itself when:
  - you switch to another tab («Пульт», «Python», «C#») or minimize the window;
  - the connection to the robot is lost;
  - there is an error in the program — Gearbit shows a message and highlights the block where it happened.
- **The program ended while the robot was moving** — Gearbit stops it and suggests how to drive longer: add «ждать» (wait) or «повторять всегда» (forever).
- If the program has a «когда расстояние < …» or «когда наклонён …» event, it doesn't end by itself: the robot waits for an obstacle or a tilt until you click «Стоп».

On the Blocks tab the W A S D keys and the gamepad stick don't move the robot: only the program controls it. Space, Esc and **B / ○ / Start** on the gamepad are still STOP.

## Variables

1. Open the **«Переменные»** (Variables) category and click **«Создать переменную»** (Make a variable).
2. Think of a name, for example «счёт» (score).
3. Tick the checkbox next to the variable in the palette. Its value appears on the right, in the Variables card, and changes while the program runs.

An example with a variable — **«Считаем препятствия»** (Counting obstacles).

## Examples

| Example | What it teaches |
|---|---|
| «Первые шаги» (First steps) | A sequence of commands |
| «Квадрат» (Square) | The «повторить» (repeat) loop |
| «Светофор» (Traffic light) | Lights and pauses |
| «Умный тормоз» (Smart brake) | The distance sensor and «ждать до» (wait until) |
| «Исследователь» (Explorer) | «если … иначе» (if … else) inside «повторять всегда» (forever), two sensors |
| «Осторожный водитель» (Careful driver) | The «когда расстояние <» (when distance <) event |
| «По линии» (Along the line) | Two sensors look at the floor, «если … иначе» inside «если … иначе» |
| «По краю линии» (Along the line edge) | One «Вниз» (Down) sensor and a zigzag along the edge |
| «Считаем препятствия» (Counting obstacles) | A variable and the «сказать» (say) caption |
| «Наклони меня» (Tilt me) | The «когда наклонён» (when tilted) event: lights show where the robot is tilted |

An example replaces the blocks on the canvas. If the canvas has an unsaved program, Gearbit asks first.

## Tilt

The robot has a gyroscope: it feels that the robot is tilted. «вперёд» (forward) — the nose is down, «назад» (backward) — the nose is up, «влево» and «вправо» (left and right) — the robot leans on its side. The robot counts as tilted when the angle is over 15°. «куда-нибудь» (anywhere) — in any direction.

Only robots with the new firmware have a gyroscope. If there is none, the «наклонён?» block says so. In the emulator the **«Наклонить»** (Tilt) buttons under the room tilt the car: it stays tilted while the button is held.

> Which way a real robot counts as "forward", Gearbit knows from Makerzoid's programs, not from its own measurements. If forward and backward are swapped, tell the developer.

## Saving

- The program on the canvas **is remembered automatically**: close Gearbit, open it again — the blocks are there.
- **«Сохранить»** (Save) writes the program to a `*.gearbit.json` file. You can keep it in your own folder, move it to another computer and show it to friends.
- **«Открыть»** (Open) loads such a file. **«Новая»** (New) clears the canvas.

## Tips

- Start with low power (30–50): the robot crashes less.
- If the robot "doesn't see" a wall, check the Sensors card on the right: which sensor shows a small number.
- Don't know what a block does — hover over it and wait for the tooltip.
- To delete a block, drag it back to the palette or press Delete.
- Right-click on the canvas: «Упорядочить блоки» (Clean up blocks), undo, redo.
