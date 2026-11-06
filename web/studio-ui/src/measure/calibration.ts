import { hub } from "../hub";
import { icons } from "../icons";
import { displayName, store, type Telemetry } from "../model";
import { h, icon } from "../ui/dom";
import { toast } from "../ui/toasts";
import { copyText } from "./clipboard";
import { addMark } from "./recorder";

/**
 * Калибровка датчика расстояния (чек-лист, п. 15–16): препятствие на известном расстоянии → уровень 0..6.
 * Робот стоит, моторы не включаются: только слушаем телеметрию. Итог — массив levelToCm
 * для profiles/superbot-car.json (уровень = индекс, значение — сантиметры).
 */

const DISTANCES: (number | null)[] = [5, 10, 15, 20, 30, 40, 60, null];
const SAMPLE_MS = 1500;
const LEVELS = 7;

interface Sample {
  cm: number | null;
  mode: number | null;
  min: number | null;
  max: number | null;
  count: number;
}

/** Самое частое значение (при равенстве — меньшее). */
function mode(values: number[]): number | null {
  if (!values.length) return null;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
}

/**
 * Уровень → сантиметры. Для замеренных уровней — среднее расстояние, между ними — по прямой,
 * за краями — ближайшее известное. null — замеров меньше двух уровней.
 */
export function levelToCm(samples: readonly Sample[]): number[] | null {
  const byLevel = new Map<number, number[]>();
  for (const s of samples) {
    if (s.cm === null || s.mode === null) continue;
    byLevel.set(s.mode, [...(byLevel.get(s.mode) ?? []), s.cm]);
  }
  const known = [...byLevel].map(([level, cms]) => [level, cms.reduce((a, b) => a + b, 0) / cms.length] as const).sort((a, b) => a[0] - b[0]);
  if (known.length < 2) return null;
  return Array.from({ length: LEVELS }, (_, level) => {
    const exact = known.find(([l]) => l === level);
    if (exact) return Math.round(exact[1]);
    const below = [...known].reverse().find(([l]) => l < level);
    const above = known.find(([l]) => l > level);
    if (!below) return Math.round(above![1]);
    if (!above) return Math.round(below[1]);
    const k = (level - below[0]) / (above[0] - below[0]);
    return Math.round(below[1] + k * (above[1] - below[1]));
  });
}

export function createCalibrationTab(): { element: HTMLElement; stop(): void } {
  const sensor = h("select", { "aria-label": "Датчик" });
  const live = h("span", { class: "live-level" }, "—");
  const rows = h("tbody");
  const snippet = h("pre", { class: "hex-preview snippet" });
  const copyBtn = h("button", { class: "btn small", disabled: true }, "Скопировать");

  let samples: Sample[] = [];
  let cancel: (() => void) | null = null;

  const sensorId = () => sensor.value;

  /** Собрать уровни выбранного датчика за SAMPLE_MS. */
  const sample = (id: string) =>
    new Promise<number[] | null>((resolve) => {
      const values: number[] = [];
      const first = store.state.telemetry?.distances[id];
      if (typeof first === "number") values.push(first);
      const off = hub.on("robot.telemetry", (t: Telemetry) => {
        const v = t.distances[id];
        if (typeof v === "number") values.push(v);
      });
      const timer = window.setTimeout(() => finish(values), SAMPLE_MS);
      const finish = (result: number[] | null) => {
        clearTimeout(timer);
        off();
        cancel = null;
        resolve(result);
      };
      cancel = () => finish(null);
    });

  const render = () => {
    rows.replaceChildren(
      ...DISTANCES.map((cm, i) => {
        const s = samples[i];
        const button = h("button", { class: "btn small", disabled: cancel !== null }, s?.count ? "Ещё раз" : "Замерить");
        button.onclick = () => void measure(i);
        const result =
          !s ? "—" : s.mode === null ? "нет данных" : `${s.mode}${s.min !== s.max ? ` (${s.min}–${s.max})` : ""}`;
        return h("tr", {}, h("td", {}, cm === null ? "Нет препятствия" : `${cm} см`), h("td", { class: "mono" }, result), h("td", {}, button));
      }),
    );
    const table = levelToCm(samples);
    copyBtn.disabled = !table;
    snippet.textContent = table
      ? `"${sensorId()}": { "levelToCm": [${table.join(", ")}] }`
      : "Замерьте хотя бы два расстояния, которые дают разные уровни.";
  };

  const measure = async (index: number) => {
    const robot = store.state.robot;
    const id = sensorId();
    if (robot?.state !== "connected" || !id) {
      toast("Сначала подключите робота с датчиком расстояния.", "error");
      return;
    }
    const cm = DISTANCES[index]!;
    const rowsBusy = rows.querySelectorAll("button");
    rowsBusy.forEach((b) => (b.disabled = true));
    const values = await sample(id);
    if (values === null) {
      render();
      return;
    }
    const s: Sample = { cm, mode: mode(values), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null, count: values.length };
    samples[index] = s;
    if (s.mode === null) toast("Датчик не прислал уровней: он подключён? В карточке «Датчики» видны числа?", "error", 6000);
    addMark(`Калибровка ${id}: ${cm === null ? "нет препятствия" : `${cm} см`}`, { sensor: id, ...s, values });
    render();
  };

  // Список датчиков и живой уровень выбранного.
  let signature = "";
  store.subscribe((st) => {
    const sensors = st.robot?.components.filter((c) => c.kind === "distance") ?? [];
    const sig = sensors.map((c) => `${c.id}:${displayName(c)}`).join("|");
    if (sig !== signature) {
      signature = sig;
      const was = sensor.value;
      sensor.replaceChildren(...sensors.map((c) => h("option", { value: c.id }, `${displayName(c)} (${c.id})`)));
      if (sensors.some((c) => c.id === was)) sensor.value = was;
      if (sensor.value !== was) {
        samples = [];
        render();
      }
    }
    const level = st.telemetry?.distances[sensorId()];
    live.textContent = level === null || level === undefined ? "—" : `${level} / 6`;
  });
  sensor.addEventListener("change", () => {
    samples = [];
    render();
  });

  copyBtn.onclick = async () => {
    const table = levelToCm(samples);
    if (!table) return;
    addMark(`Калибровка ${sensorId()}: итог`, { sensor: sensorId(), levelToCm: table });
    if (await copyText(snippet.textContent ?? "")) toast("Скопировано — вставьте в profiles/superbot-car.json → calibration.distance", "ok", 6000);
  };

  render();

  const element = h(
    "section",
    { class: "measure-panel" },
    h(
      "p",
      { class: "muted" },
      "Узнаем, сколько сантиметров означает каждый уровень датчика. Робот стоит на месте, моторы не включаются. Поставьте коробку или книгу прямо перед датчиком на нужное расстояние (меряйте линейкой от датчика) и нажмите «Замерить» — полторы секунды не двигайте ничего.",
    ),
    h("div", { class: "measure-form" }, h("label", {}, h("span", {}, "Датчик"), sensor), h("div", { class: "live" }, h("span", { class: "muted" }, "Сейчас:"), live)),
    h(
      "table",
      { class: "measure-table" },
      h("thead", {}, h("tr", {}, h("th", {}, "Препятствие"), h("th", {}, "Уровень"), h("th", {}, ""))),
      rows,
    ),
    h("div", { class: "frame-actions" }, h("h3", {}, "Для профиля сборки"), h("div", { class: "spacer" }), copyBtn),
    snippet,
    h("p", { class: "muted" }, icon(icons.info), " Уровень — самое частое значение за замер, в скобках — разброс."),
  );
  return {
    element,
    stop: () => cancel?.(),
  };
}
