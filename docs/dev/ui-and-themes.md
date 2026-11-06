# Интерфейс и темы

Веб-интерфейс — `web/studio-ui`: TypeScript без фреймворка + Vite. Один и тот же интерфейс показывается в окне Gearbit.exe (WebView2) и в обычном браузере.

## Структура `src/`

| Файл | Что |
|---|---|
| `main.ts` | Сборка экрана, подписки на уведомления хаба, клавиатура и геймпад, экран «нет связи с хабом». |
| `hub.ts` | `HubClient`: WebSocket + JSON-RPC, автопереподключение, `call(method, params)`, `on(notification, listener)`. После каждого подключения шлёт `hub.hello` и выдаёт событие `hub.connected`. |
| `model.ts` | Типы ответов хаба (`RobotInfo`, `Telemetry`, `EmulatorState`…) и общий `store`. |
| `settings.ts` | Тема, цвет, крупный текст, скорость, вид управления. Хранятся в `localStorage` (`gearbit.settings`). |
| `icons.ts` | Встроенные SVG-иконки (`currentColor`), в том числе логотип. |
| `input/drive.ts` | Смешивание кнопок, джойстика и геймпада в `drive.arcade`. Пока есть ввод, команда повторяется раз в 100 мс, после отпускания — сразу `drive.stop`. |
| `input/keyboard-gamepad.ts` | Клавиши и Gamepad API. |
| `ui/topbar.ts` | Шапка: режимы, плашка робота, кнопки, СТОП. |
| `ui/remote-view.ts` | Пульт: карточки управления, сцены, датчиков, света, моторов. Карточку сцены (`stage`) вкладка «Блоки» забирает к себе. |
| `ui/room-view.ts` | Canvas комнаты эмулятора: машинка, лучи, след, рисование препятствий. |
| `ui/connect-dialog.ts` | Поиск и подключение. |
| `ui/settings-popover.ts`, `help-dialog.ts`, `trace-panel.ts`, `toasts.ts` | Настройки, подсказка (F1), журнал протокола, всплывающие сообщения. |
| `ui/placeholders.ts` | Заглушки режимов Python / C#. |
| `ui/ask-dialog.ts` | `askText`, `askConfirm`, `showAlert` — свои диалоги вместо `prompt`/`confirm`/`alert`. |
| `blocks/*` | Редактор блоков, загружается лениво. См. [Редактор блоков](blocks.md). |
| `ui/dom.ts` | `h(tag, attrs, ...children)` — маленький помощник для создания элементов, `icon(svg)`, `cssVar(name)`. |
| `styles/tokens.css` | Дизайн-токены и темы. |
| `styles/app.css` | Раскладка и компоненты. |

## Темы

Тема задаётся атрибутами на `<html>`:

- `data-theme="light" | "dark"`. Режим «Авто» следит за `prefers-color-scheme` и подставляет одно из двух значений.
- `data-accent="ocean" | "forest" | "sunset" | "cosmos" | "candy"`.
- `data-large="true"`: крупный текст.

Компоненты используют **только переменные**, никаких цветов в коде:

| Группа | Переменные |
|---|---|
| Поверхности | `--bg`, `--bg-grad`, `--surface`, `--border`, `--overlay`, `--grid` |
| Текст | `--text`, `--text-muted` |
| Акцент | `--accent`, `--accent-2`, `--accent-soft`, `--accent-contrast` |
| Состояния | `--ok`, `--warn`, `--danger`, `--danger-strong` |
| Светодиоды | `--led-off`, `--led-red` … `--led-white` |
| Блоки | `--block-<категория>`, `-2`, `-3` (`motion`, `looks`, `event`, `control`, `sensing`, `operators`, `data`, `more`), `--block-field`, `--block-field-text`, `--block-glow` |
| Форма | `--radius-sm`, `--radius`, `--radius-lg`, `--gap`, `--shadow`, `--shadow-lg`, `--header-h` |
| Шрифты и анимация | `--font`, `--font-display`, `--font-mono`, `--ease`, `--fast`, `--normal` |

**Новая цветовая схема:** добавьте `:root[data-accent="…"] { --accent; --accent-2 }` в `tokens.css` (при необходимости — тёмный вариант), затем пункт в `ACCENTS` в `settings.ts`. Проверьте контраст текста на `--accent` в обеих темах.

**Редактор блоков** берёт цвета блоков из `--block-*` (тема Blockly в `blocks/theme.ts` пересобирается при смене темы), а фон поля, палитры и меню — из переменных scratch-blocks `--colour-*`, переопределённых в `app.css`.

**Canvas** (комната эмулятора) не видит CSS напрямую: цвета берутся через `cssVar()` при каждой перерисовке. Поэтому смена темы подхватывается сразу.

**Окно WPF**: `settings.ts` после применения темы отправляет хосту `{type:"theme", theme}` через `window.chrome.webview.postMessage`. `MainWindow` красит заголовок окна (`DwmSetWindowAttribute`, тёмный заголовок Windows) и фон под WebView2, чтобы не было белой вспышки.

## Правила интерфейса

- **Тексты — по-русски, коротко, для ребёнка 7–12 лет.** Ошибки объясняют, что сделать: «Закройте приложение Apitor на телефоне».
- **СТОП всегда виден** и работает с клавиатуры (пробел, Esc) и геймпада.
- **Движение только пока держат.** Новый способ ввода обязан сбрасываться: при отпускании, при потере фокуса окна (`blur`, `visibilitychange`), при `safety.event`.
- **Размеры для мыши и пальца**: кнопки не ниже 40 px, d-pad тянется до 300 px.
- **Узкие окна**: шапка прячет второстепенное при ширине ≤ 1320 / 1100 / 900 px, сетка карточек перестраивается. Проверяйте ширину 1024 px.
- **Доступность**: у кнопок-иконок есть `aria-label` и `title`, у декоративных SVG — `aria-hidden="true"`, видимый фокус.
- **Без внешних ресурсов**: шрифты системные, иконки встроены. Интерфейс работает без интернета.

## Проверка изменений

```bash
cd web/studio-ui
npm run typecheck
npm run build
```

Затем запустите хаб (`dotnet run --project src/Gearbit.Server`), подключите эмулятор и проверьте в обеих темах и в узком окне. Для быстрой итерации удобнее `npm run dev` (http://localhost:5173) при запущенном хабе.
