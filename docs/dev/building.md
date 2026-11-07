# Сборка, запуск, тесты

**Русский** · [English](../en/dev/building.md)

## Что нужно

- Windows 10 (19041+) или 11.
- .NET SDK 10: версия закреплена в `global.json`, допускаются новые feature-band.
- Node.js 20+ и npm: для веб-интерфейса.
- Для реального робота — Bluetooth 4.0+. Для эмулятора ничего не нужно.
- Python 3.9+ — для вкладки «Python» и тестов пакета `gearbit`. Без него Gearbit работает, вкладка просто подскажет, что поставить.

Пакеты NuGet берутся только с nuget.org (`nuget.config` очищает источники машины), версии собраны в `Directory.Packages.props` (Central Package Management). Предупреждения считаются ошибками (`TreatWarningsAsErrors` в `Directory.Build.props`).

## Первая сборка

```bash
dotnet build
dotnet test
```

`dotnet build` собирает и веб-интерфейс: цель `GearbitBuildStudioUi` в `src/Gearbit.Hub/Gearbit.Hub.csproj` запускает в `web/studio-ui` `npm ci` (если нет `node_modules`) и `npm run build` (`tsc --noEmit` + `vite build`). Она работает, только если `wwwroot/index.html` нет или исходники интерфейса (`src`, `public`, `*.json`, `*.ts`, `index.html`) новее него, поэтому обычная пересборка .NET интерфейс не трогает.

- Нет npm — сборка идёт дальше с предупреждением `GEARBIT001`, а хаб вместо интерфейса показывает страницу «интерфейса нет» с командами ниже.
- Отключить: `dotnet build -p:GearbitBuildUi=false`.
- Собрать интерфейс отдельно:

```bash
cd web/studio-ui
npm install
npm run build        # tsc --noEmit + vite build → src/Gearbit.Hub/wwwroot
```

Веб-интерфейс собирается в `src/Gearbit.Hub/wwwroot` (папка в `.gitignore`). Редактор блоков (Blockly + scratch-blocks) — отдельный чанк около 2 МБ, он грузится при первом открытии вкладки «Блоки». Картинки редактора плагин `scratchMedia` из `vite.config.ts` копирует из `node_modules/scratch-blocks/media` в `wwwroot/scratch-media`. При `dotnet build` она копируется в `bin` сервера и приложения как Content.

## Запуск

| Что | Команда | Где смотреть |
|---|---|---|
| Приложение с окном | `dotnet run --project src/Gearbit.App` | окно Gearbit |
| Хаб без окна | `dotnet run --project src/Gearbit.Server` | http://localhost:5280 |
| Интерфейс с горячей перезагрузкой | хаб + `npm run dev` в `web/studio-ui` | http://localhost:5173 |

- Порт меняется параметром: `--Hub:Port=5300`. Для `npm run dev` адрес хаба берётся из переменной `GEARBIT_HUB`, по умолчанию `http://localhost:5280`. Vite проксирует `/ws` и `/api`.
- Эмулятор включён по умолчанию (`Hub:Emulator`). Выключается так: `--Hub:Emulator=false`.
- Если Gearbit.exe видит на порту уже работающий хаб Gearbit (проверка `/api/info`), он не запускает второй, а открывает окно к существующему.
- Если хаб уже запущен и вы пересобрали интерфейс, перезапустите хаб или скопируйте `src/Gearbit.Hub/wwwroot` в `src/Gearbit.Server/bin/Debug/<tfm>/wwwroot`: сервер раздаёт копию из `bin`.

## Тесты

```bash
dotnet test
cd web/studio-ui && npm run typecheck
```

`HubTests` поднимают хаб на свободном порту с эмулятором и ходят в него через настоящий WebSocket. Время в стражах и арбитре идёт через `TimeProvider`, так что тесты не спят.

`ProgramRunnerTests` проверяют запуск программ на поддельном языке, без Python. `PythonProgramTests` запускают настоящий Python и пропускаются (с записью в вывод теста), если Python не найден.

Пакет `gearbit` тестируется отдельно, на поддельном хабе:

```bash
cd python
python -m unittest discover -s tests
```

Файлы пакета `python/gearbit/*.py` копируются в `bin/…/python/gearbit` как Content проекта `Gearbit.Hub`. Если правите пакет при запущенном хабе, скопируйте их туда же или пересоберите.

C#: `CSharpScriptTests` проверяют русские тексты ошибок компиляции без запуска, `ClientTests` — `Gearbit.Client` против хаба с эмулятором, `CSharpProgramTests` — весь путь `program.run` → ScriptHost → робот. .NET SDK для запуска C#-программ не нужен: Roslyn лежит рядом с ScriptHost.

