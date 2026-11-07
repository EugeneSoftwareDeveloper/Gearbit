import { hub } from "../hub";
import { messages } from "../i18n";
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
const M = messages({
  ru: {
    connectFirst: "Сначала подключите робота с датчиком расстояния.",
    white: "Белый лист",
    black: "Чёрная линия",
    whiteLower: "белый лист",
    blackLower: "чёрная линия",
    sensor: "Датчик",
    copy: "Скопировать",
    noData: "нет данных",
    notSeen: (level: string) => `${level} — не видит`,
    blind: (cm: number) => `С ${cm} см и дальше датчик не замечает препятствие: уровень такой же, как без препятствия.`,
    unseen: (maxLevel: number, moveCloser: boolean) =>
      `${maxLevel === 0 ? "Уровня 0 не было" : `Уровней 0–${maxLevel} не было`} ни в одном замере — в таблице для них взято ближайшее расстояние.${moveCloser ? " Поставьте препятствие ближе." : ""}`,
    again: "Ещё раз",
    measure: "Замерить",
    noObstacle: "Нет препятствия",
    noObstacleLower: "нет препятствия",
    cm: (cm: number) => `${cm} см`,
    problems: {
      inverted:
        "Над чёрным уровень меньше, чем над белым, а Gearbit считает наоборот. Сохраните запись замеров и допишите находку в docs/PROTOCOL-SUPERBOT.md.",
      same: "Белое и чёрное дают одинаковые уровни. Опустите датчик ближе к полу (примерно на 1 см) и замерьте снова.",
    },
    seesBlack: (level: number) => `Датчик видит чёрное, начиная с уровня ${level}.`,
    measureMore: "Замерьте хотя бы два расстояния с разными уровнями или белый лист и чёрную линию.",
    noLevels: "Датчик не прислал уровней: он подключён? В карточке «Датчики» видны числа?",
    mark: (id: string, what: string) => `Калибровка ${id}: ${what}`,
    result: "итог",
    copied: "Скопировано — вставьте в profiles/superbot-car.json → calibration.distance",
    intro:
      "Узнаем, сколько сантиметров означает каждый уровень датчика. Робот стоит на месте, моторы не включаются. Поставьте коробку или книгу прямо перед датчиком на нужное расстояние (меряйте линейкой от датчика) и нажмите «Замерить» — полторы секунды не двигайте ничего. Датчик видит недалеко, поэтому начните с 1–5 см. Светлая коробка заметнее тёмной.",
    now: "Сейчас:",
    obstacle: "Препятствие",
    level: "Уровень",
    lineThreshold: "Порог линии",
    lineIntro:
      "Для езды по линии датчик смотрит в пол. Направьте его вниз примерно в 1 см над белым листом и нажмите «Замерить» напротив «Белый лист». Потом подвиньте лист так, чтобы под датчиком была чёрная линия (изолента или толстый маркер), и замерьте ещё раз.",
    underSensor: "Под датчиком",
    forProfile: "Для профиля сборки",
    levelNote: "Уровень — самое частое значение за замер, в скобках — разброс.",
  },
  en: {
    connectFirst: "Connect a robot with a distance sensor first.",
    white: "White paper",
    black: "Black line",
    whiteLower: "white paper",
    blackLower: "black line",
    sensor: "Sensor",
    copy: "Copy",
    noData: "no data",
    notSeen: (level) => `${level} — does not see`,
    blind: (cm) => `From ${cm} cm and further the sensor does not notice the obstacle: the level is the same as with no obstacle.`,
    unseen: (maxLevel, moveCloser) =>
      `${maxLevel === 0 ? "Level 0 was" : `Levels 0–${maxLevel} were`} not seen in any measurement — the table uses the nearest distance for them.${moveCloser ? " Put the obstacle closer." : ""}`,
    again: "Again",
    measure: "Measure",
    noObstacle: "No obstacle",
    noObstacleLower: "no obstacle",
    cm: (cm) => `${cm} cm`,
    problems: {
      inverted:
        "Over black the level is lower than over white, but Gearbit assumes the opposite. Save the measurement recording and add the finding to docs/PROTOCOL-SUPERBOT.md.",
      same: "White and black give the same levels. Lower the sensor closer to the floor (about 1 cm) and measure again.",
    },
    seesBlack: (level) => `The sensor sees black from level ${level}.`,
    measureMore: "Measure at least two distances with different levels, or the white paper and the black line.",
    noLevels: "The sensor sent no levels: is it connected? Are numbers shown on the «Sensors» card?",
    mark: (id, what) => `Calibration ${id}: ${what}`,
    result: "result",
    copied: "Copied — paste into profiles/superbot-car.json → calibration.distance",
    intro:
      "Let's find out how many centimeters each sensor level means. The robot stays still, the motors do not turn on. Put a box or a book right in front of the sensor at the needed distance (measure from the sensor with a ruler) and press «Measure» — do not move anything for a second and a half. The sensor does not see far, so start with 1–5 cm. A light box is easier to see than a dark one.",
    now: "Now:",
    obstacle: "Obstacle",
    level: "Level",
    lineThreshold: "Line threshold",
    lineIntro:
      "For line following the sensor looks at the floor. Point it down about 1 cm above white paper and press «Measure» next to «White paper». Then move the paper so that a black line (electrical tape or a thick marker) is under the sensor, and measure again.",
    underSensor: "Under the sensor",
    forProfile: "For the build profile",
    levelNote: "Level is the most frequent value during a measurement, the spread is in brackets.",
  },
});

