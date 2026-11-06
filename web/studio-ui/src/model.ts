/** Типы данных хаба (зеркало Dto.cs) и простое хранилище состояния с подписками. */

import { sensorPlaces } from "./settings";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "lost";
export type ComponentKind = "motor" | "distance" | "imu" | "light" | "battery";
export type RobotColor = "off" | "red" | "orange" | "yellow" | "green" | "cyan" | "blue" | "purple" | "white";

export const COLORS: RobotColor[] = ["off", "red", "orange", "yellow", "green", "cyan", "blue", "purple", "white"];
export const COLOR_NAMES: Record<RobotColor, string> = {
  off: "Выключен",
  red: "Красный",
  orange: "Оранжевый",
  yellow: "Жёлтый",
  green: "Зелёный",
  cyan: "Голубой",
  blue: "Синий",
  purple: "Фиолетовый",
  white: "Белый",
};

export interface ComponentInfo {
  id: string;
  kind: ComponentKind;
  title: string;
  available: boolean;
  aliases: string[];
}

export interface RobotInfo {
  id: string;
  name: string;
  state: ConnectionState;
  deviceId: string;
  deviceTitle: string;
  deviceStatus: string;
  profileId: string | null;
  profileTitle: string | null;
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
}

export interface ScanDevice {
  id: string;
  name: string;
  rssi: number | null;
  transport: string;
  deviceId: string | null;
  deviceTitle: string | null;
  known: boolean;
}

export interface Catalog {
  devices: { id: string; title: string; status: string; protocol: string; components: string[] }[];
  profiles: { id: string; title: string; device: string; status: string; maxPowerPercent: number; aliases: Record<string, string> }[];
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
  if (alias === NO_SENSOR) return c.title;
  return alias ? (ALIAS_NAMES[alias] ?? alias) : c.title;
}

/** Места для датчика расстояния: угол от «вперёд» по часовой стрелке. */
export const SENSOR_PLACES: { id: string; title: string; angle: number }[] = [
  { id: "front", title: "Спереди", angle: 0 },
  { id: "front_right", title: "Спереди справа", angle: 45 },
  { id: "right", title: "Справа", angle: 90 },
  { id: "back_right", title: "Сзади справа", angle: 135 },
  { id: "back", title: "Сзади", angle: 180 },
  { id: "back_left", title: "Сзади слева", angle: 225 },
  { id: "left", title: "Слева", angle: 270 },
  { id: "front_left", title: "Спереди слева", angle: 315 },
];

/** Место «датчика нет на роботе». */
export const NO_SENSOR = "none";

/**
 * Где стоит датчик: как переставил пользователь (settings.sensorPlaces), иначе как в профиле сборки.
 * null — место неизвестно, NO_SENSOR — датчика на роботе нет.
 */
export function sensorPlace(c: ComponentInfo, robot = store.state.robot): string | null {
  return sensorPlaces(robot)[c.id] ?? c.aliases.find((a) => SENSOR_PLACES.some((p) => p.id === a)) ?? null;
}

/** Угол датчика для радара и эмулятора; null — датчика нет. */
export function sensorAngle(c: ComponentInfo, index: number, robot = store.state.robot): number | null {
  const place = sensorPlace(c, robot);
  if (place === NO_SENSOR) return null;
  return SENSOR_PLACES.find((p) => p.id === place)?.angle ?? (index === 0 ? 0 : 90);
}

const ALIAS_NAMES: Record<string, string> = {
  ...Object.fromEntries(SENSOR_PLACES.map((p) => [p.id, p.title])),
  left_wheel: "Левое колесо",
  right_wheel: "Правое колесо",
};
