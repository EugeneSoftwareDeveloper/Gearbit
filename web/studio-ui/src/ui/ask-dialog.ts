import { icons } from "../icons";
import { h, icon } from "./dom";

/**
 * Свои окна вместо window.prompt/confirm/alert: в стиле приложения, с тёмной темой и по-русски.
 * Используются редактором блоков (имя переменной, «удалить все блоки?»).
 */

interface Options {
  title: string;
  message?: string;
  input?: string | null;
  ok?: string;
  cancel?: string | null;
  danger?: boolean;
}

function open(options: Options): Promise<string | null> {
  return new Promise((resolve) => {
    const field =
      options.input !== undefined && options.input !== null
        ? h("input", { class: "text-input", type: "text", value: options.input, maxlength: 60, "aria-label": options.title })
        : null;
    const okBtn = h("button", { class: `btn ${options.danger ? "danger" : "primary"}`, type: "submit" }, options.ok ?? "OK");
    const cancelBtn = options.cancel === null ? null : h("button", { class: "btn ghost", type: "button" }, options.cancel ?? "Отмена");
    const form = h(
      "form",
      { method: "dialog" },
      h("header", { class: "dialog-head" }, icon(options.danger ? icons.alert : icons.info), h("h2", {}, options.title)),
      h("div", { class: "dialog-body" }, options.message ? h("p", { style: "margin:0" }, options.message) : null, field),
      h("footer", { class: "dialog-foot" }, cancelBtn, okBtn),
    );
    const dialog = h("dialog", { class: "ask-dialog" }, form);
    document.body.append(dialog);

    let result: string | null = null;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      result = field ? field.value : "ok";
      dialog.close();
    });
    cancelBtn?.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(result);
    });
    dialog.showModal();
    if (field) {
      field.focus();
      field.select();
    } else {
      okBtn.focus();
    }
  });
}

/** Спросить строку. null — нажали «Отмена» или Esc. */
export function askText(title: string, message: string, initial = ""): Promise<string | null> {
  return open({ title, message, input: initial, ok: "Готово" });
}

export async function askConfirm(title: string, message: string, ok = "Да", danger = false): Promise<boolean> {
  return (await open({ title, message, ok, danger })) !== null;
}

export async function showAlert(title: string, message: string): Promise<void> {
  await open({ title, message, ok: "Понятно", cancel: null });
}
