# Interface and themes

[Русский](../../dev/ui-and-themes.md) · **English**

The web interface is `web/studio-ui`: TypeScript without a framework + Vite. The same interface is shown in the Gearbit.exe window (WebView2) and in a regular browser.

## Layout of `src/`

| File | What |
|---|---|
| `main.ts` | Builds the screen, subscribes to hub notifications, keyboard and gamepad, the "no connection to the hub" screen. |
| `hub.ts` | `HubClient`: WebSocket + JSON-RPC, auto-reconnect, `call(method, params)`, `on(notification, listener)`. After every connection it sends `hub.hello` and emits the `hub.connected` event. |
| `model.ts` | Hub response types (`RobotInfo`, `Telemetry`, `EmulatorState`…) and the shared `store`. `displayName`, sensor places (`SENSOR_PLACES`, `sensorPlace`, `sensorAngle`, `NO_SENSOR`). |
| `settings.ts` | Theme, color, large text, speed, control view, sensor places per build (`sensorPlaces`: `"device/build" → {D1: "front" \| … \| "none"}`). Stored in `localStorage` (`gearbit.settings`). |
| `trace.ts` | A shared protocol log subscription (`listenTrace`): the log, the measurement helper and the recording listen to one hub subscription. |
| `icons.ts` | Built-in SVG icons (`currentColor`), including the logo. |
| `input/drive.ts` | Mixes buttons, joystick and gamepad into `drive.arcade`. While there is input, the command repeats every 100 ms; after release — `drive.stop` right away. |
| `input/keyboard-gamepad.ts` | Keys and the Gamepad API. |
| `ui/topbar.ts` | The header: modes, the robot badge, buttons, STOP. |
| `ui/remote-view.ts` | The remote: the control, stage, sensors, lights and motors cards. The Blocks tab takes the stage card (`stage`) for itself. A sensor's name is a place `<select>`; for the emulator places go to `emulator.setSensorAngles`. |
| `ui/room-view.ts` | The emulator room canvas: the car, rays, trail, drawing obstacles, the «Комната» / «Линия» (Room / Line) scene switch, "down" sensors as squares, the «Наклонить» (Tilt) buttons (`emulator.setTilt`, only while held; reset on release, `blur`, `visibilitychange`). |
| `ui/connect-dialog.ts` | Search and connection. |
| `ui/settings-popover.ts`, `help-dialog.ts`, `trace-panel.ts`, `toasts.ts` | Settings, help (F1), the protocol log (with the «Замеры» button), toasts. |
| `ui/files.ts` | `saveTextFile`, `saveJsonFile`, `openFile`, `openTextFile`: the File System Access API with a link-based fallback. The file type is `FileKind {description, suffix, mime?}`. |
| `ui/mini-sensors.ts`, `ui/examples-dialog.ts` | The Sensors card and the Examples dialog shared by the program tabs. |
| `measure/*` | The stage 0 measurement helper: `helper.ts` (the window, the «Кадры» and «Запись» tabs, `MeasureContext`), `power-test.ts`, `calibration.ts` (the «Датчики» (Sensors) tab) and `calibration-math.ts` (computing `levelToCm` and `lineLevel` without DOM: the "no obstacle" level means "doesn't see", the samples table can have holes), `recorder.ts` (the [docs/captures](../../captures/README.en.md) format), `frames.ts` (TUDAO frames). Frames go through the hub's `service.*`. |
| `ui/ask-dialog.ts` | `askText`, `askConfirm`, `showAlert` — our own dialogs instead of `prompt`/`confirm`/`alert`. |
| `blocks/*` | The block editor, lazy-loaded. See [Block editor](blocks.md). |
| `code/*` | Program text tabs, lazy-loaded. `editor.ts` — CodeMirror 6 (theme from tokens, error line highlight, completions, Esc = STOP), `view.ts` — the shared screen (`mountCodeView(root, spec)`: toolbar, output, «Команды», running via `program.run`), `python.ts` and `csharp.ts` — language descriptions (`CodeLanguageSpec`): examples, commands, completions. C# is highlighted by the legacy `clike` mode (`StreamLanguage`): nodes there are named after the token style (`comment`, `string`). In a multi-line command the `§` mark (`CURSOR_MARK`) is where to leave the cursor after inserting; the card shows only the command's first line. |
| `ui/dom.ts` | `h(tag, attrs, ...children)` — a small helper for creating elements, `icon(svg)`, `cssVar(name)`. |
| `styles/tokens.css` | Design tokens and themes. |
| `styles/app.css` | Layout and components. |

## Themes

The theme is set with attributes on `<html>`:

- `data-theme="light" | "dark"`. The "Auto" mode follows `prefers-color-scheme` and sets one of the two values.
- `data-accent="ocean" | "forest" | "sunset" | "cosmos" | "candy"`.
- `data-large="true"`: large text.

