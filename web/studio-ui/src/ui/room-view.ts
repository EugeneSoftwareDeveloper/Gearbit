import { hub } from "../hub";
import { icons } from "../icons";
import type { EmulatorState, Obstacle } from "../model";
import { onSettings } from "../settings";
import { cssVar, h, icon } from "./dom";
import { toast } from "./toasts";

const LED_VARS = ["--led-off", "--led-red", "--led-orange", "--led-yellow", "--led-green", "--led-cyan", "--led-blue", "--led-purple"];

/** Цвет светодиода по коду устройства (10 — белый). */
function ledColor(code: number): string {
  if (code === 10) return cssVar("--led-white");
  return cssVar(LED_VARS[code] ?? "--led-off");
}

export function levelColor(level: number, max = 6): string {
  const ratio = level / max;
  return ratio <= 0.2 ? cssVar("--danger") : ratio <= 0.5 ? cssVar("--warn") : cssVar("--ok");
}

/**
 * 2D-вид комнаты эмулятора: машинка, лучи датчиков, препятствия и след.
 * Мышью: протяните по пустому месту — новое препятствие; двойной щелчок по препятствию — убрать.
 */
export class RoomView {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private state: EmulatorState | null = null;
  private trail: { x: number; y: number }[] = [];
  private drag: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private colors = this.readColors();
  private frame = 0;

  constructor() {
    this.canvas = h("canvas", { class: "stage-canvas", "aria-label": "Комната эмулятора" });
    const reset = h("button", { class: "btn small", onclick: () => this.reset() }, icon(icons.home), "На старт");
    const clear = h("button", { class: "btn small ghost", onclick: () => this.setObstacles([]) }, icon(icons.trash), "Убрать препятствия");
    this.element = h(
      "div",
      {},
      this.canvas,
      h("div", { class: "stage-toolbar" }, reset, clear, h("span", { class: "muted", style: "font-size:.8rem;margin-left:auto" }, "Протяните мышью — новое препятствие, двойной щелчок — убрать")),
    );

    this.canvas.addEventListener("pointerdown", (e) => this.onDown(e));
    this.canvas.addEventListener("pointermove", (e) => this.onMove(e));
    this.canvas.addEventListener("pointerup", () => this.onUp());
    this.canvas.addEventListener("dblclick", (e) => this.onDoubleClick(e));
    new ResizeObserver(() => this.schedule()).observe(this.canvas);
    onSettings(() => {
      // Цвета темы читаются после применения data-theme.
      requestAnimationFrame(() => {
        this.colors = this.readColors();
        this.schedule();
      });
    });
  }

