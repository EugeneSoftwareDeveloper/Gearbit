import { hub } from "../hub";
import { icons } from "../icons";
import { emergencyStop, isPressed, onInputChange, onStop, press, release, setJoystick, type Direction } from "../input/drive";
import { onGamepad } from "../input/keyboard-gamepad";
import { COLOR_NAMES, COLORS, displayName, store, type AppState, type ComponentInfo, type RobotColor } from "../model";
import { settings, updateSettings } from "../settings";
import { h, icon, paintRange } from "./dom";
import { levelColor, RoomView } from "./room-view";
import { toast } from "./toasts";

/** Режим «Пульт»: управление, комната/радар, датчики, свет, моторы. */
export function createRemoteView(openConnect: () => void): HTMLElement {
  const banner = createControlBanner();
  const drive = createDriveCard();
  const stage = createStageCard(openConnect);
  const sensors = createSensorsCard();
  const lights = createLightsCard();
  const motors = createMotorsCard();

  return h(
    "section",
    { class: "view active", id: "view-remote", "aria-label": "Пульт" },
    banner,
    h("div", { class: "remote-grid" }, h("div", { class: "col" }, drive), h("div", { class: "col" }, stage), h("div", { class: "col col-side" }, sensors, lights, motors)),
  );
}

function card(title: string, glyph: string, hint?: string): { root: HTMLElement; body: HTMLElement } {
  const body = h("div");
  const root = h("article", { class: "card" }, h("header", { class: "card-head" }, icon(glyph), h("h2", {}, title), hint ? h("span", { class: "hint" }, hint) : null), body);
  return { root, body };
}

/* ---------- Кто управляет ---------- */
function createControlBanner(): HTMLElement {
  const text = h("div", { class: "text" });
  const take = h(
    "button",
    {
      class: "btn small primary",
      onclick: async () => {
        try {
          await hub.call("control.take");
          toast("Управление у пульта", "ok");
        } catch (e) {
          toast(String((e as Error).message), "error");
        }
      },
    },
    icon(icons.hand),
    "Забрать управление",
  );
  const banner = h("div", { class: "banner warn hidden" }, icon(icons.info), text, take);
  store.subscribe((s) => {
    const c = s.control;
    const foreign = !!c?.clientId && !c.mine;
    banner.classList.toggle("hidden", !foreign);
    if (foreign) text.textContent = `Сейчас роботом управляет ${c?.kind === "program" ? "программа" : "другой пульт"} «${c?.clientName}». Кнопка СТОП работает всегда.`;
  });
  return banner;
}

/* ---------- Управление ---------- */
function createDriveCard(): HTMLElement {
  const { root, body } = card("Управление", icons.gamepad, "WASD / стрелки");

  const mode = h("div", { class: "segmented", role: "group", "aria-label": "Способ управления" });
  const buttonsBtn = h("button", { "aria-pressed": "true" }, "Кнопки");
  const stickBtn = h("button", { "aria-pressed": "false" }, "Джойстик");
  mode.append(buttonsBtn, stickBtn);

  const dpad = createDpad();
  const stick = createJoystick();
  const pads = h("div", { style: "margin-top:16px" }, dpad, stick);

  const applyMode = () => {
    const joystick = settings().driveMode === "joystick";
    buttonsBtn.setAttribute("aria-pressed", String(!joystick));
    stickBtn.setAttribute("aria-pressed", String(joystick));
    dpad.classList.toggle("hidden", joystick);
    stick.classList.toggle("hidden", !joystick);
  };
  buttonsBtn.onclick = () => {
    updateSettings({ driveMode: "buttons" });
    applyMode();
  };
  stickBtn.onclick = () => {
    updateSettings({ driveMode: "joystick" });
    applyMode();
  };
  applyMode();

  // Скорость: доля от предела сборки (детский режим ограничивает сам хаб).
  const speedOut = h("output");
  const speed = h("input", { type: "range", min: 10, max: 100, step: 5, value: settings().speed, "aria-label": "Скорость" });
  const showSpeed = () => {
    speedOut.textContent = `${speed.value}%`;
    paintRange(speed);
  };
  speed.addEventListener("input", () => {
    updateSettings({ speed: Number(speed.value) });
    showSpeed();
  });
  speed.addEventListener("change", () => speed.blur());
  showSpeed();
  const limitNote = h("div", { class: "muted", style: "font-size:.8rem" });
  store.subscribe((s) => {
    const r = s.robot;
    limitNote.textContent = r ? `Предел сборки «${r.profileTitle ?? "—"}»: ${r.maxPowerPercent}% мощности моторов` : "";
  });

  const keyboardChip = h("span", { class: "chip on" }, icon(icons.keyboard), "Клавиатура");
  const padChip = h("span", { class: "chip" }, icon(icons.gamepad), "Геймпад не найден");
  onGamepad((name) => {
    padChip.classList.toggle("on", !!name);
    padChip.lastChild!.textContent = name ? name : "Геймпад не найден";
    if (name) toast(`Геймпад подключён: ${name}`, "ok");
  });

  body.append(
    mode,
    pads,
    h("div", { class: "field" }, h("div", { class: "field-row" }, h("span", {}, "Скорость"), speedOut), speed, limitNote),
    h("div", { class: "input-chips" }, keyboardChip, padChip),
  );
  return root;
}

