# API хаба (JSON-RPC 2.0)

**Русский** · [English](../en/dev/hub-api.md)

Хаб слушает `ws://localhost:5280/ws`. Сообщения — JSON-RPC 2.0, по одному JSON-объекту в текстовом кадре WebSocket. Имена полей в camelCase, перечисления — строки в camelCase (`"connected"`, `"remote"`).

Живой список методов с описаниями отдаёт `hub.methods`.

## Подключение

1. Откройте WebSocket. Браузерные клиенты проходят проверку `Origin`: разрешены `localhost:<порт хаба>`, `localhost:5173` и адреса из `Hub:AllowedOrigins`. Клиенты без заголовка `Origin` (Python, C#) пропускаются.
2. Первым вызовите `hub.hello`:

```json
→ {"jsonrpc":"2.0","id":1,"method":"hub.hello","params":{"name":"Python: исследователь","lang":"ru"}}
← {"jsonrpc":"2.0","id":1,"result":{"hub":"Gearbit","version":"0.1.0","clientId":"c3","transports":["emulator","ble"],"robot":null,"control":{"clientId":null,"clientName":null,"kind":null,"mine":false}}}
```

`name` показывается другим клиентам в полоске «Сейчас управляет…».

`lang` — язык сообщений для этого клиента: `ru` или `en` (подходит и `en-US`). На нём приходят `message` в ошибках, `safety.event`, `warnings` поиска и `problem` в `program.languages`. Без `lang` или с незнакомым языком — по-русски, как в прежних версиях. Одно событие разные клиенты получают каждый на своём языке. Описания в `hub.methods` и журнал хаба — всегда по-русски.

## Методы

### Хаб и каталог

| Метод | Параметры | Результат |
|---|---|---|
| `hub.hello` | `{name, lang?, runId?}` | `{hub, version, clientId, transports, robot, control}`. `lang` — язык сообщений (`ru`, `en`). `runId` передаёт программа, которую запустил хаб (`GEARBIT_RUN_ID`): так хаб узнаёт её соединение. |
| `hub.methods` | — | список `{name, summary}` |
| `catalog.get` | — | `{devices: [{id, title, status, protocol, components}], profiles: [{id, title, device, status, maxPowerPercent, aliases}]}` |

### Робот

| Метод | Параметры | Результат и поведение |
|---|---|---|
| `robot.scan` | `{durationMs?}` (по умолчанию `Hub:ScanDurationMs` = 4000) | `{devices: [{id, name, rssi, transport, deviceId, deviceTitle, known}], warnings}`. Сканеры работают параллельно. |
| `robot.connect` | `{id, deviceId?, profileId?}` | `RobotDto`. `deviceId` — модель для неизвестного устройства, `profileId` — сборка (по умолчанию первая для модели). Сбрасывает арбитр, моторы в 0. |
| `robot.disconnect` | — | Останавливает моторы и отключается. |
| `robot.info` | — | `RobotDto` или `null`. |
| `robot.telemetry` | — | `TelemetryDto` (см. ниже). |
| `robot.stop` | — | **Разрешён всем и всегда.** Моторы в 0, рассылает `safety.event {reason:"stop"}`. В режиме замеров тоже работает (и снимает страж замеров до следующего кадра). |
| `robot.setMaxPower` | `{percent}` | Общий предел мощности 0–100. Рассылает `robot.info`. |

`RobotDto`: `{id, name, state, deviceId, deviceTitle, deviceStatus, profileId, profileTitle, uid, firmware, maxPowerPercent, profileMaxPowerPercent, hasDrive, serviceMode, components: [{id, kind, title, available, aliases, lineLevel}]}`. `lineLevel` есть только у датчиков расстояния: с какого уровня датчик, смотрящий в пол, видит чёрную линию (из `calibration.distance.<id>.lineLevel` профиля, иначе `(maxLevel + 1) / 2`, то есть 3). `state`: `disconnected | connecting | connected | lost`. `serviceMode` — идут замеры протокола (см. ниже): обычное управление выключено.

`TelemetryDto`: `{distances: {D1: 0..6|null}, distancesCm: {D1: number|null}, tilt: {x, y, acceleration}|null, battery, batteryLow, firmware, motors: {M1: -100..100}, lights: {L1: "red"}, available: {M1: true}}`.

### Движение

Все команды движения проходят через арбитр (см. ниже) и предел мощности. Значения в процентах −100..100, предел применяется в хабе.

| Метод | Параметры |
|---|---|
| `motor.setPower` | `{id, power, source?}`: `id` — порт (`M1`) или псевдоним сборки (`left_wheel`) |
| `drive.tank` | `{left, right, source?}` |
| `drive.arcade` | `{throttle, turn, source?}`: положительный `turn` — направо |
| `drive.stop` | `{source?}` |
| `light.setColor` | `{id, color}`: `off, red, orange, yellow, green, cyan, blue, purple, white`. `id` — `L1`…`L4` или псевдоним. |

`source`: `"remote"` (по умолчанию: пульт) или `"program"` (программа ребёнка). От него зависит вид владельца в арбитре и работа стража.

Редактор блоков шлёт все команды с `source: "program"`. Когда программа закончилась или её остановили, он сам выключает свои моторы (`drive.stop`, `motor.setPower 0`) и вызывает `control.release`. Подробнее — [Редактор блоков](blocks.md).

### Управление

| Метод | Параметры | Поведение |
|---|---|---|
| `control.get` | — | `{clientId, clientName, kind, mine}` |
| `control.take` | `{source?}` | Забрать управление, даже если оно занято. |
| `control.release` | — | Отдать, если владелец — вы. |

Арбитр: моторами управляет один клиент. Первая команда движения занимает свободное управление. Если управление занято другим, команда отклоняется с `ControlBusy` (−32002). Владелец освобождается при отключении клиента; моторы при этом останавливаются (`safety.event {reason:"clientLeft"}`).

`kind` владельца: `remote` (пульт), `program` (программа) или `service` (замеры протокола).

### Программы (Python, C#)

Хаб сам запускает программу в отдельном процессе, а процесс подключается к хабу как обычный клиент (`hub.hello {name, runId}`) и ездит командами с `source:"program"`. Одновременно работает одна программа.

| Метод | Параметры | Поведение |
|---|---|---|
| `program.languages` | — | `[{id, title, available, version, problem}]`. `problem` — что сделать, если запустить нечем (на языке клиента, для показа). Python ищется при каждом вызове, пока не найден; найденный запоминается. |
| `program.run` | `{language, code, name?, sensors?}` | Запустить. `language`: `python` или `csharp`. `sensors` — где стоят датчики: `{D1: "front", D2: "none"}`. Предыдущая программа останавливается (`reason: "replaced"`). Возвращает `{runId}`. Нет языка — `NotSupported` с подсказкой. Код длиннее 256 КБ — `InvalidParams`. |
| `program.stop` | — | Завершить процесс программы. Если управляла она, моторы в 0. `false` — ничего не работало. |
| `program.status` | — | `{runId, language, name, startedAt}` или `null`. |

Процесс получает переменные окружения:

| Переменная | Значение |
|---|---|
| `GEARBIT_URL` | `ws://localhost:<порт>/ws` |
| `GEARBIT_NAME` | `Python: <name>` или `C#: <name>` — имя в полоске «Сейчас управляет…» |
| `GEARBIT_RUN_ID` | `runId` для `hub.hello` |
| `GEARBIT_SENSOR_PLACES` | JSON `sensors` из `program.run` |

Строки вывода, которые начинаются с `@@gearbit:`, — служебные: хаб их не показывает, а разбирает JSON. `{"type":"say","text"}` — облачко над роботом (`program.say`), `{"type":"error","line","column","message"}` — ошибка для подсветки строки (попадает в `program.exited.error`).

Программа останавливается, а процесс завершается (вместе с дочерними), когда:

- вызван `program.stop` или `robot.stop` (СТОП);
- запущена другая программа;
- отключилась вкладка, которая её запустила (`ownerLeft`);
- робот отключился или связь потеряна (`robotLost`);
- хаб закрывается (`hubStopping`).

Хаб сам остановил программу — тревога `safety.event {reason:"clientLeft"}` при закрытии её соединения не рассылается: моторы уже стоят. Нормально закончившаяся программа сама выключает свои моторы и отдаёт управление (`control.release`).

Код возврата процесса: 0 — закончилась, 1 — ошибка, 2 — остановлена (пришёл `safety.event`). Хаб смотрит на него, только если не останавливал программу сам.

Реализация — `src/Gearbit.Hub/Programs`: `ProgramRunner` (запуск, вывод, остановка), `IProgramLanguage` (как запустить язык), `IProgramLauncher` (процесс; в тестах подменяется). Языки:

- `PythonLanguage` — `python.exe` с пакетом `gearbit` в `PYTHONPATH`, программа в `program.py`;
- `CSharpLanguage` — `csharp\Gearbit.ScriptHost.exe program.csx`. ScriptHost собирает скрипт Roslyn Scripting (C# 14, импорты `System…`, `Gearbit.Client` и `using static Gearbit.Client.RobotScript`, отсюда `robot` и `Wait`), переводит ошибки компиляции и выполнения на русский (`CompileErrors`, `RuntimeErrors`) и ездит через `Gearbit.Client`. Скрипт выполняется в процессе ScriptHost, поэтому его, как и Python, хаб просто завершает.

### Замеры протокола (этап 0)

Режим для [помощника замеров](../STAGE0-CHECKLIST.md): кадры уходят роботу как есть, байт в байт. Им пользуется окно «Помощник замеров» (журнал протокола → «Замеры»).

| Метод | Параметры | Поведение |
|---|---|---|
| `service.begin` | — | Занять арбитр с видом `service`, остановить моторы и перевести робота в ручной режим: цикл отправки кадра состояния молчит. Рассылает `robot.info` с `serviceMode: true`. Повторный вызов тем же клиентом ничего не делает; другим — `ControlBusy`. |
| `service.send` | `{hex}` | Отправить кадр (пробелы, `-` и `:` допустимы, до 64 байт). Возвращает число байт. Только владельцу замеров; без `service.begin` — `NotSupported`; плохой hex — `InvalidParams`. |
| `service.end` | — | Закончить замеры (может любой клиент): моторы в 0, цикл отправки снова работает, арбитр свободен. `true`, если замеры шли. |

Пока идут замеры, `motor.setPower`, `drive.*` и `light.setColor` отклоняются с `ControlBusy`. Предел мощности к сырым кадрам **не применяется**: это осознанное исключение для замеров на подставке. Защита:

- `robot.stop` работает всегда;
- страж замеров: нет новых кадров дольше `Hub:ServiceWatchdogMs` (15 с) — кадр «стоп» и `safety.event {reason:"watchdog"}`; срабатывает один раз до следующего кадра;
- отключился клиент, начавший замеры, — замеры закончены, моторы в 0 (`safety.event {reason:"clientLeft"}`);
- смена или отключение робота заканчивает замеры.

### Отладка и эмулятор

| Метод | Параметры | Поведение |
|---|---|---|
| `trace.subscribe` | `{enabled}` | Присылать `robot.trace` по каждому кадру. |
| `emulator.subscribe` | `{enabled}` | Присылать `emulator.state` ~15 раз в секунду. |
| `emulator.state` | — | Снимок мира или `null`. |
| `emulator.reset` | — | Машинка на старт текущей сцены. |
| `emulator.setObstacles` | `{obstacles: [{x, y, width, height}]}` | Препятствия в сантиметрах. |
| `emulator.setSensorAngles` | `{angles: {D1: 0}, down: {D2: 2.5}}` | Куда смотрят виртуальные датчики. `angles` — вбок: градусы от «вперёд» по часовой стрелке. `down` — в пол: сдвиг вбок от оси робота в сантиметрах (меньше 0 — левее, больше 0 — правее; не дальше `robotRadius − 1`), точка на `downSensorForward` см впереди центра. Датчик живёт в одном из двух словарей: попал в `down` — убран из `angles` и наоборот. Неизвестные id пропускаются. Возвращает `{angles, down}`. Интерфейс вызывает его, когда пользователь переставляет датчики в карточке «Датчики». |
| `emulator.setScene` | `{scene: "room" \| "line"}` | Сцена: `room` — комната с препятствиями, `line` — белый лист с чёрным стадионом (центр 120×80, прямые 90 см, радиус 45, линия 3 см) без препятствий. Машинка встаёт на старт сцены. Возвращает `{scene}`; неизвестная сцена — `InvalidParams`. |
| `emulator.setTilt` | `{x, y}` | Наклонить машинку (гироскоп), градусы −90..90: `y` больше 0 — вперёд, `x` больше 0 — вправо (как у Makerzoid). Без параметров — ровно. Наклон держится, пока его не вернут в 0; `emulator.reset` и выключение тоже обнуляют. Возвращает `{x, y}`. Интерфейс вызывает его, пока держат кнопки «Наклонить». |

## Уведомления (хаб → клиент)

| Метод | Когда | Данные |
|---|---|---|
| `robot.telemetry` | 10 раз в секунду, пока робот подключён | `TelemetryDto` |
| `robot.info` | подключение, смена предела, прошивка | `RobotDto` или `null` |
| `robot.state` | смена состояния связи | `{state, reason}` |
| `safety.event` | любая аварийная остановка | `{reason: stop\|lost\|watchdog\|clientLeft, message}` |
| `control.changed` | смена владельца | `{clientId, clientName, kind, mine}` |
| `robot.trace` | кадр протокола (если подписаны) | `{dir: "out"\|"in", hex, note, t}`, `t` — мс от старта хаба |
| `program.output` | программа напечатала строки (пачками раз в 100 мс, до 32 КБ) | `{runId, stream: "out"\|"err", text}` — строки через `\n`, без `\n` в конце |
| `program.say` | программа вызвала `robot.say` | `{runId, text}` |
| `program.exited` | программа закончилась | `{runId, exitCode, reason, error, durationMs}`. `reason`: `finished` (код 0), `error`, `stopped` (СТОП, `program.stop` или код 2 — программа сама поймала остановку), `replaced`, `ownerLeft`, `robotLost`, `hubStopping`. `error`: `{line, column, message}` или `null`. |
| `emulator.state` | ~15 Гц (если подписаны) | `{active, roomWidth, roomHeight, robotRadius, x, y, heading, bumped, motors, lights, sensorCm, sensorLevels, sensorAngles, battery, obstacles, sensorDown, downSensorForward, scene, line, tiltX, tiltY}`. `line` — `{points: [{x, y}], width, closed}` или `null` вне сцены `line`. Для датчиков из `sensorDown` уровень в `sensorLevels` — пол под ними: 0 белое … 6 чёрное. |

## Безопасность

- **Страж («кнопка мертвеца»)**: если владелец вида `remote` не присылал команду движения дольше `Hub:RemoteWatchdogMs` (600 мс), моторы останавливаются (`safety.event {reason:"watchdog"}`). Пульт, пока держат кнопку, повторяет команду каждые ~100 мс, а ползунки моторов — каждые 250 мс. Программы (`source:"program"`) под стражем не стоят, но останавливаются, если отключились.
- При потере связи — `robot.state {state:"lost"}` и `safety.event {reason:"lost"}`.
- При закрытии хаба моторы останавливаются до отключения.
- Программа, запущенная через `program.run`, завершается по СТОП, при отключении запустившей её вкладки и при потере робота (см. «Программы»). Уведомления `program.*` получает только запустившая её вкладка.

## Ошибки

| Код | Имя | Когда |
|---|---|---|
| −32700 | Parse error | Не JSON |
| −32600 | Invalid request | Не JSON-RPC 2.0 |
| −32601 | Method not found | Нет такого метода |
| −32602 | Invalid params | Не хватает или неверный тип параметра |
| −32603 | Internal error | Исключение в хабе |
| −32001 | NotConnected | Робот не подключён |
| −32002 | ControlBusy | Управляет другой клиент |
| −32003 | NotFound | Нет устройства, компонента, сборки |
| −32004 | NotSupported | Нет транспорта или протокола, компонент недоступен в прошивке |
| −32005 | ConnectFailed | Не удалось подключиться |

`message` в ошибке написан на языке клиента (`hub.hello {lang}`) и годится для показа пользователю.

Тексты хаба — в `src/Gearbit.Hub/HubText.cs`: интерфейс `IHubText` и классы `RuHubText`, `EnHubText`. Новый текст добавьте в интерфейс и в оба класса — без перевода проект не соберётся. Ошибку бросайте так: `throw new HubException(HubErrors.NotFound, t => t.NoMotor(id))`; `Message` исключения — русский текст для журнала. Уведомление с текстом рассылайте через `ClientRegistry.BroadcastText`. Ошибки робота и транспорта (`RobotException`) несут код `RobotErrorCode`, хаб показывает по нему `IHubText.RobotError`.

## HTTP

- `GET /api/info` → `{hub: "Gearbit", version, websocket, robot, clients}`. По нему Gearbit.exe узнаёт, что порт занят своим хабом.
- `GET /` → веб-интерфейс из `wwwroot`.

## Настройки (`appsettings.json`, `--Hub:…`)

| Ключ | По умолчанию | Смысл |
|---|---|---|
| `Hub:Port` | 5280 | Порт (только `localhost`). |
| `Hub:DevicesDirectory` | `devices` рядом с программой | Описания роботов. |
| `Hub:ProfilesDirectory` | `profiles` рядом с программой | Сборки. |
| `Hub:RemoteWatchdogMs` | 600 | Таймаут «кнопки мертвеца». |
| `Hub:ServiceWatchdogMs` | 15000 | Страж замеров: сколько ждать новый кадр, прежде чем остановить моторы. Больше 10 с — чтобы проверить, останавливается ли робот сам (п. 8 чек-листа). |
| `Hub:ScanDurationMs` | 4000 | Длительность поиска. |
| `Hub:AllowedOrigins` | — | Дополнительные разрешённые `Origin`. |
| `Hub:Emulator` | true | Показывать эмулятор в поиске. |
| `Hub:PythonPath` | — | Путь к `python.exe`. Без него: `python\runtime\python.exe` рядом с программой, `py -3`, `python.exe` в `PATH` (заглушки Microsoft Store пропускаются). Нужен Python 3.9+. |
| `Hub:PythonPackageDirectory` | `python` рядом с программой | Где лежит пакет `gearbit` (добавляется в `PYTHONPATH`). |
| `Hub:CSharpHostPath` | `csharp\Gearbit.ScriptHost.exe` рядом с программой | Запускатель программ на C#. |
| `Hub:ProgramsDirectory` | `%TEMP%\Gearbit\programs` | Куда записывается запускаемая программа (папка на каждый запуск, удаляется после). |

## Пример: Python без библиотек Gearbit

```python
import asyncio, json, websockets

async def main():
    async with websockets.connect("ws://localhost:5280/ws") as ws:
        n = 0
        async def call(method, **params):
            nonlocal n; n += 1
            await ws.send(json.dumps({"jsonrpc": "2.0", "id": n, "method": method, "params": params}))
            while True:
                msg = json.loads(await ws.recv())
                if msg.get("id") == n:
                    return msg.get("result")

        await call("hub.hello", name="Python: тест")
        await call("drive.tank", left=40, right=40, source="program")
        await asyncio.sleep(1)
        await call("robot.stop")

asyncio.run(main())
```

Удобнее — пакет `gearbit` ([python/README.md](../../python/README.md)): `robot.forward(50)`, `wait(1)`, понятные ошибки, остановка по СТОП.
