# AGENTS.md — инструкции для ИИ-агентов

Gearbit — программа для Windows: пульт и среда программирования (блоки в стиле Scratch / Python / C#) для робота-конструктора Apitor / Makerzoid SuperBot (BLE) с архитектурой под другие роботы. Пользователи — родитель-разработчик и ребёнок. Подробности: [docs/dev/README.md](docs/dev/README.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/PLAN.md](docs/PLAN.md).

## Язык

- Общение, комментарии в коде, основная документация и сообщения коммитов — **на русском**.
- Идентификаторы в коде, имена файлов, JSON-ключи — на английском.
- Тексты для пользователя (интерфейс, ошибки хаба и программ) — **на русском и английском**, короткие и понятные ребёнку 7–12 лет, с подсказкой, что сделать. Как добавить текст — [docs/dev/i18n.md](docs/dev/i18n.md).

## Git

- **Коммиты локальные. `git push`, создание удалённого репозитория и PR — только по явной просьбе.** Целевой репозиторий: github.com/EugeneSoftwareDeveloper/Gearbit.
- Сообщение коммита — по-русски: заголовок до ~72 символов и при необходимости тело.
- **Никогда не добавлять в сообщения коммитов `Co-Authored-By: Claude …` или любые другие подписи и упоминания ИИ.** Сообщение заканчивается содержательным текстом.
- Не удалять файлы и каталоги массово (`rm -rf`) без подтверждения. Для переименования используйте `git mv`.
- Окончания строк заданы в `.gitattributes`: `.cs/.csproj/.xaml/.props/.slnx` — CRLF, остальное — LF.

## Где что

```
src/Gearbit.Core              модель, интерфейсы (IRobot, IRobotProtocol, ITransport), каталог JSON
src/Gearbit.Protocols.Tudao   протокол SuperBot (кадры FF FE … FD FC)
src/Gearbit.Transport.WinRtBle BLE через WinRT
src/Gearbit.Emulator          виртуальный контроллер + 2D-комната (через LoopbackTransport)
src/Gearbit.Hub               хаб: JSON-RPC 2.0 по WebSocket /ws, арбитр, страж, раздача wwwroot
src/Gearbit.Hub/Programs      запуск программ на Python/C# в отдельных процессах (program.*)
src/Gearbit.Hub/UserData      настройки интерфейса и история программ (HTTP /api/settings, /api/history)
src/Gearbit.Server            хаб без окна (консоль)
src/Gearbit.App               Gearbit.exe: WPF + WebView2, хаб в процессе
src/Gearbit.Client            клиент хаба для C#: синхронный Robot, RobotScript (robot, Wait)
src/Gearbit.ScriptHost        запуск C#-скриптов (Roslyn), ошибки по-русски; копируется в bin/…/csharp
tests/Gearbit.Tests           xUnit
web/studio-ui                 интерфейс: TypeScript 7 + Vite 8, без фреймворка
web/studio-ui/src/i18n.ts     язык интерфейса: messages({ru, en}), lang(), text()
web/studio-ui/src/blocks      вкладка «Блоки»: scratch-blocks + свой интерпретатор (runtime.ts)
web/studio-ui/src/code        вкладки «Python» и «C#»: CodeMirror 6, общий экран view.ts
python/gearbit                пакет gearbit для Python (только стандартная библиотека)
web/studio-ui/src/measure     помощник замеров этапа 0: кадры вручную, тест мощности, калибровка, запись
devices/, profiles/           описания роботов и сборок (JSON, копируются рядом с exe)
docs/user, docs/dev           документация для пользователя и разработчика
docs/en                       английская копия документации (та же структура), README.en.md — рядом с README.md
tools/make_icon.py            генерация иконки и логотипа (Pillow)
```

## Команды

```bash
dotnet build                                        # предупреждения = ошибки; собирает и интерфейс, если нужно
cd web/studio-ui && npm install && npm run build   # интерфейс отдельно → src/Gearbit.Hub/wwwroot (gitignored)
dotnet test
cd python && python -m unittest discover -s tests  # пакет gearbit
cd web/studio-ui && npm run typecheck
dotnet run --project src/Gearbit.Server            # http://localhost:5280, эмулятор включён
dotnet run --project src/Gearbit.App               # окно
```

- `dotnet build` сам запускает `npm ci` (если нет `node_modules`) и `npm run build`, когда `src/Gearbit.Hub/wwwroot` нет или исходники в `web/studio-ui` новее (цель `GearbitBuildStudioUi` в `Gearbit.Hub.csproj`). Без npm — предупреждение `GEARBIT001`, а хаб показывает страницу «интерфейса нет». Отключить: `-p:GearbitBuildUi=false`. `wwwroot` копируется в `bin` как Content.
- Сервер раздаёт копию из `bin`. Если интерфейс пересобран при запущенном сервере, скопируйте `src/Gearbit.Hub/wwwroot` в `src/Gearbit.Server/bin/Debug/<tfm>/wwwroot` или перезапустите сервер.
- `.claude/launch.json` содержит конфигурацию `gearbit-server` для превью на порту 5290: так она не конфликтует с запущенным Gearbit.exe на 5280.
- Проверка интерфейса без робота: эмулятор `Nordic_TUDAO (эмулятор)` в диалоге подключения.

## Инварианты безопасности (не ломать)

1. **`robot.stop` разрешён любому клиенту всегда**, в обход арбитра.
2. Каждая команда движения проходит через `ControlArbiter.Authorize` и предел мощности робота (`MaxPowerPercent`).
   Исключение — режим замеров (`ServiceMode`, `service.*`): сырые кадры идут без предела, но только после явного `service.begin`, при этом пульт и программы отклоняются (`ControlBusy`), работает свой страж (`Hub:ServiceWatchdogMs`, 15 с), а отключение владельца или робота заканчивает замеры и останавливает моторы.
3. **Страж**: пульт (`ControllerKind.Remote`) молчит дольше `Hub:RemoteWatchdogMs` (600 мс) — моторы в 0 и `safety.event`.
4. Отключился клиент-владелец — моторы в 0. Потеря связи — `lost` и `safety.event`. Подключение и закрытие хаба — моторы в 0.
5. В интерфейсе движение есть только пока держат ввод. При отпускании, `blur`, `visibilitychange` и `safety.event` ввод сбрасывается.
   Исключение — программа из блоков: она ездит сама, но прерывается при СТОП, `safety.event`, потере связи, уходе с вкладки и `visibilitychange`, а закончившись, выключает свои моторы.
6. Хаб слушает только `localhost` и проверяет `Origin` у браузерных клиентов.

Изменения в этих местах сопровождайте тестом (`HubTests`, `ProtocolRobotTests`; время — через `TimeProvider`).

## Данные протокола и этап 0

- Значения из открытых источников помечены в `devices/*.json` и `profiles/*.json` как `"verified": false` / `"status": "draft"`. **Не ставьте `verified: true` без замера на настоящем роботе**: замеры делает пользователь по [docs/STAGE0-CHECKLIST.md](docs/STAGE0-CHECKLIST.md).
- Диапазон мощности устройства (`protocol.power.deviceMin/Max`) — ±10, замерено на M1 и M2: выше 10 мотор быстрее не крутится, на 1 колесо стоит. API всегда в процентах −100..100.
- Езда по линии — те же датчики `D1`/`D2`, поставленные «вниз» (места `down`, `down_left`, `down_right`): чёрное, если уровень ≥ `lineLevel` (по умолчанию 3, как в BlocosLab). Замер D1: белое 0, чёрное 3–4, в профиле «Машинки» порог 2. Новое место датчика «вниз» добавляйте в `DOWN_PLACES` (`model.ts`), `python/gearbit/_robot.py` и `Gearbit.Client/Robot.cs` одновременно.
- Наклон: робот наклонён, если угол ≥ 15° (`TILT_LEVEL`, как в BlocosLab); `y` больше 0 — вперёд, `x` больше 0 — вправо. Не проверено на роботе. Стороны (`forward`, `backward`, `left`, `right`, `any`) меняйте одновременно в `TILT_DIRECTIONS` (`model.ts`), `python/gearbit/_robot.py` и `Gearbit.Client/Robot.cs`.
- Протокол описан в [docs/PROTOCOL-SUPERBOT.md](docs/PROTOCOL-SUPERBOT.md). Новые находки записывайте туда со ссылкой на источник.
- Замеры удобно делать в самом Gearbit: журнал протокола → «Замеры». Записи сессий (`*.capture.json`) лежат в [docs/captures](docs/captures/README.md).
- Направление моторов «Машинки» проверено на настоящем роботе: инвертирован M1, а не M2, как в ApitorCommander. Эмулятор повторяет это (`EmulatorSettings.LeftMirrored`).

## Код

- .NET 10, C# с file-scoped namespace, `_camelCase` для приватных полей. Пакеты — Central Package Management (`Directory.Packages.props`), только nuget.org (`nuget.config`).
- `TreatWarningsAsErrors`. Подавлять анализаторы точечно и с причиной, а не глобально.
- В WPF-проекте нет неявного `using System.IO`: добавляйте явно. `await` внутри фильтра `catch (…) when` запрещён (CS7094).
- Время — через `TimeProvider`, не `DateTime.Now` и не `Task.Delay` в логике стражей.
- Новый робот — JSON в `devices/` и `profiles/`, названия (`title`) — объектом `{"ru": …, "en": …}`. Новый протокол или транспорт — отдельный проект и интерфейсы из `Gearbit.Core`, см. [docs/dev/adding-a-robot.md](docs/dev/adding-a-robot.md).
- Новый метод хаба: регистрируйте в `HubMethods.Register` с описанием по-русски и добавляйте в [docs/dev/hub-api.md](docs/dev/hub-api.md).
- Тексты хаба для клиента — через `IHubText` (`HubText.cs`, в оба класса): `throw new HubException(code, t => t.…)`, уведомления — `ClientRegistry.BroadcastText`. Журнал и описания методов — по-русски.

## Интерфейс

- Цвета — только CSS-переменные из `styles/tokens.css`. Проверяйте в светлой и тёмной теме и при ширине окна 1024 px.
- Иконки — встроенные SVG в `icons.ts`. Внешних ресурсов (CDN, шрифтов) нет.
- Интерфейс на двух языках. Новый текст — сразу в `ru` и `en` через `messages()` из `i18n.ts`: без `en` проект не соберётся. Даты и сортировка — с `lang()`. Проверяйте вёрстку и на английском: подписи длиннее.
- Настройки — поля `Settings` в `settings.ts` со значением по умолчанию. Они хранятся в `settings.json` хаба и копией в `localStorage`.
- Вкладки программ сохраняют снимки в локальную историю (`history.ts`, `/api/history`). Новый способ заменить программу на экране сначала ждёт `history.snapshot(…)`.
- Правила и токены: [docs/dev/ui-and-themes.md](docs/dev/ui-and-themes.md).
- В интерфейсе режим называется «Блоки», не «Scratch» (товарный знак).
- Блоки: новая команда роботу идёт только через `command()` в `blocks/runtime.ts` (`source:"program"`); любой новый способ уйти с вкладки или прервать программу обязан вызвать `runtime.stop()` или `halt()`. Как добавить блок и тонкости scratch-blocks — [docs/dev/blocks.md](docs/dev/blocks.md).
- Python и C#: программа — отдельный процесс и клиент хаба (`program.run`), хаб убивает её при СТОП, уходе владельца и потере робота. Вкладка останавливает её в `deactivate()` и при `visibilitychange`. Ошибки для ребёнка формирует сам процесс (`python/gearbit/_errors.py`, `Gearbit.ScriptHost/CompileErrors.cs` и `RuntimeErrors.cs`) на языке вкладки (`GEARBIT_LANG`). Тексты — в `python/gearbit/_texts.py`, `Gearbit.Client/ClientText.cs` и `Gearbit.ScriptHost/ScriptText.cs`, всегда на обоих языках. API обоих языков одинаковый и синхронный (`robot.forward(50)` / `robot.Forward(50);`): новую команду робота добавляйте сразу в оба клиента (`python/gearbit`, `Gearbit.Client/Robot.cs`), подсказки и карточку «Команды» (`code/python.ts`, `code/csharp.ts`) и в [python.md](docs/user/python.md), [csharp.md](docs/user/csharp.md).
- CodeMirror: цвета только через `var(--code-*)` и другие токены, лигатуры выключены.

## Документация

При изменении поведения обновляйте и пользовательскую документацию ([docs/user](docs/user/README.md), простым языком, для родителя и ребёнка), и документацию разработчика ([docs/dev](docs/dev/README.md)).

- Документация на двух языках. Русская — основная, английская — копия в `docs/en/` с той же структурой и `README.en.md` рядом с `README.md` (в корне, `python/`, `docs/captures/`). **Меняете русский документ — поправьте английский в том же коммите.** Новый документ — сразу в обоих языках.
- В начале каждого документа, сразу под заголовком, — строка-переключатель: `**Русский** · [English](…)` и `[Русский](…) · **English**`.
- Интерфейс на двух языках: в английских документах надписи интерфейса — как в английском интерфейсе, например **Connect**.
- Не переводятся: `AGENTS.md`, `CLAUDE.md`, `LICENSE`. `THIRD-PARTY-NOTICES.md` — один файл на двух языках.

## Лицензия

- Gearbit распространяется по **GPL-3.0-only** ([LICENSE](LICENSE)).
- Новая библиотека, которая попадает в сборку (npm-зависимость интерфейса, NuGet-пакет приложения или скрипт-хоста), — только с лицензией, совместимой с GPL-3.0 (MIT, BSD, Apache-2.0, LGPL, GPL-3.0). Запишите её в [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). Пакеты только для сборки и тестов (Vite, TypeScript, xUnit) туда не нужны.
- Чужой код не копируйте без проверки лицензии. Из BlocosLab (AGPL-3.0) и pez2001/apitor (GPL-3.0) берутся только сведения о протоколе, не код.