function createDpad(): HTMLElement {
  const buttons: [Direction | "stop", string, string][] = [
    ["spinLeft", icons.rotateLeft, "Q"],
    ["up", icons.up, "W"],
    ["spinRight", icons.rotateRight, "E"],
    ["left", icons.left, "A"],
    ["stop", icons.stop, "␣"],
    ["right", icons.right, "D"],
    ["" as Direction, "", ""],
    ["down", icons.down, "S"],
    ["" as Direction, "", ""],
  ];
  const labels: Record<string, string> = {
    up: "Вперёд",
    down: "Назад",
    left: "Влево",
    right: "Вправо",
    spinLeft: "Разворот влево",
    spinRight: "Разворот вправо",
    stop: "Стоп",
  };
  const grid = h("div", { class: "dpad" });
  const elements = new Map<Direction, HTMLButtonElement>();
  for (const [dir, glyph, key] of buttons) {
    if (!dir) {
      grid.append(h("span"));
      continue;
    }
    const button = h("button", { class: dir === "stop" ? "center" : "", "aria-label": labels[dir] ?? dir }, icon(glyph), key ? h("kbd", {}, key) : null);
    if (dir === "stop") {
      button.addEventListener("click", () => void emergencyStop());
    } else {
      elements.set(dir, button);
      button.addEventListener("pointerdown", (e) => {
        button.setPointerCapture(e.pointerId);
        press(dir);
      });
      const up = () => release(dir);
      button.addEventListener("pointerup", up);
      button.addEventListener("pointercancel", up);
      button.addEventListener("lostpointercapture", up);
    }
    grid.append(button);
  }
  onInputChange(() => {
    for (const [dir, el] of elements) el.classList.toggle("pressed", isPressed(dir));
  });
  return grid;
}

function createJoystick(): HTMLElement {
  const knob = h("div", { class: "knob" });
  const pad = h("div", { class: "joystick", role: "application", "aria-label": "Джойстик: тяните кружок" }, knob);
  let active = false;

  const move = (e: PointerEvent) => {
    const rect = pad.getBoundingClientRect();
    const radius = rect.width / 2 - 36;
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > radius) {
      dx = (dx / len) * radius;
      dy = (dy / len) * radius;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const throttle = -dy / radius;
    const turn = (dx / radius) * 0.8;
    setJoystick(Math.abs(throttle) < 0.08 && Math.abs(turn) < 0.08 ? null : { throttle, turn });
  };
  const end = () => {
    if (!active) return;
    active = false;
    pad.classList.remove("active");
    knob.style.transform = "";
    setJoystick(null);
  };
  pad.addEventListener("pointerdown", (e) => {
    active = true;
    pad.classList.add("active");
    pad.setPointerCapture(e.pointerId);
    move(e);
  });
  pad.addEventListener("pointermove", (e) => active && move(e));
  pad.addEventListener("pointerup", end);
  pad.addEventListener("pointercancel", end);
  onStop(() => {
    knob.style.transform = "";
  });
  return h("div", { class: "hidden" }, pad);
}

