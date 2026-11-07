/** Типы данных хаба (зеркало Dto.cs) и простое хранилище состояния с подписками. */

import { messages, text, type LocalizedText } from "./i18n";
import { sensorPlaces } from "./settings";

const M = messages({
  ru: {
    colors: { off: "Выключен", red: "Красный", orange: "Оранжевый", yellow: "Жёлтый", green: "Зелёный", cyan: "Голубой", blue: "Синий", purple: "Фиолетовый", white: "Белый" },
    places: {
      front: "Спереди",
      front_right: "Спереди справа",
      right: "Справа",
      back_right: "Сзади справа",
      back: "Сзади",
      back_left: "Сзади слева",
      left: "Слева",
      front_left: "Спереди слева",
      down_left: "Вниз слева",
      down: "Вниз",
      down_right: "Вниз справа",
    },
    tilt: { forward: "вперёд", backward: "назад", left: "влево", right: "вправо", any: "куда-нибудь" },
    leftWheel: "Левое колесо",
    rightWheel: "Правое колесо",
  },
  en: {
    colors: { off: "Off", red: "Red", orange: "Orange", yellow: "Yellow", green: "Green", cyan: "Light blue", blue: "Blue", purple: "Purple", white: "White" },
    places: {
      front: "Front",
      front_right: "Front right",
      right: "Right",
      back_right: "Back right",
      back: "Back",
      back_left: "Back left",
      left: "Left",
      front_left: "Front left",
      down_left: "Down left",
      down: "Down",
      down_right: "Down right",
    },
    tilt: { forward: "forward", backward: "backward", left: "left", right: "right", any: "any way" },
    leftWheel: "Left wheel",
    rightWheel: "Right wheel",
  },
});

export type ConnectionState = "disconnected" | "connecting" | "connected" | "lost";
export type ComponentKind = "motor" | "distance" | "imu" | "light" | "battery";
export type RobotColor = "off" | "red" | "orange" | "yellow" | "green" | "cyan" | "blue" | "purple" | "white";

export const COLORS: RobotColor[] = ["off", "red", "orange", "yellow", "green", "cyan", "blue", "purple", "white"];
export const COLOR_NAMES: Record<RobotColor, string> = M.colors;

export interface ComponentInfo {
  id: string;
  kind: ComponentKind;
  title: LocalizedText;
  available: boolean;
  aliases: string[];
  /** Датчик расстояния, смотрящий вниз: с какого уровня под ним чёрная линия (калибровка сборки или середина шкалы). */
  lineLevel?: number | null;
}

export interface RobotInfo {
  id: string;
  name: string;
  state: ConnectionState;
  deviceId: string;
  deviceTitle: LocalizedText;
  deviceStatus: string;
  profileId: string | null;
  profileTitle: LocalizedText | null;
  uid: string | null;
  firmware: string | null;
  maxPowerPercent: number;
  profileMaxPowerPercent: number;
  hasDrive: boolean;
  /** Идут замеры протокола (service.*): пульт и программы выключены. */
  serviceMode: boolean;
  components: ComponentInfo[];
}

export interface Telemetry {
  distances: Record<string, number | null>;
  distancesCm: Record<string, number | null>;
  tilt: { x: number; y: number; acceleration: number } | null;
  battery: number | null;
  batteryLow: boolean;
  firmware: string | null;
  motors: Record<string, number>;
  lights: Record<string, RobotColor>;
  available: Record<string, boolean>;
}

export interface Control {
  clientId: string | null;
  clientName: string | null;
  kind: "remote" | "program" | "service" | null;
  mine: boolean;
}

export interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EmulatorState {
  active: boolean;
  roomWidth: number;
  roomHeight: number;
  robotRadius: number;
  x: number;
  y: number;
  heading: number;
  bumped: boolean;
  motors: number[];
  lights: number[];
  sensorCm: Record<string, number>;
  sensorLevels: Record<string, number>;
  sensorAngles: Record<string, number>;
  battery: number;
  obstacles: Obstacle[];
  /** Датчики, которые смотрят в пол: id → смещение поперёк машинки, см (минус — левее). */
  sensorDown: Record<string, number>;
  /** Насколько датчики, смотрящие в пол, вынесены вперёд от центра машинки, см. */
  downSensorForward: number;
  scene: EmulatorScene;
  /** Чёрная линия на полу (только на сцене «линия»). */
  line: { points: { x: number; y: number }[]; width: number; closed: boolean } | null;
  /** Наклон машинки (гироскоп), градусы: Y больше 0 — вперёд, X больше 0 — вправо. */
  tiltX: number;
  tiltY: number;
}

/** Что лежит в комнате эмулятора: препятствия или белый лист с чёрной линией. */
export type EmulatorScene = "room" | "line";

export interface ScanDevice {
  id: string;
  name: string;
  rssi: number | null;
  transport: string;
  deviceId: string | null;
  deviceTitle: LocalizedText | null;
  known: boolean;
}

export interface Catalog {
  devices: { id: string; title: LocalizedText; status: string; protocol: string; components: string[] }[];
  profiles: { id: string; title: LocalizedText; device: string; status: string; maxPowerPercent: number; aliases: Record<string, string> }[];
}

export interface AppState {
  hub: "connecting" | "open" | "closed";
  robot: RobotInfo | null;
  telemetry: Telemetry | null;
  control: Control | null;
  emulator: EmulatorState | null;
  catalog: Catalog | null;
}

type Listener = (state: AppState) => void;

class Store {
  state: AppState = { hub: "connecting", robot: null, telemetry: null, control: null, emulator: null, catalog: null };
  private listeners = new Set<Listener>();

