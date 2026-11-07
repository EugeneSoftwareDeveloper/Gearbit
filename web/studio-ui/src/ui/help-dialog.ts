import { messages } from "../i18n";
import { icons } from "../icons";
import { h, icon } from "./dom";

const M = messages({
  ru: {
    shortcuts: [
      [["W", "↑"], "Вперёд"],
      [["S", "↓"], "Назад"],
      [["A", "D"], "Повернуть (вместе с W/S — плавная дуга)"],
      [["Q", "E"], "Разворот на месте"],
      [["Пробел", "Esc"], "СТОП — остановить все моторы"],
      [["F1"], "Эта подсказка"],
    ] as [string[], string][],
    gamepad: [
      ["Левый стик", "Газ и поворот — чем дальше, тем быстрее"],
      ["Крестовина", "Как стрелки на клавиатуре"],
      ["B / ○ / Start", "СТОП"],
    ] as [string, string][],
    close: "Закрыть",
    title: "Как управлять",
    keyboard: "Клавиатура",
    gamepadTitle: "Геймпад (Xbox, PlayStation)",
    safety: "Безопасность",
    rules: [
      "Робот едет, только пока зажата кнопка. Отпустили — остановился.",
      "Если пульт завис или вкладку закрыли, хаб сам остановит робота.",
      "СТОП работает всегда, даже когда роботом управляет программа.",
      "Программа из блоков останавливается, если перейти на другую вкладку или свернуть окно.",
      "Для детей включён предел мощности — его меняют в настройках (шестерёнка).",
    ],
  },
  en: {
    shortcuts: [
      [["W", "↑"], "Forward"],
      [["S", "↓"], "Backward"],
      [["A", "D"], "Turn (with W/S — a smooth curve)"],
      [["Q", "E"], "Spin in place"],
      [["Space", "Esc"], "STOP — stop all motors"],
      [["F1"], "This help"],
    ],
    gamepad: [
      ["Left stick", "Speed and turning — the further, the faster"],
      ["D-pad", "Like the arrow keys"],
      ["B / ○ / Start", "STOP"],
    ],
    close: "Close",
    title: "How to drive",
    keyboard: "Keyboard",
    gamepadTitle: "Gamepad (Xbox, PlayStation)",
    safety: "Safety",
    rules: [
      "The robot drives only while you hold a button. Let go — it stops.",
      "If the remote freezes or the tab is closed, the hub stops the robot by itself.",
      "STOP always works, even when a program drives the robot.",
      "A blocks program stops when you switch to another tab or minimize the window.",
      "A power limit is on for kids — change it in the settings (the gear).",
    ],
  },
});

const SHORTCUTS = M.shortcuts;
const GAMEPAD = M.gamepad;

/** Подсказки: клавиши, геймпад и правила безопасности. */
export function createHelpDialog(): { open: () => void } {
  const closeBtn = h("button", { class: "btn icon ghost", "aria-label": M.close }, icon(icons.close));
  const keys = h("div", { class: "shortcuts" });
  for (const [combo, text] of SHORTCUTS) {
    keys.append(h("div", {}, ...combo.flatMap((k, i) => [i ? " " : "", h("kbd", {}, k)])), h("span", {}, text));
  }
  const pad = h("div", { class: "shortcuts" });
  for (const [k, text] of GAMEPAD) pad.append(h("kbd", {}, k), h("span", {}, text));

  const dialog = h(
    "dialog",
    { "aria-labelledby": "help-title" },
    h("header", { class: "dialog-head" }, icon(icons.help), h("h2", { id: "help-title" }, M.title), closeBtn),
    h(
      "div",
      { class: "dialog-body" },
      h("h3", { style: "margin:0" }, M.keyboard),
      keys,
      h("h3", { style: "margin:8px 0 0" }, M.gamepadTitle),
      pad,
      h("h3", { style: "margin:8px 0 0" }, M.safety),
      h(
        "ul",
        { style: "margin:0;padding-left:20px;display:grid;gap:4px" },
        ...M.rules.map((rule) => h("li", {}, rule)),
      ),
    ),
  );
  document.body.append(dialog);
  closeBtn.onclick = () => dialog.close();
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });

  const open = () => {
    if (!dialog.open) dialog.showModal();
  };
  window.addEventListener("keydown", (e) => {
    if (e.key === "F1") {
      e.preventDefault();
      open();
    }
  });
  return { open };
}
