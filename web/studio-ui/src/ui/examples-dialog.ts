import { messages } from "../i18n";
import { icons } from "../icons";
import { h, icon } from "./dom";

const M = messages({
  ru: { close: "Закрыть", title: "Примеры программ" },
  en: { close: "Close", title: "Example programs" },
});

/** Пример программы: заголовок и одна строка о том, что он делает. */
export interface ExampleCard {
  title: string;
  text: string;
}

/** Окно «Примеры программ» с карточками. Выбор примера закрывает окно и вызывает onPick. */
export function createExamplesDialog<T extends ExampleCard>(examples: readonly T[], hint: string, onPick: (example: T) => void): { open: () => void } {
  const closeBtn = h("button", { class: "btn icon ghost", "aria-label": M.close }, icon(icons.close));
  const grid = h("div", { class: "examples" });
  const titleId = `examples-title-${Math.random().toString(36).slice(2, 8)}`;
  const dialog = h(
    "dialog",
    { class: "wide", "aria-labelledby": titleId },
    h("header", { class: "dialog-head" }, icon(icons.book), h("h2", { id: titleId }, M.title), closeBtn),
    h("div", { class: "dialog-body" }, h("p", { class: "muted", style: "margin:0" }, hint), grid),
  );
  for (const example of examples) {
    grid.append(
      h(
        "button",
        {
          class: "example",
          onclick: () => {
            dialog.close();
            onPick(example);
          },
        },
        h("strong", {}, example.title),
        h("span", {}, example.text),
      ),
    );
  }
  document.body.append(dialog);
  closeBtn.onclick = () => dialog.close();
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  return { open: () => dialog.showModal() };
}
