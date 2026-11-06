# Сборка, запуск, тесты

## Что нужно

- Windows 10 (19041+) или 11.
- .NET SDK 10: версия закреплена в `global.json`, допускаются новые feature-band.
- Node.js 20+ и npm: для веб-интерфейса.
- Для реального робота — Bluetooth 4.0+. Для эмулятора ничего не нужно.

Пакеты NuGet берутся только с nuget.org (`nuget.config` очищает источники машины), версии собраны в `Directory.Packages.props` (Central Package Management). Предупреждения считаются ошибками (`TreatWarningsAsErrors` в `Directory.Build.props`).

## Первая сборка

```bash
cd web/studio-ui
npm install
npm run build        # tsc --noEmit + vite build → src/Gearbit.Hub/wwwroot
cd ../..
dotnet build
dotnet test
```

Веб-интерфейс собирается в `src/Gearbit.Hub/wwwroot` (папка в `.gitignore`). При `dotnet build` она копируется в `bin` сервера и приложения как Content. **Сначала npm, потом dotnet.** Иначе в `bin` окажется старый или пустой интерфейс.

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

## Иконка

`tools/make_icon.py` (нужен Pillow) рисует `src/Gearbit.App/Assets/gearbit.ico` и `docs/images/logo.png`. `web/studio-ui/public/favicon.svg` правится вручную в том же стиле.

```bash
python tools/make_icon.py
```

## Публикация (черновик)

```bash
cd web/studio-ui && npm run build && cd ../..
dotnet publish src/Gearbit.App -c Release -r win-x64 --self-contained false
```

Нужен .NET Desktop Runtime 10 и WebView2 Runtime. Установщик появится позже.

## Известные мелочи

- В проекте WPF неявные `using` не включают `System.IO`: добавляйте `using System.IO;` явно.
- Окончания строк заданы в `.gitattributes`: `*.cs`, `*.csproj`, `*.xaml`, `*.props` — CRLF, остальное — LF.
- TypeScript 7 (нативный компилятор) и Vite 8. Пакетов-фреймворков в интерфейсе нет.
