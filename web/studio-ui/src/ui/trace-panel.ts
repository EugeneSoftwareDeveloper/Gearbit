import { messages } from "../i18n";
import { icons } from "../icons";
import { isRecording, onRecordingChange } from "../measure/recorder";
import { listenTrace, spacedHex, type TraceLine } from "../trace";
import { h, icon } from "./dom";

const MAX_LINES = 300;

const M = messages({
  ru: {
    recordingTitle: "Идёт запись замеров",
    recording: "● Запись",
    measureTitle: "Кадры вручную, тест мощности, калибровка датчиков, запись",
    measure: "Замеры",
    pause: "Пауза",
    resume: "Дальше",
    clear: "Очистить",
    hide: "Свернуть журнал",
    title: "Журнал протокола",
    count: (n: number) => `${n} кадров · → ПК→робот, ← робот→ПК`,
  },
  en: {
    recordingTitle: "Recording measurements",
    recording: "● Recording",
    measureTitle: "Manual frames, power test, sensor calibration, recording",
    measure: "Measurements",
    pause: "Pause",
    resume: "Resume",
    clear: "Clear",
    hide: "Collapse the log",
    title: "Protocol log",
    count: (n) => `${n} frames · → PC→robot, ← robot→PC`,
  },
});

/**
 * Журнал протокола: байты между ПК и роботом. Нужен, чтобы разбираться с новыми прошивками
 * и моделями (docs/dev/adding-a-robot.md). Хаб присылает кадры, только пока панель открыта
 * (или идёт запись замеров). Отсюда же открывается помощник замеров.
 */
export function createTracePanel(openMeasure: () => void): { element: HTMLElement; toggle: () => void } {
  const body = h("div", { class: "trace-body", role: "log", "aria-live": "off" });
  const count = h("span", { class: "muted", style: "font-size:.8rem" });
  const recChip = h("span", { class: "chip rec hidden", title: M.recordingTitle }, M.recording);
  const measureBtn = h("button", { class: "btn small", title: M.measureTitle }, icon(icons.chip), M.measure);
  const pauseBtn = h("button", { class: "btn small ghost", title: M.pause }, icon(icons.pause), M.pause);
  const clearBtn = h("button", { class: "btn small ghost", title: M.clear }, icon(icons.trash), M.clear);
  const hideBtn = h("button", { class: "btn icon ghost", "aria-label": M.hide }, icon(icons.close));
  const element = h(
    "section",
    { class: "trace collapsed hidden", "aria-label": M.title },
    h(
      "div",
      { class: "trace-head" },
      icon(icons.log),
      h("h2", {}, M.title),
      count,
      recChip,
      h("div", { class: "spacer" }),
      measureBtn,
      pauseBtn,
      clearBtn,
      hideBtn,
    ),
    body,
  );

  let open = false;
  let paused = false;
  let total = 0;
  let unlisten: (() => void) | null = null;

  const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
  };

  const onLine = (line: TraceLine) => {
    const stick = body.scrollTop + body.clientHeight >= body.scrollHeight - 8;
    body.append(
      h(
        "div",
        { class: `trace-line ${line.dir}` },
        h("span", { class: "t" }, fmtTime(line.t)),
        h("span", { class: "dir" }, line.dir === "out" ? "→" : "←"),
        h("span", { class: "hex" }, spacedHex(line.hex)),
        h("span", { class: "note" }, line.note ?? ""),
      ),
    );
    while (body.childElementCount > MAX_LINES) body.firstElementChild?.remove();
    total++;
    count.textContent = M.count(total);
    if (stick) body.scrollTop = body.scrollHeight;
  };

  // Подписка общая (trace.ts): панель слушает, пока открыта и не на паузе.
  const sync = () => {
    const want = open && !paused;
    if (want && !unlisten) unlisten = listenTrace(onLine);
    if (!want && unlisten) {
      unlisten();
      unlisten = null;
    }
  };

  pauseBtn.onclick = () => {
    paused = !paused;
    pauseBtn.replaceChildren(icon(paused ? icons.play : icons.pause), paused ? M.resume : M.pause);
    sync();
  };
  clearBtn.onclick = () => {
    body.replaceChildren();
    total = 0;
    count.textContent = "";
  };
  measureBtn.onclick = openMeasure;

  onRecordingChange((recording) => recChip.classList.toggle("hidden", !recording));
  recChip.classList.toggle("hidden", !isRecording());

  const toggle = () => {
    open = !open;
    element.classList.toggle("hidden", !open);
    element.classList.toggle("collapsed", !open);
    sync();
  };
  hideBtn.onclick = toggle;

  return { element, toggle };
}
