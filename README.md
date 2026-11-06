# BotStudio

Программа для Windows, чтобы **управлять роботом-конструктором с ПК и программировать его** на Scratch, Python и C#. Рассчитана на занятия с ребёнком за большим монитором, с клавиатурой, мышью и геймпадом.

Первый поддерживаемый робот — **Apitor / Makerzoid SuperBot** (контроллер TUDAO, Bluetooth LE). Архитектура рассчитана на другие похожие роботы: их можно добавлять как адаптеры.

> ⚠️ Проект неофициальный и не связан с Apitor или Makerzoid. Протокол получен обратной разработкой. Всё работает локально: без облака, аккаунтов и сбора данных.

## Статус

| Этап | Что | Статус |
|---|---|---|
| 0 | Замеры протокола на роботе | ⏳ значения пока заглушки (`verified: false`) |
| 1 | Ядро, хаб, пульт, темы | 🚧 в работе |
| 2 | Scratch | — |
| 3 | Python | — |
| 4 | C# | — |
| 5 | Симулятор | — |

## Быстрый старт (разработчик)

Нужно: Windows 10/11, .NET SDK 10, Node.js 20+, Bluetooth 4.0+ (для реального робота).

```bash
git clone https://github.com/EugeneSoftwareDeveloper/BotStudio.git
cd BotStudio
dotnet build
dotnet test
cd web/studio-ui && npm install && npm run build && cd ../..
dotnet run --project src/BotStudio.Server
```

Затем откройте http://localhost:5280 и выберите робота **«Эмулятор SuperBot»**: он работает без железа.

## Документация

**Пользователям** ([docs/user](docs/user/README.md)):
- [Первые шаги](docs/user/getting-started.md)
- [Пульт и управление](docs/user/remote-control.md)
- [Безопасность](docs/user/safety.md)
- [Вопросы и проблемы](docs/user/faq.md)

**Разработчикам** ([docs/dev](docs/dev/README.md)):
- [План и этапы](docs/PLAN.md)
- [Архитектура](docs/ARCHITECTURE.md)
- [Протокол SuperBot](docs/PROTOCOL-SUPERBOT.md) и [чек-лист замеров](docs/STAGE0-CHECKLIST.md)
- [Сборка и запуск](docs/dev/building.md)
- [API хаба (JSON-RPC)](docs/dev/hub-api.md)
- [Как добавить нового робота](docs/dev/adding-a-robot.md)
- [Интерфейс и темы](docs/dev/ui-and-themes.md)

## Структура

```
src/        .NET: Core, протоколы, транспорты, хаб, сервер, WPF-оболочка
web/        веб-интерфейс (TypeScript + Vite)
devices/    описания роботов (JSON)
profiles/   сборки (JSON)
tests/      тесты
docs/       документация
```
