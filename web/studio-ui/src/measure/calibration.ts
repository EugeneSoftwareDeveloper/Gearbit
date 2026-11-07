import { hub } from "../hub";
import { icons } from "../icons";
import { displayName, store, type Telemetry } from "../model";
import { h, icon } from "../ui/dom";
import { toast } from "../ui/toasts";
import { blindFrom, farLevel, levelToCm, lineLevel, mode, type Sample, type Samples, unseenNearLevels } from "./calibration-math";
import { copyText } from "./clipboard";
import { addMark } from "./recorder";

/**
 * Калибровка датчика расстояния (чек-лист, п. 15–16): препятствие на известном расстоянии → уровень 0..6.
 * Второй замер — порог линии: датчик смотрит в пол, уровень над белым листом и над чёрной линией.
 * Робот стоит, моторы не включаются: только слушаем телеметрию. Итог — levelToCm и lineLevel
 * для profiles/superbot-car.json (calibration.distance).
 */

/** Датчик SuperBot видит недалеко (замер 07.11.2026: 5 см — уже почти «ничего»), поэтому ближних точек больше. */
const DISTANCES: (number | null)[] = [1, 2, 3, 4, 5, 7, 10, 15, 20, 30, null];
const SAMPLE_MS = 1500;

type Floor = "white" | "black";

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
  const rangeNote = h("p", { class: "muted hidden" });
  const snippet = h("pre", { class: "hex-preview snippet" });
  const copyBtn = h("button", { class: "btn small", disabled: true }, "Скопировать");

  let samples: (Sample | undefined)[] = [];
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
  /** Уровень на расстоянии; «не видит» — такой же, как без препятствия. */
  const shownAt = (s: Sample | undefined, far: number | null) => (s && s.cm !== null && far !== null && s.mode === far ? `${shown(s)} — не видит` : shown(s));

  /** Что видно по замерам расстояний: где датчик слепнет и каких уровней не было. */
  const rangeText = (all: Samples) => {
    const parts: string[] = [];
    const blind = blindFrom(all);
    if (blind !== null) parts.push(`С ${blind} см и дальше датчик не замечает препятствие: уровень такой же, как без препятствия.`);
    const near = unseenNearLevels(all);
    if (levelToCm(all) && near.levels.length) {
      const which = near.levels.length === 1 ? "Уровня 0 не было" : `Уровней 0–${near.levels.length - 1} не было`;
      const hint = near.nearestCm !== null && near.nearestCm > 1 ? " Поставьте препятствие ближе." : "";
      parts.push(`${which} ни в одном замере — в таблице для них взято ближайшее расстояние.${hint}`);
    }
    return parts.join(" ");
  };
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
        h(
          "tr",
          {},
          h("td", {}, cm === null ? "Нет препятствия" : `${cm} см`),
          h("td", { class: "mono" }, shownAt(samples[i], farLevel(samples))),
          h("td", {}, button(samples[i], () => void measure(i))),
        ),
      ),
    );
    const range = rangeText(samples);
    rangeNote.classList.toggle("hidden", !range);
    rangeNote.textContent = range;
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
      "Узнаем, сколько сантиметров означает каждый уровень датчика. Робот стоит на месте, моторы не включаются. Поставьте коробку или книгу прямо перед датчиком на нужное расстояние (меряйте линейкой от датчика) и нажмите «Замерить» — полторы секунды не двигайте ничего. Датчик видит недалеко, поэтому начните с 1–5 см. Светлая коробка заметнее тёмной.",
    ),
    h("div", { class: "measure-form" }, h("label", {}, h("span", {}, "Датчик"), sensor), h("div", { class: "live" }, h("span", { class: "muted" }, "Сейчас:"), live)),
    h(
      "table",
      { class: "measure-table" },
      h("thead", {}, h("tr", {}, h("th", {}, "Препятствие"), h("th", {}, "Уровень"), h("th", {}, ""))),
      rows,
    ),
    rangeNote,
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
