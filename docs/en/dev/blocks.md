# Block editor

[Русский](../../dev/blocks.md) · **English**

The «Блоки» (Blocks) tab is Scratch-style programming right inside `web/studio-ui`. The word "Scratch" is not used in the interface (it's a trademark); in code and docs it's fine.

## Why not TurboWarp

The plan had an embedded TurboWarp scratch-gui. It was done more simply:

- **scratch-blocks 2.1.37** (Apache-2.0, Blockly 12 inside) — only the block editor, without the stage, sprites and the Scratch VM;
- **our own interpreter** (`blocks/runtime.ts`) runs the blocks straight from the workspace;
- the robot is a regular hub client, like the remote: the same `drive.tank`, `motor.setPower`, `light.setColor`, but with `source: "program"`.

What it gave: no GPL dependency (TurboWarp is GPL-3.0), no iframe and no separate extension protocol, the theme and tokens are shared with the rest of the interface, all the stop logic is visible in one file. What's missing: a stage with sprites, sounds, the `.sb3` format. If they're needed, go back to the option from the plan.

## Files in `src/blocks/`

| File | What |
|---|---|
| `view.ts` | The whole tab: the toolbar, `SB.inject`, the right column (stage, variables, sensors), examples, saving. Exports `mountBlocksView(root): BlocksView`. |
| `runtime.ts` | The interpreter: threads, events, evaluating values, commands to the hub, stop rules. |
| `robot-blocks.ts` | Robot block definitions (Blockly JSON) and menu constants. |
| `toolbox.ts` | The palette: categories and their blocks, the dynamic «Переменные» (Variables) category. |
| `theme.ts` | The Blockly theme from the `--block-*` tokens. |
| `examples.ts` | Example programs (Scratch XML). |

`main.ts` loads `blocks/view` with a dynamic `import()` the first time the tab opens: Blockly + scratch-blocks is a separate chunk of about 2 MB, and the remote doesn't get heavier because of it.

**The stage is shared.** The «Робот» (Robot) card (the emulator room or the radar) is one for the whole interface: `createRemoteView` returns it as `stage`, and `setMode` moves the element into `BlocksView.stageSlot` and back. The canvas is not recreated.

## The interpreter

- Every script ("when flag clicked", an event, a script run by click) is a separate thread, an `async` function. Loops yield every `TICK_MS` (20 ms), "wait" uses an interruptible `sleep`.
- Sensor events (`SENSOR_HATS`: "when distance < N", "when tilted …") are polled every `HAT_POLL_MS` (50 ms) and fire on the edge: the condition was false and became true. While an event's thread is running, it isn't started again. Each event's condition is in `hatCondition()`; add a new sensor event to `SENSOR_HATS` and there.
- Sensors are read from `store.state.telemetry` (the hub sends it 10 times a second). No robot — distance `6`, "nothing in sight".
- The same value is not sent to the hub twice (the `drive`, `motors`, `lights` caches).
- A sensor in a block is a place (`front`, `right`, `left`, `back`) or a port (`D1`). The place is looked up with `sensorPlace` from `model.ts`: it takes into account where the user moved the sensor in the Sensors card.
- "sensor … sees the black line?" (`robot_on_line`) takes places from `LINE_SENSORS` (`down`, `down_left`, `down_right`, `D1`, `D2`) and decides with `seesLine(component, level)`: level ≥ the component's `lineLevel`. No robot — `false`.
- "tilted … ?" (`robot_tilted`) and "when tilted …" (`robot_when_tilted`) decide with `isTilted(tilt, direction)` from `model.ts`: the `TILT_LEVEL` threshold is 15°, like `TILT_THRESHOLD` in BlocosLab; `y` above 0 — forward, `x` above 0 — right. No robot or no tilt data — `false`. The firmware is known but there is no `imu` component (`lacksTilt`) — `ProgramError`.
- An error (no robot, no such sensor in the build, `ControlBusy`) is a `ProgramError` with the block id. The tab shows the message, centers and highlights the block.
- Variable values live in `runtime.variables` by id and persist between runs, as in Scratch.

### Stopping (don't break)

| What happened | What the interpreter does |
|---|---|
| STOP in the header, Space/Esc, `safety.event`, connection loss | `onStop` → `halt()`: threads stop at once. The hub has already stopped the motors. If a motion command was still on its way to the hub (or left < 300 ms ago), `halt()` repeats `robot.stop`. |
| The «Стоп» (Stop) button on the blocks toolbar | `emergencyStop()` — the same as STOP in the header. |
| Leaving the tab, `visibilitychange: hidden`, loading another program | `stop()`: threads stop, its own motors are turned off with regular `drive.stop` / `motor.setPower 0`, control is released. |
| The program reached its end | If motors are on — turn them off and show a hint. `control.release`. If there are "when …" events, the program doesn't end by itself. |

Program commands are not under the hub watchdog (600 ms): that's the normal behavior of `source:"program"`. That's why any new way to leave the tab must call `stop()` or `halt()`.

## Adding a block

1. **Definition** — in `robot-blocks.ts` via `define(type, json)`. Color and shape are Scratch extensions: `colours_motion|looks|event|control|sensing|operators|data`, `shape_statement|shape_hat|output_number|output_boolean|output_string`.
2. **Palette** — `toolbox.ts`: `block(type, inputs, fields)`, default values are shadow blocks `num()` / `text()`.
3. **Execution** — `runtime.ts`: a command in `exec()`, a value in `evaluate()`. An unknown block gives a "doesn't work in Gearbit yet" error instead of being silently skipped.
4. **A robot command** — only through `this.command(...)`: it adds `source:"program"`, checks the connection and tracks commands "in flight" for `halt()`.
5. If the block is needed in examples — `examples.ts`.

Block menus are static: Blockly drops a saved value that isn't in the menu, and a program must open the same way with and without a robot. A sensor that's not in the build gives a clear error at run time.

## scratch-blocks subtleties

- `ScratchMsgs.setLocale("ru")` — **before** creating blocks. Missing strings are added to `SB.Msg` in `setupScratchBlocks()`.
- The palette is continuous (`ContinuousToolbox`), it builds all categories at once. A custom category handler (`registerToolboxCategoryCallback`) must be registered before the first render. That's why `inject` goes with a palette without «Переменные», then the registration, then `updateToolbox`.
- `ContinuousToolbox.refreshSelection()` is empty: after creating, deleting and renaming a variable the palette is redrawn by `toolbox.forceRerender()` (via `requestAnimationFrame`).
- The checkbox next to a variable in the palette is the `checkbox` icon from the `monitor_block` extension. Its state comes from `CheckboxBubble.prototype.isChecked`, in our case — the `monitors` set. The "timer" has no checkbox: only variables have a monitor.
- Blockly dialogs (`prompt`, `alert`, `confirm`) are replaced with our own (`ui/ask-dialog.ts`).
- `SB.svgResize` must not be called while the tab is hidden (size 0): the workspace would slide under the palette. The `ResizeObserver` in `view.ts` checks this.
- The console warnings "Unable to find [category][flyoutinflater]" and about the deprecated `getVariablesOfType` come from scratch-blocks and are harmless.

## Theme

- Block colors are the `--block-<category>`, `-2`, `-3` tokens in `tokens.css`; `theme.ts` builds the Blockly theme from them. When the app theme changes, `workspace.setTheme(buildTheme())` is called.
- scratch-blocks sets the background of the workspace, palette and menus with `--colour-*` CSS variables. They are overridden in `app.css` under `:root[data-theme]` (a stronger selector than scratch-blocks' `:root`). `--colour-text` is left alone: it's the white text on colored blocks.
- The editor's images (flag, arrows, zoom buttons) are in `node_modules/scratch-blocks/media`. The `scratchMedia` plugin in `vite.config.ts` serves them as `scratch-media/` both in `npm run dev` and in the build.

## Storage

| Where | What |
|---|---|
| `localStorage["gearbit.blocks"]` | The current program: `{format, version, workspace, monitors, pristine}`. Written with a delay after every change. `pristine: true` — the program hasn't changed since it was loaded or saved, so opening an example needs no confirmation. |
| A `*.gearbit.json` file | `{format: "gearbit-blocks", version: 1, workspace, monitors}`. `workspace` is `Blockly.serialization.workspaces.save`. Saving and opening use the File System Access API; without it, a download and `<input type=file>`. |

## Checking

Emulator, Blocks tab:

1. Every example starts and stops: with the «Стоп» button, STOP in the header, Space, switching to «Пульт» (Remote).
2. After stopping, the robot stands still, the block glow is off, the «Программа работает» (Program running) badge changed to «Готово к запуску» (Ready to run).
3. Without a robot, «Запустить» (Run) shows an error and highlights the block.
4. Creating, renaming and deleting a variable; the checkbox and the monitor on the right.
5. Light and dark theme, window width 1024 px.
