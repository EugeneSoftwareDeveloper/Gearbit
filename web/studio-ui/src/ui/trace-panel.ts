import { hub } from "../hub";
import { icons } from "../icons";
import { h, icon } from "./dom";

interface TraceLine {
  dir: "out" | "in";
  hex: string;
  note: string | null;
  t: number;
}

const MAX_LINES = 300;

/**
 * Журнал протокола: байты между ПК и роботом. Нужен, чтобы разбираться с новыми прошивками
 * и моделями (docs/dev/adding-a-robot.md). Подписка на хабе включается, только пока панель открыта.
 */
export function createTracePanel(): { element: HTMLElement; toggle: () => void } {
  const body = h("div", { class: "trace-body", role: "log", "aria-live": "off" });
  const count = h("span", { class: "muted", style: "font-size:.8rem" });
  const pauseBtn = h("button", { class: "btn small ghost", title: "Пауза" }, icon(icons.pause), "Пауза");
  const clearBtn = h("button", { class: "btn small ghost", title: "Очистить" }, icon(icons.trash), "Очистить");
  const hideBtn = h("button", { class: "btn icon ghost", "aria-label": "Свернуть журнал" }, icon(icons.close));
  const element = h(
    "section",
    { class: "trace collapsed hidden", "aria-label": "Журнал протокола" },
    h("div", { class: "trace-head" }, icon(icons.log), h("h2", {}, "Журнал протокола"), count, h("div", { class: "spacer" }), pauseBtn, clearBtn, hideBtn),
    body,
  );

  let open = false;
  let paused = false;
  let total = 0;

  const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
  };
  const fmtHex = (hex: string) => hex.replace(/(..)(?!$)/g, "$1 ");

  hub.on("robot.trace", (line: TraceLine) => {
    if (!open || paused) return;
    const stick = body.scrollTop + body.clientHeight >= body.scrollHeight - 8;
    body.append(
      h(
        "div",
        { class: `trace-line ${line.dir}` },
        h("span", { class: "t" }, fmtTime(line.t)),
        h("span", { class: "dir" }, line.dir === "out" ? "→" : "←"),
        h("span", { class: "hex" }, fmtHex(line.hex)),
        h("span", { class: "note" }, line.note ?? ""),
      ),
    );
    while (body.childElementCount > MAX_LINES) body.firstElementChild?.remove();
    total++;
    count.textContent = `${total} кадров · → ПК→робот, ← робот→ПК`;
    if (stick) body.scrollTop = body.scrollHeight;
  });

  const subscribe = () => void hub.call("trace.subscribe", { enabled: open && !paused }).catch(() => undefined);
  hub.on("hub.connected", () => open && subscribe());

  pauseBtn.onclick = () => {
    paused = !paused;
    pauseBtn.replaceChildren(icon(paused ? icons.play : icons.pause), paused ? "Дальше" : "Пауза");
    subscribe();
  };
  clearBtn.onclick = () => {
    body.replaceChildren();
    total = 0;
    count.textContent = "";
  };

  const toggle = () => {
    open = !open;
    element.classList.toggle("hidden", !open);
    element.classList.toggle("collapsed", !open);
    subscribe();
  };
  hideBtn.onclick = toggle;

  return { element, toggle };
}
