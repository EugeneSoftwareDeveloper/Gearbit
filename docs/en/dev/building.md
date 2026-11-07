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
dotnet build
dotnet test
```

`dotnet build` builds the web interface too: the `GearbitBuildStudioUi` target in `src/Gearbit.Hub/Gearbit.Hub.csproj` runs `npm ci` (if there is no `node_modules`) and `npm run build` (`tsc --noEmit` + `vite build`) in `web/studio-ui`. It runs only if there is no `wwwroot/index.html` or the interface sources (`src`, `public`, `*.json`, `*.ts`, `index.html`) are newer than it, so a regular .NET rebuild leaves the interface alone.

- No npm — the build goes on with the `GEARBIT001` warning, and the hub shows a "there is no interface" page with the commands below instead of the interface.
- To turn it off: `dotnet build -p:GearbitBuildUi=false`.
- To build the interface separately:

```bash
cd web/studio-ui
npm install
npm run build        # tsc --noEmit + vite build → src/Gearbit.Hub/wwwroot
```

The web interface is built into `src/Gearbit.Hub/wwwroot` (the folder is in `.gitignore`). The block editor (Blockly + scratch-blocks) is a separate chunk of about 2 MB, loaded the first time the Blocks tab opens. The `scratchMedia` plugin from `vite.config.ts` copies the editor's images from `node_modules/scratch-blocks/media` into `wwwroot/scratch-media`. On `dotnet build` the folder is copied into the `bin` of the server and the app as Content.

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

ScriptHost is a separate application with its own dependencies (Roslyn), so `Gearbit.Server`, `Gearbit.App` and the tests reference it with `ReferenceOutputAssembly="false"` and import `src/Gearbit.ScriptHost/CopyToHost.targets`. After a build it copies the ScriptHost output into `bin/…/csharp/` (when building with `-r win-x64`, from the RID subfolder), and `dotnet publish` publishes ScriptHost into the `csharp/` folder of the publish output, see Publishing. If ScriptHost isn't built, the build stops with a clear error.

## Icon

`tools/make_icon.py` (needs Pillow) draws `src/Gearbit.App/Assets/gearbit.ico` and `docs/images/logo.png`. `web/studio-ui/public/favicon.svg` is edited by hand in the same style.

```bash
python tools/make_icon.py
```

## Publishing

A self-contained build is the same one that goes into a release:

```bash
dotnet publish src/Gearbit.App -c Release -r win-x64 --self-contained true -o publish/Gearbit
```

The .NET runtime sits in the folder next to Gearbit.exe, so nothing needs installing. The folder takes about 290 MB, about 120 MB as a zip. ScriptHost is published by itself into `csharp/` with the same RID and `SelfContained` (the `PublishGearbitScriptHost` target in `CopyToHost.targets`). It has its own copy of the .NET runtime, otherwise C# programs won't run on a computer without .NET.

A smaller build, about 42 MB, comes without the .NET runtime. The computer must have the .NET Desktop Runtime 10 and the ASP.NET Core Runtime 10:

```bash
dotnet publish src/Gearbit.App -c Release -r win-x64 --self-contained false -o publish/Gearbit
```

- The WebView2 Runtime is needed in both cases. Windows 11 already has it; on Windows 10 the Gearbit window offers to install it.
- Put `LICENSE` and `THIRD-PARTY-NOTICES.md` next to Gearbit.exe. A release adds them by itself.
- There is no installer yet: Gearbit runs from the unzipped folder.

## GitHub Actions

The workflows live in `.github/workflows` and run on `windows-latest`.

| Workflow | When it runs | What it does |
|---|---|---|
| `ci.yml`, «Проверка» (Check) | a push to `master`, a pull request, by hand | `dotnet build -c Release` together with the interface, `dotnet test`, the `gearbit` package tests on Python 3.9 and 3.13 |
| `release.yml`, «Релиз» (Release) | a `v*` tag, by hand | the same checks, a self-contained publish, a zip and a `.sha256`, a release on GitHub |

- If only `docs/` and `*.md` changed, the check doesn't run.
- If tests fail, the trx results are in the `test-results` artifact of the run.
- Running the release by hand (Actions → «Релиз» → Run workflow) builds `Gearbit-<version>-dev.<number>-win-x64.zip` into the run artifacts and creates no release. This way you can try the build before tagging.

### How to release a version

1. Raise `<Version>` in `Directory.Build.props`, for example to `0.2.0`, and commit.
2. Put a tag on that commit and push it:

```bash
git tag v0.2.0
git push origin v0.2.0
```

3. The release workflow checks that the tag matches `<Version>`. If it doesn't, it stops with an error.
4. Then it builds and tests Gearbit, publishes it and creates the release "Gearbit 0.2.0" with `Gearbit-0.2.0-win-x64.zip` and `.zip.sha256`. The release description says how to install (in two languages) and lists the commits since the previous tag.
5. A version with a hyphen, for example the tag `v0.2.0-beta.1`, comes out as a pre-release.

A tag publishes the release to everyone right away. If the build fails, delete the tag (`git push origin :v0.2.0`), fix the problem and tag again.

## Small known things

- In the WPF project implicit `using`s don't include `System.IO`: add `using System.IO;` explicitly.
- Line endings are set in `.gitattributes`: `*.cs`, `*.csproj`, `*.xaml`, `*.props`, `*.slnx` — CRLF, everything else, including `*.yml`, — LF.
- TypeScript 7 (the native compiler) and Vite 8. The interface has no framework packages.
