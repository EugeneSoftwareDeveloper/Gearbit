import { hub, RpcError } from "../hub";
import { store } from "../model";
import { settings } from "../settings";
import { toast } from "../ui/toasts";

/**
 * Объединяет источники управления (клавиатура, кнопки на экране, джойстик, геймпад)
 * и отправляет хабу «газ/поворот» 10 раз в секунду, пока что-то нажато.
 * Пока команды идут, хаб не срабатывает по «кнопке мертвеца»; отпустили — сразу drive.stop.
 */

export type Direction = "up" | "down" | "left" | "right" | "spinLeft" | "spinRight";
export interface Vector {
  throttle: number;
  turn: number;
}

const SEND_PERIOD_MS = 100;
const pressed = new Set<Direction>();
let joystick: Vector | null = null;
let gamepad: Vector | null = null;
let lastSent: Vector | null = null;
let timer: number | undefined;
const stopListeners = new Set<() => void>();
const changeListeners = new Set<() => void>();

export function press(dir: Direction): void {
  if (!pressed.has(dir)) {
    pressed.add(dir);
    changed();
  }
}

export function release(dir: Direction): void {
  if (pressed.delete(dir)) changed();
}

export function isPressed(dir: Direction): boolean {
  return pressed.has(dir);
}

export function setJoystick(v: Vector | null): void {
  joystick = v;
  changed();
}

export function setGamepad(v: Vector | null): void {
  const same = v && gamepad && Math.abs(v.throttle - gamepad.throttle) < 0.02 && Math.abs(v.turn - gamepad.turn) < 0.02;
  if (same || (!v && !gamepad)) return;
  gamepad = v;
  changed();
}

/** Подписка на «всё остановлено» (СТОП, страховка хаба): сбросить ползунки моторов и т. п. */
export function onStop(listener: () => void): void {
  stopListeners.add(listener);
}

export function onInputChange(listener: () => void): void {
  changeListeners.add(listener);
}

/** Большая красная кнопка. Работает, даже если управляет другой клиент. */
export async function emergencyStop(): Promise<void> {
  pressed.clear();
  joystick = null;
  gamepad = null;
  lastSent = null;
  stopLoop();
  for (const l of stopListeners) l();
  for (const l of changeListeners) l();
  try {
    await hub.call("robot.stop");
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), "error");
  }
}

/** Хаб сам остановил робота: просто сбрасываем локальное состояние. */
export function resetInputs(): void {
  pressed.clear();
  joystick = null;
  lastSent = null;
  stopLoop();
  for (const l of stopListeners) l();
  for (const l of changeListeners) l();
}

export function currentVector(): Vector | null {
  if (joystick) return joystick;
  if (gamepad) return gamepad;
  if (pressed.size === 0) return null;

  let throttle = 0;
  let turn = 0;
  if (pressed.has("up")) throttle += 1;
  if (pressed.has("down")) throttle -= 1;
  const steering = (pressed.has("right") ? 1 : 0) - (pressed.has("left") ? 1 : 0);
  // Стрелка вбок без газа — разворот на месте, с газом — плавная дуга.
  turn = throttle === 0 ? steering * 0.6 : steering * 0.45;
  if (pressed.has("spinLeft")) turn = -0.8;
  if (pressed.has("spinRight")) turn = 0.8;
  if (throttle === 0 && turn === 0) return null;
  return { throttle, turn };
}

function changed(): void {
  for (const l of changeListeners) l();
  const vector = currentVector();
  if (vector) {
    send(vector);
    startLoop();
  } else if (lastSent) {
    lastSent = null;
    stopLoop();
    void call("drive.stop", {});
  }
}

function startLoop(): void {
  if (timer !== undefined) return;
  timer = window.setInterval(() => {
    const vector = currentVector();
    if (vector) send(vector);
    else stopLoop();
  }, SEND_PERIOD_MS);
}

function stopLoop(): void {
  if (timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
}

function send(v: Vector): void {
  const speed = settings().speed;
  lastSent = v;
  void call("drive.arcade", {
    throttle: Math.round(v.throttle * speed),
    turn: Math.round(v.turn * speed),
  });
}

async function call(method: string, params: Record<string, unknown>): Promise<void> {
  if (store.state.robot?.state !== "connected") return;
  try {
    await hub.call(method, params, 3000);
  } catch (e) {
    if (e instanceof RpcError && e.code === -32002) {
      toast(e.message, "error");
    } else if (e instanceof RpcError && e.code === -32001) {
      toast("Робот не подключён", "error");
    }
  }
}

// Ушли со вкладки или окно потеряло фокус — отпускаем всё, чтобы робот не уехал «с зажатой клавишей».
window.addEventListener("blur", () => {
  if (pressed.size || joystick) resetAndStop();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) resetAndStop();
});

function resetAndStop(): void {
  const wasMoving = lastSent !== null;
  pressed.clear();
  joystick = null;
  stopLoop();
  for (const l of changeListeners) l();
  if (wasMoving) {
    lastSent = null;
    void call("drive.stop", {});
  }
}
