# API хаба (JSON-RPC 2.0)

Хаб слушает `ws://localhost:5280/ws`. Сообщения — JSON-RPC 2.0, по одному JSON-объекту в текстовом кадре WebSocket. Имена полей в camelCase, перечисления — строки в camelCase (`"connected"`, `"remote"`).

Живой список методов с описаниями отдаёт `hub.methods`.

## Подключение

1. Откройте WebSocket. Браузерные клиенты проходят проверку `Origin`: разрешены `localhost:<порт хаба>`, `localhost:5173` и адреса из `Hub:AllowedOrigins`. Клиенты без заголовка `Origin` (Python, C#) пропускаются.
2. Первым вызовите `hub.hello`:

```json
→ {"jsonrpc":"2.0","id":1,"method":"hub.hello","params":{"name":"Python: исследователь"}}
← {"jsonrpc":"2.0","id":1,"result":{"hub":"Gearbit","version":"0.1.0","clientId":"c3","transports":["emulator","ble"],"robot":null,"control":{"clientId":null,"clientName":null,"kind":null,"mine":false}}}
```

`name` показывается другим клиентам в полоске «Сейчас управляет…».

## Методы

### Хаб и каталог

| Метод | Параметры | Результат |
|---|---|---|
| `hub.hello` | `{name}` | `{hub, version, clientId, transports, robot, control}` |
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

`RobotDto`: `{id, name, state, deviceId, deviceTitle, deviceStatus, profileId, profileTitle, uid, firmware, maxPowerPercent, profileMaxPowerPercent, hasDrive, serviceMode, components: [{id, kind, title, available, aliases}]}`. `state`: `disconnected | connecting | connected | lost`. `serviceMode` — идут замеры протокола (см. ниже): обычное управление выключено.

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
| `emulator.reset` | — | Машинка на старт. |
| `emulator.setObstacles` | `{obstacles: [{x, y, width, height}]}` | Препятствия в сантиметрах. |
| `emulator.setSensorAngles` | `{angles: {D1: 0, D2: 90}}` | Куда смотрят виртуальные датчики: градусы от «вперёд» по часовой стрелке. Неизвестные id пропускаются. Возвращает все углы. Интерфейс вызывает его, когда пользователь переставляет датчики в карточке «Датчики». |

## Уведомления (хаб → клиент)

| Метод | Когда | Данные |
|---|---|---|
| `robot.telemetry` | 10 раз в секунду, пока робот подключён | `TelemetryDto` |
| `robot.info` | подключение, смена предела, прошивка | `RobotDto` или `null` |
| `robot.state` | смена состояния связи | `{state, reason}` |
| `safety.event` | любая аварийная остановка | `{reason: stop\|lost\|watchdog\|clientLeft, message}` |
| `control.changed` | смена владельца | `{clientId, clientName, kind, mine}` |
| `robot.trace` | кадр протокола (если подписаны) | `{dir: "out"\|"in", hex, note, t}`, `t` — мс от старта хаба |
| `emulator.state` | ~15 Гц (если подписаны) | `{active, roomWidth, roomHeight, robotRadius, x, y, heading, bumped, motors, lights, sensorCm, sensorLevels, sensorAngles, battery, obstacles}` |

## Безопасность

- **Страж («кнопка мертвеца»)**: если владелец вида `remote` не присылал команду движения дольше `Hub:RemoteWatchdogMs` (600 мс), моторы останавливаются (`safety.event {reason:"watchdog"}`). Пульт, пока держат кнопку, повторяет команду каждые ~100 мс, а ползунки моторов — каждые 250 мс. Программы (`source:"program"`) под стражем не стоят, но останавливаются, если отключились.
- При потере связи — `robot.state {state:"lost"}` и `safety.event {reason:"lost"}`.
- При закрытии хаба моторы останавливаются до отключения.

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

`message` в ошибке написан по-русски и годится для показа пользователю.

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

Библиотека `gearbit` для Python с удобным API (`robot.forward(1)`) — этап 3.