ScriptHost — отдельное приложение со своими зависимостями (Roslyn), поэтому `Gearbit.Server`, `Gearbit.App` и тесты ссылаются на него с `ReferenceOutputAssembly="false"` и подключают `src/Gearbit.ScriptHost/CopyToHost.targets`. После сборки он копирует вывод ScriptHost в `bin/…/csharp/` (при сборке с `-r win-x64` — из подпапки RID), а `dotnet publish` публикует ScriptHost в `csharp/` папки публикации, см. «Публикация». Если ScriptHost не собран, сборка останавливается с понятной ошибкой.

## Иконка

`tools/make_icon.py` (нужен Pillow) рисует `src/Gearbit.App/Assets/gearbit.ico` и `docs/images/logo.png`. `web/studio-ui/public/favicon.svg` правится вручную в том же стиле.

```bash
python tools/make_icon.py
```

## Публикация

Автономная сборка — та же, что выходит в релизе:

```bash
dotnet publish src/Gearbit.App -c Release -r win-x64 --self-contained true -o publish/Gearbit
```

Среда .NET лежит в папке рядом с Gearbit.exe, ставить ничего не нужно. Папка занимает около 290 МБ, в zip — около 120 МБ. ScriptHost публикуется сам в `csharp/` с теми же RID и `SelfContained` (цель `PublishGearbitScriptHost` в `CopyToHost.targets`). У него своя копия среды .NET, иначе C#-программы не запустятся на компьютере без .NET.

Сборка поменьше, около 42 МБ, — без среды .NET. На компьютере должны стоять .NET Desktop Runtime 10 и ASP.NET Core Runtime 10:

```bash
dotnet publish src/Gearbit.App -c Release -r win-x64 --self-contained false -o publish/Gearbit
```

- WebView2 Runtime нужен в обоих случаях. В Windows 11 он уже есть, в Windows 10 окно Gearbit предложит его поставить.
- Рядом с Gearbit.exe положите `LICENSE` и `THIRD-PARTY-NOTICES.md`. Релиз кладёт их сам.
- Установщика пока нет: Gearbit запускается из распакованной папки.

## GitHub Actions

Workflow лежат в `.github/workflows` и работают на `windows-latest`.

| Workflow | Когда запускается | Что делает |
|---|---|---|
| `ci.yml`, «Проверка» | push в `master`, pull request, вручную | `dotnet build -c Release` вместе с интерфейсом, `dotnet test`, тесты пакета `gearbit` на Python 3.9 и 3.13 |
| `release.yml`, «Релиз» | тег `v*`, вручную | те же проверки, автономная публикация, zip и `.sha256`, релиз на GitHub |

- Если поменялись только `docs/` и `*.md`, «Проверка» не запускается.
- Упали тесты — результаты в формате trx лежат в артефакте запуска `test-results`.
- Ручной запуск «Релиза» (Actions → «Релиз» → Run workflow) собирает архив `Gearbit-<версия>-dev.<номер>-win-x64.zip` в артефакты запуска и релиз не создаёт. Так можно проверить сборку до тега.

### Как выпустить версию

1. Поднимите `<Version>` в `Directory.Build.props`, например до `0.2.0`, и закоммитьте.
2. Поставьте на этот коммит тег и отправьте его:

```bash
git tag v0.2.0
git push origin v0.2.0
```

3. «Релиз» проверит, что тег совпадает с `<Version>`. Если нет, он остановится с ошибкой.
4. Потом он соберёт и проверит Gearbit, опубликует его и создаст релиз «Gearbit 0.2.0» с файлами `Gearbit-0.2.0-win-x64.zip` и `.zip.sha256`. В описании релиза — как установить (на двух языках) и список коммитов с прошлого тега.
5. Версия с дефисом, например тег `v0.2.0-beta.1`, выходит как pre-release.

Тег сразу публикует релиз для всех. Если сборка упала, удалите тег (`git push origin :v0.2.0`), исправьте ошибку и поставьте тег заново.

## Известные мелочи

- В проекте WPF неявные `using` не включают `System.IO`: добавляйте `using System.IO;` явно.
- Окончания строк заданы в `.gitattributes`: `*.cs`, `*.csproj`, `*.xaml`, `*.props`, `*.slnx` — CRLF, остальное, включая `*.yml`, — LF.
- TypeScript 7 (нативный компилятор) и Vite 8. Пакетов-фреймворков в интерфейсе нет.