Components use **only variables**, no colors in code:

| Group | Variables |
|---|---|
| Surfaces | `--bg`, `--bg-grad`, `--surface`, `--border`, `--overlay`, `--grid` |
| Text | `--text`, `--text-muted` |
| Accent | `--accent`, `--accent-2`, `--accent-soft`, `--accent-contrast` |
| States | `--ok`, `--warn`, `--danger`, `--danger-strong` |
| LEDs | `--led-off`, `--led-red` … `--led-white` |
| The "Line" floor | `--paper` (the white sheet), `--paper-line` (the black line), `--paper-grid` (the grid on the sheet): the «Линия» scene in the emulator room, "down" sensor squares on the radar and the black/white bars in the Sensors card. In the dark theme the sheet is slightly dimmed so it doesn't dazzle. |
| Blocks | `--block-<category>`, `-2`, `-3` (`motion`, `looks`, `event`, `control`, `sensing`, `operators`, `data`, `more`), `--block-field`, `--block-field-text`, `--block-glow` |
| Code | `--code-keyword`, `-string`, `-number`, `-comment`, `-function`, `-builtin`, `-type`, `-operator` (highlighting, separate for each theme), `--code-selection`, `--code-active-line`, `--code-error-line` (from the accent and `--danger`) |
| Shape | `--radius-sm`, `--radius`, `--radius-lg`, `--gap`, `--shadow`, `--shadow-lg`, `--header-h` |
| Fonts and animation | `--font`, `--font-display`, `--font-mono`, `--ease`, `--fast`, `--normal` |

**A new color scheme:** add `:root[data-accent="…"] { --accent; --accent-2 }` to `tokens.css` (a dark variant if needed), then an item in `ACCENTS` in `settings.ts`. Check the contrast of text on `--accent` in both themes.

**The block editor** takes block colors from `--block-*` (the Blockly theme in `blocks/theme.ts` is rebuilt when the theme changes), and the workspace, palette and menu backgrounds from the scratch-blocks `--colour-*` variables overridden in `app.css`.

**The code editor** (CodeMirror) takes colors from `EditorView.theme` and `HighlightStyle` in `code/editor.ts`, which contain only `var(--…)`. So the theme changes without recreating the editor. Font ligatures are off: otherwise `<=` in Cascadia Code looks like `≤`, and a child won't know what to type.

**The canvas** (the emulator room) doesn't see CSS directly: colors are taken via `cssVar()` on every redraw. So a theme change is picked up right away.

**The WPF window**: after applying the theme, `settings.ts` sends the host `{type:"theme", theme}` via `window.chrome.webview.postMessage`. `MainWindow` paints the window title bar (`DwmSetWindowAttribute`, the Windows dark title bar) and the background under WebView2, so there is no white flash.

## Program tabs

«Блоки», «Python» and «C#» are built the same way and share layout classes: `section.view.program-view.<mode>-view`, with `.program-toolbar` and `.program-body` with the `.program-side` column inside. The remote's stage card (`.program-stage`) moves into the column of whichever tab is open.

In `main.ts` such tabs are created by `lazyView(mode, title, loading, load)`: the module loads on first open, and then `setMode` calls the view's `activate()` and `deactivate()`. The view implements `ProgramView {stageSlot, activate, deactivate}`, and `deactivate` must stop the program (invariant 5).

A new text language is a `CodeLanguageSpec` description (as in `code/python.ts`) and a line in `programs` in `main.ts`. The hub needs its own `IProgramLanguage` ([Hub API](hub-api.md#programs-python-c)).

## Interface rules

- **Texts are in Russian, short, for a child aged 7–12.** Errors explain what to do: «Закройте приложение Apitor на телефоне» (Close the Apitor app on the phone).
- **STOP is always visible** and works from the keyboard (Space, Esc) and the gamepad.
- **Movement only while held.** A new input method must reset: on release, on window focus loss (`blur`, `visibilitychange`), on `safety.event`.
- **Sizes for mouse and finger**: buttons at least 40 px tall, the d-pad grows up to 300 px.
- **Narrow windows**: the header hides secondary items at widths ≤ 1320 / 1100 / 900 px, the card grid rearranges. Check a width of 1024 px.
- **Accessibility**: icon buttons have `aria-label` and `title`, decorative SVGs have `aria-hidden="true"`, focus is visible.
- **No external resources**: system fonts, built-in icons. The interface works without the internet.

## Checking changes

```bash
cd web/studio-ui
npm run typecheck
npm run build
```

Then start the hub (`dotnet run --project src/Gearbit.Server`), connect the emulator and check both themes and a narrow window. For fast iteration `npm run dev` (http://localhost:5173) with a running hub is handier.
