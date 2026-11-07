import { messages } from "../i18n";
import { icons } from "../icons";
import { displayName, NO_SENSOR, seesLine, sensorDownOffset, sensorPlace, store } from "../model";
import { h, icon } from "./dom";
import { levelColor } from "./room-view";

const M = messages({
  ru: {
    title: "Датчики",
    scale: "0 — вплотную, 6 — далеко",
    connect: "Подключите робота, чтобы видеть показания.",
    line: (place: string) => `Линия: ${place}`,
    black: "чёрное",
    white: "белое",
    distance: (place: string) => `Расстояние ${place}`,
    tilt: "Наклон X / Y",
    battery: "Заряд батареи",
  },
  en: {
    title: "Sensors",
    scale: "0 — touching, 6 — far",
    connect: "Connect a robot to see the readings.",
    line: (place) => `Line: ${place}`,
    black: "black",
    white: "white",
    distance: (place) => `Distance ${place}`,
    tilt: "Tilt X / Y",
    battery: "Battery",
  },
});

/** Компактная карточка «Датчики» для вкладок с программами («Блоки», Python, C#). */
export function createSensorsCard(): HTMLElement {
  const list = h("div", { class: "mini-sensors" });
  const root = h(
    "article",
    { class: "card" },
    h("header", { class: "card-head" }, icon(icons.sensor), h("h2", {}, M.title), h("span", { class: "hint" }, M.scale)),
    list,
  );
  store.subscribe((s) => {
    const robot = s.robot?.state === "connected" ? s.robot : null;
    if (!robot) {
      list.replaceChildren(h("p", { class: "muted", style: "margin:0" }, M.connect));
      return;
    }
    const t = s.telemetry;
    const rows: HTMLElement[] = [];
    for (const c of robot.components.filter((c) => c.kind === "distance" && sensorPlace(c, robot) !== NO_SENSOR)) {
      const level = t?.distances[c.id];
      const known = level !== null && level !== undefined;
      // Датчик смотрит в пол: показываем, что под ним — белое или чёрная линия.
      if (sensorDownOffset(c, robot) !== null) {
        rows.push(row(M.line(displayName(c).toLowerCase()), c.id, known ? `${seesLine(c, level) ? M.black : M.white} · ${level}` : "—"));
        continue;
      }
      const value = known ? String(level) : "—";
      const color = known ? levelColor(level) : "var(--text-muted)";
      rows.push(row(M.distance(displayName(c).toLowerCase()), c.id, value, color));
    }
    if (robot.components.some((c) => c.kind === "imu")) {
      rows.push(row(M.tilt, "", t?.tilt ? `${t.tilt.x} / ${t.tilt.y}` : "—"));
    }
    if (robot.components.some((c) => c.kind === "battery")) rows.push(row(M.battery, "", t?.battery === null || t?.battery === undefined ? "—" : String(t.battery)));
    list.replaceChildren(...rows);
  });
  return root;
}

function row(name: string, id: string, value: string, color?: string): HTMLElement {
  return h(
    "div",
    { class: "mini-sensor" },
    h("span", { class: "name" }, name, id ? h("small", {}, ` ${id}`) : null),
    h("span", { class: "value", style: color ? `color:${color}` : null }, value),
  );
}
