/** Настройки интерфейса (тема, палитра, крупный текст), хранятся в localStorage. */

export type ThemeMode = "light" | "dark" | "system";
export type Accent = "ocean" | "forest" | "sunset" | "cosmos" | "candy";

export interface Settings {
  theme: ThemeMode;
  accent: Accent;
  largeText: boolean;
  speed: number;
  driveMode: "buttons" | "joystick";
  /** Где стоят датчики: «устройство/сборка» → id датчика → место (front, right…, none — датчика нет). */
  sensorPlaces: Record<string, Record<string, string>>;
}

export const ACCENTS: { id: Accent; name: string; color: string }[] = [
  { id: "ocean", name: "Океан", color: "#2f7cf6" },
  { id: "forest", name: "Лес", color: "#17a06a" },
  { id: "sunset", name: "Закат", color: "#f2762e" },
  { id: "cosmos", name: "Космос", color: "#8b5cf6" },
  { id: "candy", name: "Конфета", color: "#e5488f" },
];

const KEY = "gearbit.settings";
const defaults: Settings = { theme: "system", accent: "ocean", largeText: false, speed: 70, driveMode: "buttons", sensorPlaces: {} };
const listeners = new Set<(s: Settings) => void>();
const media = window.matchMedia("(prefers-color-scheme: dark)");

function load(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...defaults };
  }
}

let current = load();

export function settings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* приватный режим браузера — просто не сохраняем */
  }
  apply();
}

export function onSettings(listener: (s: Settings) => void): void {
  listeners.add(listener);
}

/** Сборка робота: у разных сборок датчики стоят по-разному. */
type Build = { deviceId: string; profileId: string | null };
const buildKey = (b: Build) => `${b.deviceId}/${b.profileId ?? "-"}`;

/**
 * Где стоят датчики расстояния: пользователь может переставить датчик на любое место или отметить,
 * что его нет («none»): в наборе SuperBot два ИК-датчика, но в сборке их может не быть, а контроллер
 * всё равно присылает какие-то числа. Запоминается для каждой сборки; без записи — как в профиле сборки.
 */
export function sensorPlaces(build: Build | null): Record<string, string> {
  return build ? (current.sensorPlaces[buildKey(build)] ?? {}) : {};
}

/** Переставить датчики; place = null — вернуть как в профиле сборки. */
export function setSensorPlaces(build: Build, changes: Record<string, string | null>): void {
  const places = { ...sensorPlaces(build) };
  for (const [id, place] of Object.entries(changes)) {
    if (place === null) delete places[id];
    else places[id] = place;
  }
  updateSettings({ sensorPlaces: { ...current.sensorPlaces, [buildKey(build)]: places } });
}

/** Текущая тема после учёта системной настройки. */
export function effectiveTheme(): "light" | "dark" {
  return current.theme === "system" ? (media.matches ? "dark" : "light") : current.theme;
}

function apply(): void {
  const root = document.documentElement;
  root.dataset.theme = effectiveTheme();
  root.dataset.accent = current.accent;
  if (current.largeText) root.dataset.large = "true";
  else delete root.dataset.large;
  // В окне Gearbit (WebView2) сообщаем тему, чтобы заголовок окна тоже стал тёмным ночью.
  const host = (window as Window & { chrome?: { webview?: { postMessage(message: unknown): void } } }).chrome?.webview;
  host?.postMessage({ type: "theme", theme: root.dataset.theme });
  for (const l of listeners) l(current);
}

media.addEventListener("change", () => {
  if (current.theme === "system") apply();
});

apply();