/* ---------- Комната эмулятора или радар ---------- */
function createStageCard(openConnect: () => void): HTMLElement {
  const title = h("h2", {}, "Робот");
  const hint = h("span", { class: "hint" });
  const head = h("header", { class: "card-head" }, icon(icons.radar), title, hint);
  const room = new RoomView();
  const radar = createRadar();
  const empty = h(
    "div",
    { class: "stage-empty" },
    icon(icons.robot),
    h("div", { style: "font-weight:700;font-size:1.1rem;color:var(--text)" }, "Робот не подключён"),
    h("div", {}, "Включите робота и нажмите «Подключить». Нет робота под рукой — выберите эмулятор."),
    h("button", { class: "btn primary", onclick: openConnect }, icon(icons.bluetooth), "Подключить"),
  );
  const root = h("article", { class: "card stage" }, head, empty, room.element, radar.element);

  let subscribed = false;
  hub.on("emulator.state", (s) => room.update(s));
  store.subscribe((s) => {
    const connected = s.robot?.state === "connected" || s.robot?.state === "lost";
    const emulator = connected && !!s.robot?.id.startsWith("emulator:");
    empty.classList.toggle("hidden", connected);
    room.element.classList.toggle("hidden", !emulator);
    radar.element.classList.toggle("hidden", !connected || emulator);
    title.textContent = emulator ? "Комната эмулятора" : connected ? "Радар" : "Робот";
    hint.textContent = emulator ? "240 × 160 см, клетка 10 см" : connected ? "Куда смотрят датчики" : "";
    if (emulator !== subscribed && s.hub === "open") {
      subscribed = emulator;
      void hub.call("emulator.subscribe", { enabled: emulator }).catch(() => undefined);
    }
    if (!emulator) subscribed = false;
    radar.update(s);
  });
  hub.on("hub.connected", () => {
    subscribed = false;
  });
  return root;
}

/** Радар для настоящего робота: лучи датчиков по направлениям сборки. */
function createRadar(): { element: HTMLElement; update: (s: AppState) => void } {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "-160 -160 320 320");
  svg.setAttribute("class", "radar");
  svg.innerHTML = `
    <g fill="none" stroke="var(--grid)" stroke-width="1.5">
      <circle r="40"/><circle r="80"/><circle r="120"/><circle r="150"/>
      <path d="M-150 0H150M0 -150V150"/>
    </g>
    <g class="beams"></g>
    <g>
      <rect x="-26" y="-32" width="52" height="64" rx="16" fill="var(--accent)"/>
      <path d="M0 -24 L10 -10 H-10 Z" fill="#fff"/>
      <rect x="-34" y="-20" width="8" height="40" rx="3" fill="var(--text-muted)"/>
      <rect x="26" y="-20" width="8" height="40" rx="3" fill="var(--text-muted)"/>
    </g>`;
  const beams = svg.querySelector(".beams")!;
  const element = h("div", { style: "padding:8px 18px 18px" });
  element.append(svg);

  // Направления датчиков: по псевдонимам сборки (front — вперёд, right — вправо…).
  const ANGLES: Record<string, number> = { front: 0, right: 90, back: 180, left: 270, front_right: 45, front_left: 315 };

  const update = (s: AppState) => {
    const sensors = s.robot?.components.filter((c) => c.kind === "distance") ?? [];
    beams.innerHTML = "";
    sensors.forEach((c, i) => {
      const angle = ANGLES[c.aliases[0] ?? ""] ?? (i === 0 ? 0 : 90);
      const level = s.telemetry?.distances[c.id];
      const max = 6;
      const reach = level === null || level === undefined ? 150 : 40 + (level / max) * 110;
      const color = level === null || level === undefined ? "var(--text-muted)" : levelColor(level, max);
      const g = document.createElementNS(ns, "g");
      g.setAttribute("transform", `rotate(${angle})`);
      g.innerHTML = `
        <path d="M0 -34 L${-reach * 0.32} ${-reach - 34} A ${reach} ${reach} 0 0 1 ${reach * 0.32} ${-reach - 34} Z"
              fill="${color}" opacity="0.22"/>
        <line x1="0" y1="-34" x2="0" y2="${-reach - 34}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
        <circle cx="0" cy="${-reach - 34}" r="6" fill="${color}"/>`;
      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", "10");
      label.setAttribute("y", String(-Math.min(reach + 34, 140)));
      label.setAttribute("transform", `rotate(${-angle} 10 ${-Math.min(reach + 34, 140)})`);
      label.setAttribute("fill", "var(--text)");
      label.setAttribute("font-size", "13");
      label.setAttribute("font-weight", "700");
      label.textContent = `${displayName(c)}: ${level ?? "—"}`;
      g.append(label);
      beams.append(g);
    });
  };
  return { element, update };
}

