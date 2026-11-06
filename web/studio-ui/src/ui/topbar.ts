import { icons } from "../icons";
import { emergencyStop } from "../input/drive";
import { store } from "../model";
import { h, icon } from "./dom";

export type Mode = "remote" | "scratch" | "python" | "csharp";

export interface TopbarHandlers {
  onMode: (mode: Mode) => void;
  onRobot: () => void;
  onSettings: (anchor: HTMLElement) => void;
  onHelp: () => void;
  onTrace: () => void;
}

const MODES: { id: Mode; title: string; glyph: string; soon?: boolean }[] = [
  { id: "remote", title: "Пульт", glyph: icons.remote },
  { id: "scratch", title: "Scratch", glyph: icons.puzzle, soon: true },
  { id: "python", title: "Python", glyph: icons.python, soon: true },
  { id: "csharp", title: "C#", glyph: icons.csharp, soon: true },
];

/** Шапка: логотип, режимы, робот, настройки и большая кнопка СТОП. */
export function createTopbar(handlers: TopbarHandlers): { element: HTMLElement; setMode: (mode: Mode) => void } {
  const tabs = new Map<Mode, HTMLButtonElement>();
  const modes = h("nav", { class: "modes", role: "tablist", "aria-label": "Режим" });
  for (const m of MODES) {
    const tab = h(
      "button",
      { class: "mode-tab", role: "tab", "aria-selected": "false", onclick: () => handlers.onMode(m.id) },
      icon(m.glyph),
      h("span", { class: "label" }, m.title),
      m.soon ? h("span", { class: "soon" }, "скоро") : null,
    );
    tabs.set(m.id, tab);
    modes.append(tab);
  }

  const dot = h("span", { class: "dot" });
  const name = h("span", {}, "Нет робота");
  const meta = h("span", { class: "meta" }, "подключить");
  const pill = h("button", { class: "robot-pill", "data-state": "disconnected", onclick: handlers.onRobot, title: "Подключение робота" }, dot, name, meta);

  const settingsBtn = h("button", { class: "btn icon ghost", title: "Оформление и настройки", "aria-label": "Настройки" }, icon(icons.settings));
  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    handlers.onSettings(settingsBtn);
  });
  const helpBtn = h("button", { class: "btn icon ghost", title: "Подсказки и клавиши (F1)", "aria-label": "Помощь", onclick: handlers.onHelp }, icon(icons.help));
  const traceBtn = h("button", { class: "btn icon ghost", title: "Журнал протокола", "aria-label": "Журнал протокола", onclick: handlers.onTrace }, icon(icons.log));

  const stop = h("button", { class: "stop-btn", title: "Остановить все моторы (Пробел или Esc)", onclick: () => void emergencyStop() }, icon(icons.stop), "СТОП", h("kbd", {}, "Пробел"));

  store.subscribe((s) => {
    const r = s.robot;
    const state = r?.state ?? "disconnected";
    pill.dataset.state = state;
    name.textContent = r && state !== "disconnected" ? r.name : "Нет робота";
    meta.textContent =
      state === "connected"
        ? (r?.profileTitle ?? r?.deviceTitle ?? "")
        : state === "connecting"
          ? "подключение…"
          : state === "lost"
            ? "связь потеряна"
            : "подключить";
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
