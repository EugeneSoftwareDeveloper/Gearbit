import { icons } from "../icons";
import { displayName, NO_SENSOR, sensorPlace, store } from "../model";
import { h, icon } from "./dom";
import { levelColor } from "./room-view";

/** Компактная карточка «Датчики» для вкладок с программами («Блоки», Python, C#). */
export function createSensorsCard(): HTMLElement {
  const list = h("div", { class: "mini-sensors" });
  const root = h(
    "article",
    { class: "card" },
    h("header", { class: "card-head" }, icon(icons.sensor), h("h2", {}, "Датчики"), h("span", { class: "hint" }, "0 — вплотную, 6 — далеко")),
    list,
  );
  store.subscribe((s) => {
    const robot = s.robot?.state === "connected" ? s.robot : null;
    if (!robot) {
      list.replaceChildren(h("p", { class: "muted", style: "margin:0" }, "Подключите робота, чтобы видеть показания."));
      return;
    }
    const t = s.telemetry;
    const rows: HTMLElement[] = [];
    for (const c of robot.components.filter((c) => c.kind === "distance" && sensorPlace(c, robot) !== NO_SENSOR)) {
      const level = t?.distances[c.id];
      const value = level === null || level === undefined ? "—" : String(level);
      const color = level === null || level === undefined ? "var(--text-muted)" : levelColor(level);
      rows.push(row(`Расстояние ${displayName(c).toLowerCase()}`, c.id, value, color));
    }
    if (robot.components.some((c) => c.kind === "imu")) {
      rows.push(row("Наклон X / Y", "", t?.tilt ? `${t.tilt.x} / ${t.tilt.y}` : "—"));
    }
    if (robot.components.some((c) => c.kind === "battery")) rows.push(row("Заряд батареи", "", t?.battery === null || t?.battery === undefined ? "—" : String(t.battery)));
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
