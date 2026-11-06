/** Типы данных хаба (зеркало Dto.cs) и простое хранилище состояния с подписками. */

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
  kind: "remote" | "program" | null;
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

  subscribe(listener: Listener): void {
    this.listeners.add(listener);
    listener(this.state);
  }
}

export const store = new Store();

/** Понятное имя компонента: «Спереди (D1)», если у сборки есть псевдоним. */
export function displayName(c: ComponentInfo): string {
  const alias = c.aliases[0];
  return alias ? ALIAS_NAMES[alias] ?? alias : c.title;
}

const ALIAS_NAMES: Record<string, string> = {
  front: "Спереди",
  right: "Справа",
  left: "Слева",
  back: "Сзади",
  left_wheel: "Левое колесо",
  right_wheel: "Правое колесо",
  front_left: "Спереди слева",
  front_right: "Спереди справа",
};