  update(state: EmulatorState): void {
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - state.x, last.y - state.y) > 1.5) {
      this.trail.push({ x: state.x, y: state.y });
      if (this.trail.length > 300) this.trail.shift();
    }
    this.state = state;
    this.schedule();
  }

  private async reset(): Promise<void> {
    this.trail = [];
    await hub.call("emulator.reset").catch((e) => toast(String(e.message ?? e), "error"));
  }

  private async setObstacles(obstacles: Obstacle[]): Promise<void> {
    await hub.call("emulator.setObstacles", { obstacles }).catch((e) => toast(String(e.message ?? e), "error"));
  }

  private readColors() {
    return {
      surface: cssVar("--surface-2"),
      border: cssVar("--border"),
      grid: cssVar("--grid"),
      text: cssVar("--text"),
      muted: cssVar("--text-muted"),
      obstacle: cssVar("--surface-3"),
      accent: cssVar("--accent"),
      accent2: cssVar("--accent-2"),
      danger: cssVar("--danger"),
    };
  }

  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  /** Перевод: сантиметры комнаты ↔ пиксели холста. */
  private transform() {
    const s = this.state;
    const rect = this.canvas.getBoundingClientRect();
    const pad = 16;
    const width = s?.roomWidth ?? 240;
    const height = s?.roomHeight ?? 160;
    const scale = Math.min((rect.width - pad * 2) / width, (rect.height - pad * 2) / height);
    const ox = (rect.width - width * scale) / 2;
    const oy = (rect.height - height * scale) / 2;
    return { scale, ox, oy, rect, width, height };
  }

  private toRoom(e: PointerEvent | MouseEvent): { x: number; y: number } {
    const t = this.transform();
    return { x: (e.clientX - t.rect.left - t.ox) / t.scale, y: (e.clientY - t.rect.top - t.oy) / t.scale };
  }

  private hitObstacle(p: { x: number; y: number }): number {
    return this.state?.obstacles.findIndex((o) => p.x >= o.x && p.x <= o.x + o.width && p.y >= o.y && p.y <= o.y + o.height) ?? -1;
  }

  private onDown(e: PointerEvent): void {
    if (!this.state) return;
    const p = this.toRoom(e);
    if (this.hitObstacle(p) >= 0) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  }

  private onMove(e: PointerEvent): void {
    if (!this.drag) {
      if (this.state) this.canvas.style.cursor = this.hitObstacle(this.toRoom(e)) >= 0 ? "pointer" : "crosshair";
      return;
    }
    const p = this.toRoom(e);
    this.drag.x1 = p.x;
    this.drag.y1 = p.y;
    this.schedule();
  }

  private onUp(): void {
    const d = this.drag;
    this.drag = null;
    if (!d || !this.state) return;
    const x = Math.max(0, Math.min(d.x0, d.x1));
    const y = Math.max(0, Math.min(d.y0, d.y1));
    const width = Math.abs(d.x1 - d.x0);
    const height = Math.abs(d.y1 - d.y0);
    if (width < 4 || height < 4) {
      this.schedule();
      return;
    }
    void this.setObstacles([...this.state.obstacles, { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }]);
  }

  private onDoubleClick(e: MouseEvent): void {
    if (!this.state) return;
    const index = this.hitObstacle(this.toRoom(e));
    if (index >= 0) void this.setObstacles(this.state.obstacles.filter((_, i) => i !== index));
  }

  private draw(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const t = this.transform();
    // Вкладка скрыта (другой режим) — холст нулевого размера, рисовать нечего.
    if (t.rect.width < 40 || t.rect.height < 40 || t.scale <= 0) return;
    this.canvas.width = Math.round(t.rect.width * dpr);
    this.canvas.height = Math.round(t.rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, t.rect.width, t.rect.height);

    const c = this.colors;
    const X = (v: number) => t.ox + v * t.scale;
    const Y = (v: number) => t.oy + v * t.scale;

    // Пол и сетка 10 см.
    ctx.fillStyle = c.surface;
    roundRect(ctx, X(0), Y(0), t.width * t.scale, t.height * t.scale, 14);
    ctx.fill();
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = 10; gx < t.width; gx += 10) {
      ctx.moveTo(X(gx), Y(0));
      ctx.lineTo(X(gx), Y(t.height));
    }
    for (let gy = 10; gy < t.height; gy += 10) {
      ctx.moveTo(X(0), Y(gy));
      ctx.lineTo(X(t.width), Y(gy));
    }
    ctx.stroke();
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 2;
    roundRect(ctx, X(0), Y(0), t.width * t.scale, t.height * t.scale, 14);
    ctx.stroke();

    const s = this.state;
    if (!s) return;

    // Препятствия.
    for (const o of s.obstacles) {
      ctx.fillStyle = c.obstacle;
      ctx.strokeStyle = c.border;
      roundRect(ctx, X(o.x), Y(o.y), o.width * t.scale, o.height * t.scale, 6);
      ctx.fill();
      ctx.stroke();
    }
    if (this.drag) {
      const d = this.drag;
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = c.accent;
      ctx.strokeRect(X(Math.min(d.x0, d.x1)), Y(Math.min(d.y0, d.y1)), Math.abs(d.x1 - d.x0) * t.scale, Math.abs(d.y1 - d.y0) * t.scale);
      ctx.setLineDash([]);
    }

    // След.
    if (this.trail.length > 1) {
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1]!;
        const b = this.trail[i]!;
        ctx.strokeStyle = withAlpha(c.accent, (i / this.trail.length) * 0.45);
        ctx.beginPath();
        ctx.moveTo(X(a.x), Y(a.y));
        ctx.lineTo(X(b.x), Y(b.y));
        ctx.stroke();
      }
    }

    // Лучи датчиков.
    for (const [sensor, angle] of Object.entries(s.sensorAngles)) {
      const cm = s.sensorCm[sensor] ?? 0;
      const level = s.sensorLevels[sensor] ?? 6;
      const rad = ((s.heading + angle) * Math.PI) / 180;
      const sx = s.x + Math.cos(rad) * s.robotRadius;
      const sy = s.y + Math.sin(rad) * s.robotRadius;
      const reach = Math.min(cm, 45);
      const color = levelColor(level);
      const gradient = ctx.createLinearGradient(X(sx), Y(sy), X(sx + Math.cos(rad) * reach), Y(sy + Math.sin(rad) * reach));
      gradient.addColorStop(0, withAlpha(color, 0.55));
      gradient.addColorStop(1, withAlpha(color, 0.05));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(X(sx), Y(sy));
      const spread = 0.18;
      ctx.lineTo(X(sx + Math.cos(rad - spread) * reach), Y(sy + Math.sin(rad - spread) * reach));
      ctx.lineTo(X(sx + Math.cos(rad + spread) * reach), Y(sy + Math.sin(rad + spread) * reach));
      ctx.closePath();
      ctx.fill();
      if (cm <= 45) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(X(sx + Math.cos(rad) * cm), Y(sy + Math.sin(rad) * cm), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = c.muted;
      ctx.font = "600 11px system-ui";
      ctx.fillText(`${sensor}: ${level}`, X(sx + Math.cos(rad) * (reach + 4)) + 4, Y(sy + Math.sin(rad) * (reach + 4)));
    }

    // Машинка.
    const r = s.robotRadius * t.scale;
    ctx.save();
    ctx.translate(X(s.x), Y(s.y));
    ctx.rotate((s.heading * Math.PI) / 180);
    ctx.shadowColor = withAlpha("#000000", 0.25);
    ctx.shadowBlur = 10;
    const body = ctx.createLinearGradient(-r, -r, r, r);
    body.addColorStop(0, c.accent);
    body.addColorStop(1, c.accent2);
    ctx.fillStyle = s.bumped ? c.danger : body;
    roundRect(ctx, -r, -r * 0.85, r * 2, r * 1.7, r * 0.45);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Колёса.
    ctx.fillStyle = withAlpha(c.text, 0.75);
    roundRect(ctx, -r * 0.6, -r * 1.05, r * 1.2, r * 0.3, 3);
    ctx.fill();
    roundRect(ctx, -r * 0.6, r * 0.75, r * 1.2, r * 0.3, 3);
    ctx.fill();
    // Нос (направление).
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(r * 0.95, 0);
    ctx.lineTo(r * 0.45, -r * 0.3);
    ctx.lineTo(r * 0.45, r * 0.3);
    ctx.closePath();
    ctx.fill();
    // Светодиоды.
    s.lights.forEach((code, i) => {
      ctx.fillStyle = ledColor(code);
      ctx.beginPath();
      ctx.arc(-r * 0.45 + (i % 2) * r * 0.5, (i < 2 ? -1 : 1) * r * 0.35, Math.max(2.5, r * 0.13), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)));
}

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) {
    const hex = color.length === 4 ? color.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3") : color;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  return color;
}