/* ---------- Датчики ---------- */
function createSensorsCard(): HTMLElement {
  const { root, body } = card("Датчики", icons.sensor, "0 — близко, 6 — далеко");
  const list = h("div");
  const stats = h("div", { class: "stats" });
  body.append(list, stats);

  let signature = "";
  const rows = new Map<string, { value: HTMLElement; bars: HTMLElement[] }>();
  const battery = h("div", { class: "value" }, "—");
  const batteryStat = h("div", { class: "stat" }, h("div", { class: "label" }, "Батарея"), battery);
  const tilt = h("div", { class: "value" }, "—");
  const tiltStat = h("div", { class: "stat" }, h("div", { class: "label" }, "Наклон X / Y"), tilt);
  stats.append(batteryStat, tiltStat);

  store.subscribe((s) => {
    const sensors = s.robot?.components.filter((c) => c.kind === "distance") ?? [];
    const sig = sensors.map((c) => c.id + c.aliases.join()).join("|");
    if (sig !== signature) {
      signature = sig;
      list.replaceChildren();
      rows.clear();
      if (!sensors.length) list.append(h("p", { class: "muted", style: "margin:0" }, "Подключите робота, чтобы увидеть показания."));
      for (const c of sensors) {
        const value = h("div", { class: "sensor-value" }, "—");
        const bars = Array.from({ length: 7 }, () => h("span"));
        list.append(
          h(
            "div",
            { class: "sensor" },
            h("div", { class: "sensor-head" }, h("span", { class: "sensor-name" }, displayName(c)), h("span", { class: "sensor-id" }, c.id), value),
            h("div", { class: "levels", "aria-hidden": "true" }, ...bars),
            h("div", { class: "levels-legend" }, h("span", {}, "близко"), h("span", {}, "далеко")),
          ),
        );
        rows.set(c.id, { value, bars });
      }
    }

    const t = s.telemetry;
    for (const [id, row] of rows) {
      const level = t?.distances[id];
      const cm = t?.distancesCm[id];
      row.value.innerHTML = level === null || level === undefined ? "—" : `${level}<small> / 6${cm != null ? ` · ${Math.round(cm)} см` : ""}</small>`;
      row.bars.forEach((bar, i) => {
        const on = level !== null && level !== undefined && i <= level;
        bar.className = on ? `on ${level <= 1 ? "near" : level <= 3 ? "mid" : "far"}` : "";
      });
    }

    battery.textContent = t?.battery != null ? String(t.battery) : "—";
    batteryStat.classList.toggle("warn", !!t?.batteryLow);
    tilt.textContent = t?.tilt ? `${t.tilt.x}° / ${t.tilt.y}°` : "нет";
    tiltStat.title = t?.tilt ? "" : "Гироскоп есть только в новой прошивке (кадр телеметрии 19 байт)";
  });
  return root;
}

