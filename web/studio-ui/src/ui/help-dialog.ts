import { icons } from "../icons";
import { h, icon } from "./dom";

const SHORTCUTS: [string[], string][] = [
  [["W", "↑"], "Вперёд"],
  [["S", "↓"], "Назад"],
  [["A", "D"], "Повернуть (вместе с W/S — плавная дуга)"],
  [["Q", "E"], "Разворот на месте"],
  [["Пробел", "Esc"], "СТОП — остановить все моторы"],
  [["F1"], "Эта подсказка"],
];

const GAMEPAD: [string, string][] = [
  ["Левый стик", "Газ и поворот — чем дальше, тем быстрее"],
  ["Крестовина", "Как стрелки на клавиатуре"],
  ["B / ○ / Start", "СТОП"],
];

/** Подсказки: клавиши, геймпад и правила безопасности. */
export function createHelpDialog(): { open: () => void } {
  const closeBtn = h("button", { class: "btn icon ghost", "aria-label": "Закрыть" }, icon(icons.close));
  const keys = h("div", { class: "shortcuts" });
  for (const [combo, text] of SHORTCUTS) {
    keys.append(h("div", {}, ...combo.flatMap((k, i) => [i ? " " : "", h("kbd", {}, k)])), h("span", {}, text));
  }
  const pad = h("div", { class: "shortcuts" });
  for (const [k, text] of GAMEPAD) pad.append(h("kbd", {}, k), h("span", {}, text));

  const dialog = h(
    "dialog",
    { "aria-labelledby": "help-title" },
    h("header", { class: "dialog-head" }, icon(icons.help), h("h2", { id: "help-title" }, "Как управлять"), closeBtn),
    h(
      "div",
      { class: "dialog-body" },
      h("h3", { style: "margin:0" }, "Клавиатура"),
      keys,
      h("h3", { style: "margin:8px 0 0" }, "Геймпад (Xbox, PlayStation)"),
      pad,
      h("h3", { style: "margin:8px 0 0" }, "Безопасность"),
      h(
        "ul",
        { style: "margin:0;padding-left:20px;display:grid;gap:4px" },
        h("li", {}, "Робот едет, только пока зажата кнопка. Отпустили — остановился."),
        h("li", {}, "Если пульт завис или вкладку закрыли, хаб сам остановит робота."),
        h("li", {}, "СТОП работает всегда, даже когда роботом управляет программа."),
        h("li", {}, "Для детей включён предел мощности — его меняют в настройках (шестерёнка)."),
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
