import { icons } from "../icons";
import { h, icon } from "../ui/dom";
import { toast } from "../ui/toasts";
import { copyText } from "./clipboard";
import { powerByte, STOP_HEX, stateFrame } from "./frames";
import type { MeasureContext } from "./helper";
import { addMark } from "./recorder";

/**
 * Тест мощности (чек-лист, п. 12): один мотор по очереди получает байты мощности из списка,
 * а человек отмечает, как крутится колесо. Так находится настоящий диапазон устройства
 * (сейчас в devices/tudao-superbot.json безопасная заглушка ±10).
 */

const RESULTS = ["—", "стоит", "еле крутится", "медленно", "быстрее", "так же", "рывками"];
const STEP_RESEND_MS = 250;
const PAUSE_MS = 1000;
const MAX_STEPS = 12;

interface Run {
  cancelled: boolean;
  wake: (() => void) | null;
}

export function createPowerTab(ctx: MeasureContext): { element: HTMLElement; stop(): void } {
  const motor = h(
    "select",
    { "aria-label": "Мотор" },
    h("option", { value: "0" }, "M1"),
    h("option", { value: "1" }, "M2"),
    h("option", { value: "2" }, "M3"),
  );
  const direction = h("select", { "aria-label": "Направление" }, h("option", { value: "1" }, "плюс (+)"), h("option", { value: "-1" }, "минус (−)"));
  const values = h("input", { class: "text-input", type: "text", value: "5, 10, 20, 50, 100", "aria-label": "Значения мощности через запятую" });
  const seconds = h("input", { class: "text-input", type: "number", min: 1, max: 10, step: 1, value: 3, "aria-label": "Секунд на шаг" });
  const runBtn = h("button", { class: "btn primary" }, icon(icons.play), "Запустить");
  const abortBtn = h("button", { class: "btn hidden" }, icon(icons.stop), "Прервать");
  const copyBtn = h("button", { class: "btn small", disabled: true }, "Скопировать результаты");
  const progress = h("p", { class: "muted" }, "");
  const rows = h("tbody");

  let run: Run | null = null;
  let steps: { value: number; result: string }[] = [];
  let setup = { motor: "M1", sign: 1, seconds: 3 };

  const wait = (r: Run, ms: number) =>
    new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, ms);
      r.wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });

  /** «5, 10 20» → [5, 10, 20]; ошибка — текст для ребёнка и взрослого. */
  const parse = (): number[] | string => {
    const parts = values.value.split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) return "Впишите значения мощности через запятую, например 5, 10, 20.";
    if (parts.length > MAX_STEPS) return `Не больше ${MAX_STEPS} значений за один тест.`;
    const list = parts.map(Number);
    if (list.some((n) => !Number.isInteger(n) || n < 1 || n > 127)) return "Мощность — целые числа от 1 до 127 (знак задаёт «Направление».)";
    return list;
  };

  const renderRows = (active: number | null) => {
    rows.replaceChildren(
      ...steps.map((step, i) => {
        const result = h("select", { "aria-label": `Как крутилось на ${step.value}` }, ...RESULTS.map((r) => h("option", { value: r }, r)));
        result.value = step.result;
        result.addEventListener("change", () => {
          step.result = result.value;
          copyBtn.disabled = false;
        });
        const value = setup.sign * step.value;
        return h(
          "tr",
          { class: i === active ? "active" : "" },
          h("td", {}, String(i + 1)),
          h("td", { class: "mono" }, `${value > 0 ? "+" : ""}${value}`),
          h("td", { class: "mono muted" }, `0x${powerByte(value)}`),
          h("td", {}, result),
        );
      }),
    );
  };

  const setRunning = (running: boolean) => {
    runBtn.classList.toggle("hidden", running);
    abortBtn.classList.toggle("hidden", !running);
    for (const el of [motor, direction, values, seconds]) el.disabled = running;
  };

  const start = async () => {
    const list = parse();
    if (typeof list === "string") {
      toast(list, "error");
      return;
    }
    if (!(await ctx.ensureService())) return;
    const slot = Number(motor.value);
    setup = { motor: `M${slot + 1}`, sign: Number(direction.value), seconds: Math.max(1, Math.min(10, Number(seconds.value) || 3)) };
    steps = list.map((value) => ({ value, result: "—" }));
    copyBtn.disabled = true;
    const r: Run = { cancelled: false, wake: null };
    run = r;
    setRunning(true);
    addMark("Тест мощности: старт", { ...setup, values: list });
    try {
      for (let i = 0; i < steps.length && !r.cancelled; i++) {
        const power = setup.sign * steps[i]!.value;
        const motors = [0, 0, 0];
        motors[slot] = power;
        const frame = stateFrame(motors);
        progress.textContent = `Шаг ${i + 1} из ${steps.length}: ${setup.motor} = ${power > 0 ? "+" : ""}${power} (0x${powerByte(power)}). Смотрите на колесо.`;
        renderRows(i);
        // Кадр повторяем: прошивка может останавливать моторы без новых кадров (п. 8).
        const end = performance.now() + setup.seconds * 1000;
        while (!r.cancelled && performance.now() < end) {
          await ctx.send(frame);
          await wait(r, STEP_RESEND_MS);
        }
        await ctx.send(STOP_HEX);
        if (!r.cancelled) await wait(r, PAUSE_MS);
      }
      progress.textContent = r.cancelled
        ? "Тест прерван, моторы остановлены."
        : "Готово. Отметьте в таблице, как крутилось колесо на каждом шаге, и скопируйте результаты.";
    } catch (e) {
      progress.textContent = "Тест остановлен.";
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      // Чем бы ни кончилось — моторы в 0. Если замеры уже закончены, хаб сам остановил робота.
      await ctx.send(STOP_HEX).catch(() => undefined);
      if (run === r) run = null;
      setRunning(false);
      renderRows(null);
      copyBtn.disabled = false;
    }
  };

  const results = () => ({ ...setup, steps: steps.map((s) => ({ power: setup.sign * s.value, hex: `0x${powerByte(setup.sign * s.value)}`, result: s.result })) });

  runBtn.onclick = () => void start();
  const stop = () => {
    if (!run) return;
    run.cancelled = true;
    run.wake?.();
  };
  abortBtn.onclick = stop;
  copyBtn.onclick = async () => {
    const data = results();
    addMark("Тест мощности: результаты", data);
    const text = [
      `Тест мощности ${data.motor}, ${data.seconds} с на шаг`,
      ...data.steps.map((s) => `${s.power > 0 ? "+" : ""}${s.power} (${s.hex}): ${s.result}`),
    ].join("\n");
    if (await copyText(text)) toast("Результаты скопированы — вставьте их в чек-лист (п. 12)", "ok");
  };

  const element = h(
    "section",
    { class: "measure-panel" },
    h(
      "p",
      { class: "muted" },
      "Найдём, какую мощность понимает робот. Поставьте его на подставку: колёса должны крутиться в воздухе. Мотор получает каждое значение по очереди, между шагами — пауза. Отмечайте, как крутится колесо: где оно перестаёт ускоряться, там и предел.",
    ),
    h(
      "div",
      { class: "measure-form" },
      h("label", {}, h("span", {}, "Мотор"), motor),
      h("label", {}, h("span", {}, "Направление"), direction),
      h("label", { class: "grow" }, h("span", {}, "Значения (1–127)"), values),
      h("label", {}, h("span", {}, "Секунд на шаг"), seconds),
    ),
    h("div", { class: "frame-actions" }, runBtn, abortBtn, h("div", { class: "spacer" }), copyBtn),
    progress,
    h(
      "table",
      { class: "measure-table" },
      h("thead", {}, h("tr", {}, h("th", {}, "№"), h("th", {}, "Мощность"), h("th", {}, "Байт"), h("th", {}, "Как крутилось"))),
      rows,
    ),
  );
  return { element, stop };
}