/* ---------- Свет ---------- */
function createLightsCard(): HTMLElement {
  const { root, body } = card("Свет", icons.bulb);
  let signature = "";
  const swatchesById = new Map<string, Map<RobotColor, HTMLButtonElement>>();

  const setColor = async (ids: string[], color: RobotColor) => {
    try {
      await Promise.all(ids.map((id) => hub.call("light.setColor", { id, color })));
    } catch (e) {
      toast(String((e as Error).message), "error");
    }
  };

  const row = (name: string, ids: string[]) => {
    const swatches = new Map<RobotColor, HTMLButtonElement>();
    const box = h("div", { class: "swatches" });
    for (const color of COLORS) {
      const b = h("button", {
        class: `swatch ${color === "off" ? "off" : ""}`,
        style: color === "off" ? "" : `background: var(--led-${color})`,
        title: COLOR_NAMES[color],
        "aria-label": `${name}: ${COLOR_NAMES[color]}`,
        "aria-pressed": "false",
        onclick: () => void setColor(ids, color),
      });
      swatches.set(color, b);
      box.append(b);
    }
    return { el: h("div", { class: "light-row" }, h("span", { class: "name" }, name), box), swatches };
  };

  store.subscribe((s) => {
    const lights = s.robot?.components.filter((c) => c.kind === "light") ?? [];
    const sig = lights.map((c) => c.id).join();
    if (sig !== signature) {
      signature = sig;
      body.replaceChildren();
      swatchesById.clear();
      if (!lights.length) {
        body.append(h("p", { class: "muted", style: "margin:0" }, "Нет светодиодов."));
        return;
      }
      body.append(row("Все", lights.map((l) => l.id)).el);
      for (const l of lights) {
        const r = row(l.id, [l.id]);
        swatchesById.set(l.id, r.swatches);
        body.append(r.el);
      }
    }
    for (const [id, swatches] of swatchesById) {
      const current = s.telemetry?.lights[id] ?? "off";
      for (const [color, b] of swatches) b.setAttribute("aria-pressed", String(color === current));
    }
  });
  return root;
}

/* ---------- Моторы ---------- */
function createMotorsCard(): HTMLElement {
  const { root, body } = card("Моторы", icons.motor, "двойной щелчок — 0");
  let signature = "";
  const sliders = new Map<string, { input: HTMLInputElement; out: HTMLOutputElement }>();
  let keepAlive: number | undefined;

  const send = (id: string, power: number) => hub.call("motor.setPower", { id, power }, 3000).catch((e: Error) => toast(e.message, "error"));

  // Пока ползунок не на нуле, повторяем команду: хаб считает пульт «живым» и не останавливает робота.
  const ensureKeepAlive = () => {
    const active = [...sliders.values()].some((s) => Number(s.input.value) !== 0);
    if (active && keepAlive === undefined) {
      keepAlive = window.setInterval(() => {
        for (const [id, s] of sliders) if (Number(s.input.value) !== 0) void send(id, Number(s.input.value));
      }, 250);
    } else if (!active && keepAlive !== undefined) {
      clearInterval(keepAlive);
      keepAlive = undefined;
    }
  };

  const resetAll = () => {
    for (const { input, out } of sliders.values()) {
      input.value = "0";
      out.textContent = "0";
      paintRange(input);
    }
    ensureKeepAlive();
  };
  onStop(resetAll);

  const motorLabel = (c: ComponentInfo) => h("div", { class: "name" }, c.id, c.aliases.length ? h("small", {}, displayName(c)) : null);

  store.subscribe((s) => {
    const motors = s.robot?.components.filter((c) => c.kind === "motor") ?? [];
    const sig = motors.map((c) => c.id + c.aliases.join()).join("|");
    if (sig === signature) return;
    signature = sig;
    body.replaceChildren();
    sliders.clear();
    if (!motors.length) {
      body.append(h("p", { class: "muted", style: "margin:0" }, "Нет моторов."));
      return;
    }
    for (const c of motors) {
      const out = h("output", {}, "0");
      const input = h("input", { type: "range", class: "bipolar", min: -100, max: 100, step: 5, value: 0, "aria-label": `Мотор ${c.id}` });
      paintRange(input);
      input.addEventListener("input", () => {
        out.textContent = input.value;
        paintRange(input);
        void send(c.id, Number(input.value));
        ensureKeepAlive();
      });
      input.addEventListener("change", () => input.blur());
      input.addEventListener("dblclick", () => {
        input.value = "0";
        input.dispatchEvent(new Event("input"));
      });
      sliders.set(c.id, { input, out });
      body.append(h("div", { class: "motor" }, motorLabel(c), input, out));
    }
  });
  return root;
}
