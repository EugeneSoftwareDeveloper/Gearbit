import { icons } from "../icons";
import { h, icon } from "./dom";

type Kind = "info" | "ok" | "error" | "safety";

const container = h("div", { class: "toasts", role: "status", "aria-live": "polite" });
document.body.append(container);
const recent = new Map<string, number>();

/** Короткое уведомление сверху. Одинаковые сообщения не повторяются чаще раза в 3 секунды. */
export function toast(message: string, kind: Kind = "info", ms = 3500): void {
  const now = Date.now();
  if ((recent.get(message) ?? 0) > now - 3000) return;
  recent.set(message, now);

  const glyph = kind === "ok" ? icons.check : kind === "info" ? icons.info : kind === "safety" ? icons.stop : icons.alert;
  const el = h("div", { class: `toast ${kind}` }, icon(glyph), h("span", {}, message));
  container.append(el);
  window.setTimeout(() => {
    el.classList.add("leaving");
    window.setTimeout(() => el.remove(), 250);
  }, ms);
}
