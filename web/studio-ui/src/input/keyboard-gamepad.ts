import { emergencyStop, press, release, setGamepad, type Direction } from "./drive";

/** Клавиатура: WASD или стрелки, Q/E — разворот на месте, Пробел/Esc — СТОП. */
const KEYS: Record<string, Direction> = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyQ: "spinLeft",
  KeyE: "spinRight",
};

function typingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && target.type !== "range" && target.type !== "checkbox";
}

let enabled = () => true;

export function setupKeyboard(isEnabled: () => boolean): void {
  enabled = isEnabled;

  window.addEventListener("keydown", (e) => {
    if (typingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "Space" || e.code === "Escape") {
      // Открытое меню редактора блоков (выпадающий список, ввод числа) само обрабатывает Пробел и Esc.
      if (e.target instanceof Element && e.target.closest(".blocklyDropDownDiv, .blocklyWidgetDiv")) return;
      // В открытом диалоге Esc закрывает диалог, а не останавливает робота дважды.
      if (e.code === "Escape" && document.querySelector("dialog[open]")) return;
      e.preventDefault();
      void emergencyStop();
      return;
    }
    const dir = KEYS[e.code];
    if (!dir || !enabled()) return;
    e.preventDefault();
    if (e.target instanceof HTMLInputElement && e.target.type === "range") e.target.blur();
    if (!e.repeat) press(dir);
  });

  window.addEventListener("keyup", (e) => {
    const dir = KEYS[e.code];
    if (dir) release(dir);
  });
}

/**
 * Геймпад (Xbox/PlayStation через Gamepad API): левый стик — газ и поворот,
 * крестовина — как стрелки, B / Circle / Start — СТОП.
 */
type GamepadListener = (name: string | null) => void;
const gamepadListeners = new Set<GamepadListener>();
let connectedName: string | null = null;
let stopWasDown = false;

export function onGamepad(listener: GamepadListener): void {
  gamepadListeners.add(listener);
  listener(connectedName);
}

const DEADZONE = 0.15;
function shape(value: number): number {
  const magnitude = Math.abs(value);
  if (magnitude < DEADZONE) return 0;
  // Плавный старт: мелкие движения стика — точное медленное управление.
  const scaled = (magnitude - DEADZONE) / (1 - DEADZONE);
  return Math.sign(value) * scaled * scaled;
}

function poll(): void {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = Array.from(pads).find((p): p is Gamepad => !!p && p.connected);
  const name = pad ? pad.id.replace(/\s*\(.*?\)\s*/g, " ").trim() || "Геймпад" : null;
  if (name !== connectedName) {
    connectedName = name;
    for (const l of gamepadListeners) l(name);
    if (!name) setGamepad(null);
  }

  if (pad) {
    const stopDown = !!(pad.buttons[1]?.pressed || pad.buttons[9]?.pressed);
    if (stopDown && !stopWasDown) void emergencyStop();
    stopWasDown = stopDown;

    let throttle = -shape(pad.axes[1] ?? 0);
    let turn = shape(pad.axes[0] ?? 0) * 0.8;
    if (pad.buttons[12]?.pressed) throttle = 1;
    if (pad.buttons[13]?.pressed) throttle = -1;
    if (pad.buttons[14]?.pressed) turn = throttle === 0 ? -0.6 : -0.45;
    if (pad.buttons[15]?.pressed) turn = throttle === 0 ? 0.6 : 0.45;

    setGamepad(enabled() && (throttle !== 0 || turn !== 0) && !stopDown ? { throttle, turn } : null);
  }

  requestAnimationFrame(poll);
}

export function setupGamepad(): void {
  window.addEventListener("gamepadconnected", () => undefined);
  requestAnimationFrame(poll);
}
