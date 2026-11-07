# Building, running, tests

[Русский](../../dev/building.md) · **English**

## What you need

- Windows 10 (19041+) or 11.
- .NET SDK 10: the version is pinned in `global.json`, newer feature bands are allowed.
- Node.js 20+ and npm: for the web interface.
- For a real robot — Bluetooth 4.0+. The emulator needs nothing.
- Python 3.9+ — for the Python tab and the `gearbit` package tests. Gearbit works without it, the tab just tells you what to install.

NuGet packages come only from nuget.org (`nuget.config` clears the machine's sources), versions are collected in `Directory.Packages.props` (Central Package Management). Warnings are errors (`TreatWarningsAsErrors` in `Directory.Build.props`).

## The first build

```bash
cd web/studio-ui
npm install
npm run build        # tsc --noEmit + vite build → src/Gearbit.Hub/wwwroot
cd ../..
dotnet build
dotnet test
```

The web interface is built into `src/Gearbit.Hub/wwwroot` (the folder is in `.gitignore`). The block editor (Blockly + scratch-blocks) is a separate chunk of about 2 MB, loaded the first time the Blocks tab opens. The `scratchMedia` plugin from `vite.config.ts` copies the editor's images from `node_modules/scratch-blocks/media` into `wwwroot/scratch-media`. On `dotnet build` the folder is copied into the `bin` of the server and the app as Content. **npm first, then dotnet.** Otherwise `bin` ends up with an old or empty interface.

## Running

| What | Command | Where to look |
|---|---|---|
| The app with a window | `dotnet run --project src/Gearbit.App` | the Gearbit window |
| The hub without a window | `dotnet run --project src/Gearbit.Server` | http://localhost:5280 |
| The interface with hot reload | the hub + `npm run dev` in `web/studio-ui` | http://localhost:5173 |

- The port is changed with a parameter: `--Hub:Port=5300`. For `npm run dev` the hub address comes from the `GEARBIT_HUB` variable, `http://localhost:5280` by default. Vite proxies `/ws` and `/api`.
- The emulator is on by default (`Hub:Emulator`). Turn it off like this: `--Hub:Emulator=false`.
- If Gearbit.exe sees a Gearbit hub already running on the port (checked via `/api/info`), it doesn't start a second one but opens a window to the existing one.
- If the hub is already running and you rebuilt the interface, restart the hub or copy `src/Gearbit.Hub/wwwroot` into `src/Gearbit.Server/bin/Debug/<tfm>/wwwroot`: the server serves the copy from `bin`.

## Tests

```bash
dotnet test
cd web/studio-ui && npm run typecheck
```

`HubTests` start the hub on a free port with the emulator and talk to it over a real WebSocket. Time in the watchdogs and the arbiter goes through `TimeProvider`, so the tests don't sleep.

`ProgramRunnerTests` check running programs with a fake language, without Python. `PythonProgramTests` run real Python and are skipped (with a note in the test output) if Python is not found.

The `gearbit` package is tested separately, against a fake hub:

```bash
cd python
python -m unittest discover -s tests
```

The package files `python/gearbit/*.py` are copied into `bin/…/python/gearbit` as Content of the `Gearbit.Hub` project. If you edit the package while the hub is running, copy them there too or rebuild.

C#: `CSharpScriptTests` check the Russian compile error texts without running, `ClientTests` check `Gearbit.Client` against a hub with the emulator, `CSharpProgramTests` check the whole path `program.run` → ScriptHost → robot. The .NET SDK is not needed to run C# programs: Roslyn sits next to ScriptHost.

ScriptHost is a separate application with its own dependencies (Roslyn), so `Gearbit.Server`, `Gearbit.App` and the tests reference it with `ReferenceOutputAssembly="false"` and import `src/Gearbit.ScriptHost/CopyToHost.targets`. After a build it copies the ScriptHost output into `bin/…/csharp/`, and after `dotnet publish` into the `csharp/` folder of the publish output (without `.pdb`). If ScriptHost isn't built, the build stops with a clear error.

## Icon

`tools/make_icon.py` (needs Pillow) draws `src/Gearbit.App/Assets/gearbit.ico` and `docs/images/logo.png`. `web/studio-ui/public/favicon.svg` is edited by hand in the same style.

```bash
python tools/make_icon.py
```

## Publishing (draft)

```bash
cd web/studio-ui && npm run build && cd ../..
dotnet publish src/Gearbit.App -c Release -r win-x64 --self-contained false
```

You need the .NET Desktop Runtime 10 and the WebView2 Runtime. An installer will come later. Put `LICENSE` and `THIRD-PARTY-NOTICES.md` next to Gearbit.exe.

## Small known things

- In the WPF project implicit `using`s don't include `System.IO`: add `using System.IO;` explicitly.
- Line endings are set in `.gitattributes`: `*.cs`, `*.csproj`, `*.xaml`, `*.props` — CRLF, everything else — LF.
- TypeScript 7 (the native compiler) and Vite 8. The interface has no framework packages.
