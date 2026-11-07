import { messages, text } from "../i18n";
import { icons } from "../icons";
import { emergencyStop } from "../input/drive";
import { store } from "../model";
import { h, icon } from "./dom";

export type Mode = "remote" | "blocks" | "python" | "csharp";

export interface TopbarHandlers {
  onMode: (mode: Mode) => void;
  onRobot: () => void;
  onSettings: (anchor: HTMLElement) => void;
  onHelp: () => void;
  onTrace: () => void;
}

const M = messages({
  ru: {
    remote: "Пульт",
    blocks: "Блоки",
    mode: "Режим",
    noRobot: "Нет робота",
    connect: "подключить",
    connecting: "подключение…",
    lost: "связь потеряна",
    robotTitle: "Подключение робота",
    settingsTitle: "Оформление и настройки",
    settings: "Настройки",
    helpTitle: "Подсказки и клавиши (F1)",
    help: "Помощь",
    trace: "Журнал протокола",
    stopTitle: "Остановить все моторы (Пробел или Esc)",
    stop: "СТОП",
    space: "Пробел",
  },
  en: {
    remote: "Remote",
    blocks: "Blocks",
    mode: "Mode",
    noRobot: "No robot",
    connect: "connect",
    connecting: "connecting…",
    lost: "connection lost",
    robotTitle: "Connect a robot",
    settingsTitle: "Look and settings",
    settings: "Settings",
    helpTitle: "Tips and keys (F1)",
    help: "Help",
    trace: "Protocol log",
    stopTitle: "Stop all motors (Space or Esc)",
    stop: "STOP",
    space: "Space",
  },
});

const MODES: { id: Mode; title: string; glyph: string }[] = [
  { id: "remote", title: M.remote, glyph: icons.remote },
  { id: "blocks", title: M.blocks, glyph: icons.puzzle },
  { id: "python", title: "Python", glyph: icons.python },
  { id: "csharp", title: "C#", glyph: icons.csharp },
];

/** Шапка: логотип, режимы, робот, настройки и большая кнопка СТОП. */
export function createTopbar(handlers: TopbarHandlers): { element: HTMLElement; setMode: (mode: Mode) => void } {
  const tabs = new Map<Mode, HTMLButtonElement>();
  const modes = h("nav", { class: "modes", role: "tablist", "aria-label": M.mode });
  for (const m of MODES) {
    // Подпись дублируется в aria-label/title: в узком окне текст вкладок скрыт, остаются значки.
    const tab = h(
      "button",
      { class: "mode-tab", role: "tab", "aria-selected": "false", "aria-label": m.title, title: m.title, onclick: () => handlers.onMode(m.id) },
      icon(m.glyph),
      h("span", { class: "label" }, m.title),
    );
    tabs.set(m.id, tab);
    modes.append(tab);
  }

  const dot = h("span", { class: "dot" });
  const name = h("span", {}, M.noRobot);
  const meta = h("span", { class: "meta" }, M.connect);
  const pill = h("button", { class: "robot-pill", "data-state": "disconnected", onclick: handlers.onRobot, title: M.robotTitle }, dot, name, meta);

  const settingsBtn = h("button", { class: "btn icon ghost", title: M.settingsTitle, "aria-label": M.settings }, icon(icons.settings));
  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    handlers.onSettings(settingsBtn);
  });
  const helpBtn = h("button", { class: "btn icon ghost", title: M.helpTitle, "aria-label": M.help, onclick: handlers.onHelp }, icon(icons.help));
  const traceBtn = h("button", { class: "btn icon ghost", title: M.trace, "aria-label": M.trace, onclick: handlers.onTrace }, icon(icons.log));

  const stop = h("button", { class: "stop-btn", title: M.stopTitle, onclick: () => void emergencyStop() }, icon(icons.stop), M.stop, h("kbd", {}, M.space));

  store.subscribe((s) => {
    const r = s.robot;
    const state = r?.state ?? "disconnected";
    pill.dataset.state = state;
    name.textContent = r && state !== "disconnected" ? r.name : M.noRobot;
    meta.textContent =
      state === "connected"
        ? text(r?.profileTitle ?? r?.deviceTitle)
        : state === "connecting"
          ? M.connecting
          : state === "lost"
            ? M.lost
            : M.connect;
    const moving = Object.values(s.telemetry?.motors ?? {}).some((p) => p !== 0);
    stop.classList.toggle("moving", state === "connected" && moving);
    document.title = r && state === "connected" ? `${r.name} — Gearbit` : "Gearbit";
  });

  const element = h(
    "header",
    { class: "topbar" },
    h("div", { class: "brand" }, h("span", { class: "brand-logo" }, icon(icons.logo)), h("span", { class: "brand-name" }, "Gearbit")),
    modes,
    h("div", { class: "spacer" }),
    pill,
    traceBtn,
    helpBtn,
    settingsBtn,
    stop,
  );

  const setMode = (mode: Mode) => {
    for (const [id, tab] of tabs) tab.setAttribute("aria-selected", String(id === mode));
  };
  return { element, setMode };
}
