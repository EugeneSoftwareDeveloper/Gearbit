import { messages } from "../i18n";
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

const M = messages({
  ru: {
    results: ["—", "стоит", "еле крутится", "медленно", "быстрее", "так же", "рывками"],
    motor: "Мотор",
    direction: "Направление",
    plus: "плюс (+)",
    minus: "минус (−)",
    valuesLabel: "Значения мощности через запятую",
    values: "Значения (1–127)",
    secondsPerStep: "Секунд на шаг",
    run: "Запустить",
    abort: "Прервать",
    copy: "Скопировать результаты",
    enterValues: "Впишите значения мощности через запятую, например 5, 10, 20.",
    tooMany: (max: number) => `Не больше ${max} значений за один тест.`,
    badValue: "Мощность — целые числа от 1 до 127 (знак задаёт «Направление».)",
    howAt: (value: number) => `Как крутилось на ${value}`,
    markStart: "Тест мощности: старт",
    markResults: "Тест мощности: результаты",
    step: (n: number, total: number, frame: string) => `Шаг ${n} из ${total}: ${frame}. Смотрите на колесо.`,
    aborted: "Тест прерван, моторы остановлены.",
    done: "Готово. Отметьте в таблице, как крутилось колесо на каждом шаге, и скопируйте результаты.",
    stopped: "Тест остановлен.",
    copyHead: (motor: string, seconds: number) => `Тест мощности ${motor}, ${seconds} с на шаг`,
    copied: "Результаты скопированы — вставьте их в чек-лист (п. 12)",
    intro:
      "Найдём, какую мощность понимает робот. Поставьте его на подставку: колёса должны крутиться в воздухе. Мотор получает каждое значение по очереди, между шагами — пауза. Отмечайте, как крутится колесо: где оно перестаёт ускоряться, там и предел.",
    power: "Мощность",
    byte: "Байт",
    how: "Как крутилось",
  },
  en: {
    results: ["—", "stands still", "barely turns", "slow", "faster", "the same", "jerky"],
    motor: "Motor",
    direction: "Direction",
    plus: "plus (+)",
    minus: "minus (−)",
    valuesLabel: "Power values separated by commas",
    values: "Values (1–127)",
    secondsPerStep: "Seconds per step",
    run: "Run",
    abort: "Abort",
    copy: "Copy the results",
    enterValues: "Enter power values separated by commas, for example 5, 10, 20.",
    tooMany: (max) => `No more than ${max} values per test.`,
    badValue: "Power is a whole number from 1 to 127 (the sign is set by «Direction»).",
    howAt: (value) => `How it turned at ${value}`,
    markStart: "Power test: start",
    markResults: "Power test: results",
    step: (n, total, frame) => `Step ${n} of ${total}: ${frame}. Watch the wheel.`,
    aborted: "Test aborted, motors stopped.",
    done: "Done. Mark in the table how the wheel turned at each step and copy the results.",
    stopped: "Test stopped.",
    copyHead: (motor, seconds) => `Power test ${motor}, ${seconds} s per step`,
    copied: "Results copied — paste them into the checklist (item 12)",
    intro:
      "Let's find which power the robot understands. Put it on a stand so the wheels turn in the air. The motor gets each value in turn with a pause between steps. Mark how the wheel turns: where it stops speeding up, that is the limit.",
    power: "Power",
    byte: "Byte",
    how: "How it turned",
  },
});

const RESULTS = M.results;
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
    { "aria-label": M.motor },
    h("option", { value: "0" }, "M1"),
    h("option", { value: "1" }, "M2"),
    h("option", { value: "2" }, "M3"),
  );
  const direction = h("select", { "aria-label": M.direction }, h("option", { value: "1" }, M.plus), h("option", { value: "-1" }, M.minus));
  const values = h("input", { class: "text-input", type: "text", value: "5, 10, 20, 50, 100", "aria-label": M.valuesLabel });
  const seconds = h("input", { class: "text-input", type: "number", min: 1, max: 10, step: 1, value: 3, "aria-label": M.secondsPerStep });
  const runBtn = h("button", { class: "btn primary" }, icon(icons.play), M.run);
  const abortBtn = h("button", { class: "btn hidden" }, icon(icons.stop), M.abort);
  const copyBtn = h("button", { class: "btn small", disabled: true }, M.copy);
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
    if (!parts.length) return M.enterValues;
    if (parts.length > MAX_STEPS) return M.tooMany(MAX_STEPS);
    const list = parts.map(Number);
    if (list.some((n) => !Number.isInteger(n) || n < 1 || n > 127)) return M.badValue;
    return list;
  };

  const renderRows = (active: number | null) => {
    rows.replaceChildren(
      ...steps.map((step, i) => {
        const result = h("select", { "aria-label": M.howAt(step.value) }, ...RESULTS.map((r) => h("option", { value: r }, r)));
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
    addMark(M.markStart, { ...setup, values: list });
    try {
      for (let i = 0; i < steps.length && !r.cancelled; i++) {
        const power = setup.sign * steps[i]!.value;
        const motors = [0, 0, 0];
        motors[slot] = power;
        const frame = stateFrame(motors);
        progress.textContent = M.step(i + 1, steps.length, `${setup.motor} = ${power > 0 ? "+" : ""}${power} (0x${powerByte(power)})`);
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
        ? M.aborted
        : M.done;
    } catch (e) {
      progress.textContent = M.stopped;
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
    addMark(M.markResults, data);
    const text = [
      M.copyHead(data.motor, data.seconds),
      ...data.steps.map((s) => `${s.power > 0 ? "+" : ""}${s.power} (${s.hex}): ${s.result}`),
    ].join("\n");
    if (await copyText(text)) toast(M.copied, "ok");
  };

  const element = h(
    "section",
    { class: "measure-panel" },
    h(
      "p",
      { class: "muted" },
      M.intro,
    ),
    h(
      "div",
      { class: "measure-form" },
      h("label", {}, h("span", {}, M.motor), motor),
      h("label", {}, h("span", {}, M.direction), direction),
      h("label", { class: "grow" }, h("span", {}, M.values), values),
      h("label", {}, h("span", {}, M.secondsPerStep), seconds),
    ),
    h("div", { class: "frame-actions" }, runBtn, abortBtn, h("div", { class: "spacer" }), copyBtn),
    progress,
    h(
      "table",
      { class: "measure-table" },
      h("thead", {}, h("tr", {}, h("th", {}, "№"), h("th", {}, M.power), h("th", {}, M.byte), h("th", {}, M.how))),
      rows,
    ),
  );
  return { element, stop };
}
