import { hub } from "../hub";
import { icons } from "../icons";
import { displayName, store, type Telemetry } from "../model";
import { h, icon } from "../ui/dom";
import { toast } from "../ui/toasts";
import { copyText } from "./clipboard";
import { addMark } from "./recorder";

/**
 * Калибровка датчика расстояния (чек-лист, п. 15–16): препятствие на известном расстоянии → уровень 0..6.
 * Второй замер — порог линии: датчик смотрит в пол, уровень над белым листом и над чёрной линией.
 * Робот стоит, моторы не включаются: только слушаем телеметрию. Итог — levelToCm и lineLevel
 * для profiles/superbot-car.json (calibration.distance).
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

type Floor = "white" | "black";

/**
 * Порог линии по замерам над белым и над чёрным: с какого уровня датчик видит чёрное.
 * Берём середину между самым тёмным «белым» и самым светлым «чёрным». problem — что пошло не так.
 */
export function lineLevel(white: Sample | undefined, black: Sample | undefined): { level: number | null; problem: string | null } {
  if (white?.max == null || black?.min == null || white.mode === null || black.mode === null) return { level: null, problem: null };
  if (black.mode < white.mode) {
    return {
      level: null,
      problem: "Над чёрным уровень меньше, чем над белым, а Gearbit считает наоборот. Сохраните запись замеров и допишите находку в docs/PROTOCOL-SUPERBOT.md.",
    };
  }
  if (black.min <= white.max) {
    return { level: null, problem: "Белое и чёрное дают одинаковые уровни. Опустите датчик ближе к полу (примерно на 1 см) и замерьте снова." };
  }
  return { level: Math.max(white.max + 1, Math.ceil((white.max + black.min) / 2)), problem: null };
}

const FLOORS: { id: Floor; title: string }[] = [
  { id: "white", title: "Белый лист" },
  { id: "black", title: "Чёрная линия" },
];

export function createCalibrationTab(): { element: HTMLElement; stop(): void } {
  const sensor = h("select", { "aria-label": "Датчик" });
  const live = h("span", { class: "live-level" }, "—");
  const rows = h("tbody");
  const lineRows = h("tbody");
  const lineNote = h("p", { class: "muted hidden" });
  const snippet = h("pre", { class: "hex-preview snippet" });
  const copyBtn = h("button", { class: "btn small", disabled: true }, "Скопировать");

  let samples: Sample[] = [];
  let floor: Partial<Record<Floor, Sample>> = {};
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

  const shown = (s: Sample | undefined) => (!s ? "—" : s.mode === null ? "нет данных" : `${s.mode}${s.min !== s.max ? ` (${s.min}–${s.max})` : ""}`);
  const button = (s: Sample | undefined, onclick: () => void) =>
    h("button", { class: "btn small", disabled: cancel !== null, onclick }, s?.count ? "Ещё раз" : "Замерить");

  /** Что вставить в профиль сборки: таблица сантиметров и порог линии — то, что уже замерено. */
  const outcome = () => {
    const table = levelToCm(samples);
    const line = lineLevel(floor.white, floor.black);
    const parts = [table ? `"levelToCm": [${table.join(", ")}]` : null, line.level !== null ? `"lineLevel": ${line.level}` : null].filter((p) => p !== null);
    return { table, line, parts };
  };

  const render = () => {
    rows.replaceChildren(
      ...DISTANCES.map((cm, i) =>
        h("tr", {}, h("td", {}, cm === null ? "Нет препятствия" : `${cm} см`), h("td", { class: "mono" }, shown(samples[i])), h("td", {}, button(samples[i], () => void measure(i)))),
      ),
    );
    lineRows.replaceChildren(
      ...FLOORS.map((f) => h("tr", {}, h("td", {}, f.title), h("td", { class: "mono" }, shown(floor[f.id])), h("td", {}, button(floor[f.id], () => void measureFloor(f.id))))),
    );
    const { line, parts } = outcome();
    lineNote.classList.toggle("hidden", !line.problem && line.level === null);
    lineNote.textContent = line.problem ?? (line.level !== null ? `Датчик видит чёрное, начиная с уровня ${line.level}.` : "");
    copyBtn.disabled = !parts.length;
    snippet.textContent = parts.length
      ? `"${sensorId()}": { ${parts.join(", ")} }`
      : "Замерьте хотя бы два расстояния с разными уровнями или белый лист и чёрную линию.";
  };

  /** Замер выбранного датчика; null — отменён или робот не подключён. */
  const take = async (what: string, cm: number | null): Promise<Sample | null> => {
    const robot = store.state.robot;
    const id = sensorId();
    if (robot?.state !== "connected" || !id) {
      toast("Сначала подключите робота с датчиком расстояния.", "error");
      return null;
    }
    element.querySelectorAll<HTMLButtonElement>(".measure-table button").forEach((b) => (b.disabled = true));
    const values = await sample(id);
    if (values === null) return null;
    const s: Sample = { cm, mode: mode(values), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null, count: values.length };
    if (s.mode === null) toast("Датчик не прислал уровней: он подключён? В карточке «Датчики» видны числа?", "error", 6000);
    addMark(`Калибровка ${id}: ${what}`, { sensor: id, ...s, values });
    return s;
  };

  const measure = async (index: number) => {
    const cm = DISTANCES[index]!;
    const s = await take(cm === null ? "нет препятствия" : `${cm} см`, cm);
    if (s) samples[index] = s;
    render();
  };

  const measureFloor = async (kind: Floor) => {
    const s = await take(kind === "white" ? "белый лист" : "чёрная линия", null);
    if (s) floor[kind] = s;
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
        floor = {};
        render();
      }
    }
    const level = st.telemetry?.distances[sensorId()];
    live.textContent = level === null || level === undefined ? "—" : `${level} / 6`;
  });
  sensor.addEventListener("change", () => {
    samples = [];
    floor = {};
    render();
  });

  copyBtn.onclick = async () => {
    const { table, line, parts } = outcome();
    if (!parts.length) return;
    addMark(`Калибровка ${sensorId()}: итог`, { sensor: sensorId(), levelToCm: table, lineLevel: line.level });
    if (await copyText(snippet.textContent ?? "")) toast("Скопировано — вставьте в profiles/superbot-car.json → calibration.distance", "ok", 6000);
  };

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
    h("h3", {}, "Порог линии"),
    h(
      "p",
      { class: "muted" },
      "Для езды по линии датчик смотрит в пол. Направьте его вниз примерно в 1 см над белым листом и нажмите «Замерить» напротив «Белый лист». Потом подвиньте лист так, чтобы под датчиком была чёрная линия (изолента или толстый маркер), и замерьте ещё раз.",
    ),
    h(
      "table",
      { class: "measure-table" },
      h("thead", {}, h("tr", {}, h("th", {}, "Под датчиком"), h("th", {}, "Уровень"), h("th", {}, ""))),
      lineRows,
    ),
    lineNote,
    h("div", { class: "frame-actions" }, h("h3", {}, "Для профиля сборки"), h("div", { class: "spacer" }), copyBtn),
    snippet,
    h("p", { class: "muted" }, icon(icons.info), " Уровень — самое частое значение за замер, в скобках — разброс."),
  );
  render();
  return {
    element,
    stop: () => cancel?.(),
  };
}