  set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  /** Подписаться (слушатель сразу получает текущее состояние). Возвращает функцию отписки. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }
}

export const store = new Store();

/** Понятное имя компонента: «Спереди», если у сборки есть псевдоним или датчик переставлен. */
export function displayName(c: ComponentInfo): string {
  const alias = c.kind === "distance" ? sensorPlace(c) : c.aliases[0];
  if (alias === NO_SENSOR) return text(c.title);
  return alias ? (ALIAS_NAMES[alias] ?? alias) : text(c.title);
}

/** Места для датчика расстояния: угол от «вперёд» по часовой стрелке. */
export const SENSOR_PLACES: { id: string; title: string; angle: number }[] = [
  { id: "front", title: M.places.front, angle: 0 },
  { id: "front_right", title: M.places.front_right, angle: 45 },
  { id: "right", title: M.places.right, angle: 90 },
  { id: "back_right", title: M.places.back_right, angle: 135 },
  { id: "back", title: M.places.back, angle: 180 },
  { id: "back_left", title: M.places.back_left, angle: 225 },
  { id: "left", title: M.places.left, angle: 270 },
  { id: "front_left", title: M.places.front_left, angle: 315 },
];

/**
 * Места «вниз» — для езды по линии: датчик смотрит в пол у носа машинки и отличает белое от чёрного.
 * offset — смещение поперёк машинки, см (минус — левее).
 */
export const DOWN_PLACES: { id: string; title: string; offset: number }[] = [
  { id: "down_left", title: M.places.down_left, offset: -2.5 },
  { id: "down", title: M.places.down, offset: 0 },
  { id: "down_right", title: M.places.down_right, offset: 2.5 },
];

/** Место «датчика нет на роботе». */
export const NO_SENSOR = "none";

/** С какого уровня датчик, смотрящий вниз, видит чёрное, если сборка не откалибрована (середина шкалы 0..6). */
export const DEFAULT_LINE_LEVEL = 3;

/**
 * Где стоит датчик: как переставил пользователь (settings.sensorPlaces), иначе как в профиле сборки.
 * null — место неизвестно, NO_SENSOR — датчика на роботе нет.
 */
export function sensorPlace(c: ComponentInfo, robot = store.state.robot): string | null {
  return sensorPlaces(robot)[c.id] ?? c.aliases.find((a) => SENSOR_PLACES.some((p) => p.id === a) || DOWN_PLACES.some((p) => p.id === a)) ?? null;
}

/** Угол датчика для радара и эмулятора; null — датчика нет или он смотрит вниз. */
export function sensorAngle(c: ComponentInfo, index: number, robot = store.state.robot): number | null {
  const place = sensorPlace(c, robot);
  if (place === NO_SENSOR || sensorDownOffset(c, robot) !== null) return null;
  return SENSOR_PLACES.find((p) => p.id === place)?.angle ?? (index === 0 ? 0 : 90);
}

/** Датчик смотрит вниз: смещение поперёк машинки, см; null — смотрит по сторонам или его нет. */
export function sensorDownOffset(c: ComponentInfo, robot = store.state.robot): number | null {
  const place = sensorPlace(c, robot);
  return DOWN_PLACES.find((p) => p.id === place)?.offset ?? null;
}

/** Видит ли датчик, смотрящий вниз, чёрную линию при таком уровне (тёмное отражает меньше света — уровень выше). */
export function seesLine(c: ComponentInfo, level: number | null | undefined): boolean {
  return level !== null && level !== undefined && level >= (c.lineLevel ?? DEFAULT_LINE_LEVEL);
}

/** С какого угла (градусы) робот считается наклонённым. Как в блоках Makerzoid (BlocosLab, TILT_THRESHOLD). */
export const TILT_LEVEL = 15;

export type TiltDirection = "forward" | "backward" | "left" | "right" | "any";

/** Куда можно наклонить робота: Y больше 0 — вперёд, X больше 0 — вправо (как у Makerzoid, на роботе не проверено). */
export const TILT_DIRECTIONS: { id: TiltDirection; title: string }[] = [
  { id: "forward", title: M.tilt.forward },
  { id: "backward", title: M.tilt.backward },
  { id: "left", title: M.tilt.left },
  { id: "right", title: M.tilt.right },
  { id: "any", title: M.tilt.any },
];

/** Наклонён ли робот в эту сторону. Нет гироскопа или данных — «нет». */
export function isTilted(tilt: { x: number; y: number } | null | undefined, direction: string): boolean {
  if (!tilt) return false;
  switch (direction) {
    case "forward":
      return tilt.y >= TILT_LEVEL;
    case "backward":
      return tilt.y <= -TILT_LEVEL;
    case "left":
      return tilt.x <= -TILT_LEVEL;
    case "right":
      return tilt.x >= TILT_LEVEL;
    case "any":
      return Math.abs(tilt.x) >= TILT_LEVEL || Math.abs(tilt.y) >= TILT_LEVEL;
    default:
      return false;
  }
}

/** Гироскопа точно нет: прошивка уже известна, а компонента наклона в ней нет (старая прошивка). */
export function lacksTilt(robot = store.state.robot): boolean {
  return !!robot?.firmware && !robot.components.some((c) => c.kind === "imu" && c.available);
}

const ALIAS_NAMES: Record<string, string> = {
  ...Object.fromEntries(SENSOR_PLACES.map((p) => [p.id, p.title])),
  ...Object.fromEntries(DOWN_PLACES.map((p) => [p.id, p.title])),
  left_wheel: M.leftWheel,
  right_wheel: M.rightWheel,
};