const DISTANCES: (number | null)[] = [1, 2, 3, 4, 5, 7, 10, 15, 20, 30, null];
const SAMPLE_MS = 1500;

type Floor = "white" | "black";

const FLOORS: { id: Floor; title: string }[] = [
  { id: "white", title: M.white },
  { id: "black", title: M.black },
];

export function createCalibrationTab(): { element: HTMLElement; stop(): void } {
  const sensor = h("select", { "aria-label": M.sensor });
  const live = h("span", { class: "live-level" }, "—");
  const rows = h("tbody");
  const lineRows = h("tbody");
  const lineNote = h("p", { class: "muted hidden" });
  const rangeNote = h("p", { class: "muted hidden" });
  const snippet = h("pre", { class: "hex-preview snippet" });
  const copyBtn = h("button", { class: "btn small", disabled: true }, M.copy);

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

  const shown = (s: Sample | undefined) => (!s ? "—" : s.mode === null ? M.noData : `${s.mode}${s.min !== s.max ? ` (${s.min}–${s.max})` : ""}`);
  /** Уровень на расстоянии; «не видит» — такой же, как без препятствия. */
  const shownAt = (s: Sample | undefined, far: number | null) => (s && s.cm !== null && far !== null && s.mode === far ? M.notSeen(shown(s)) : shown(s));

  /** Что видно по замерам расстояний: где датчик слепнет и каких уровней не было. */
  const rangeText = (all: Samples) => {
    const parts: string[] = [];
    const blind = blindFrom(all);
    if (blind !== null) parts.push(M.blind(blind));
    const near = unseenNearLevels(all);
    if (levelToCm(all) && near.levels.length) {
      parts.push(M.unseen(near.levels.length - 1, near.nearestCm !== null && near.nearestCm > 1));
    }
    return parts.join(" ");
  };
  const button = (s: Sample | undefined, onclick: () => void) =>
    h("button", { class: "btn small", disabled: cancel !== null, onclick }, s?.count ? M.again : M.measure);

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
          h("td", {}, cm === null ? M.noObstacle : M.cm(cm)),
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
    lineNote.textContent = line.problem ? M.problems[line.problem] : line.level !== null ? M.seesBlack(line.level) : "";
    copyBtn.disabled = !parts.length;
    snippet.textContent = parts.length
      ? `"${sensorId()}": { ${parts.join(", ")} }`
      : M.measureMore;
  };

  /** Замер выбранного датчика; null — отменён или робот не подключён. */
  const take = async (what: string, cm: number | null): Promise<Sample | null> => {
    const robot = store.state.robot;
    const id = sensorId();
    if (robot?.state !== "connected" || !id) {
      toast(M.connectFirst, "error");
      return null;
    }
    element.querySelectorAll<HTMLButtonElement>(".measure-table button").forEach((b) => (b.disabled = true));
    const values = await sample(id);
    if (values === null) return null;
    const s: Sample = { cm, mode: mode(values), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null, count: values.length };
    if (s.mode === null) toast(M.noLevels, "error", 6000);
    addMark(M.mark(id, what), { sensor: id, ...s, values });
    return s;
  };

  const measure = async (index: number) => {
    const cm = DISTANCES[index]!;
    const s = await take(cm === null ? M.noObstacleLower : M.cm(cm), cm);
    if (s) samples[index] = s;
    render();
  };

  const measureFloor = async (kind: Floor) => {
    const s = await take(kind === "white" ? M.whiteLower : M.blackLower, null);
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
    addMark(M.mark(sensorId(), M.result), { sensor: sensorId(), levelToCm: table, lineLevel: line.level });
    if (await copyText(snippet.textContent ?? "")) toast(M.copied, "ok", 6000);
  };

  const element = h(
    "section",
    { class: "measure-panel" },
    h(
      "p",
      { class: "muted" },
      M.intro,
    ),
    h("div", { class: "measure-form" }, h("label", {}, h("span", {}, M.sensor), sensor), h("div", { class: "live" }, h("span", { class: "muted" }, M.now), live)),
    h(
      "table",
      { class: "measure-table" },
      h("thead", {}, h("tr", {}, h("th", {}, M.obstacle), h("th", {}, M.level), h("th", {}, ""))),
      rows,
    ),
    rangeNote,
    h("h3", {}, M.lineThreshold),
    h(
      "p",
      { class: "muted" },
      M.lineIntro,
    ),
    h(
      "table",
      { class: "measure-table" },
      h("thead", {}, h("tr", {}, h("th", {}, M.underSensor), h("th", {}, M.level), h("th", {}, ""))),
      lineRows,
    ),
    lineNote,
    h("div", { class: "frame-actions" }, h("h3", {}, M.forProfile), h("div", { class: "spacer" }), copyBtn),
    snippet,
    h("p", { class: "muted" }, icon(icons.info), ` ${M.levelNote}`),
  );
  render();
  return {
    element,
    stop: () => cancel?.(),
  };
}
