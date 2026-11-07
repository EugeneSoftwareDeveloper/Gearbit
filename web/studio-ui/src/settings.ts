/**
 * Настройки интерфейса. Хранятся в файле хаба (%LOCALAPPDATA%\Gearbit\settings.json, /api/settings),
 * копия — в localStorage: она нужна, чтобы страница сразу открылась такой, как была, даже без хаба.
 * Окно Gearbit и браузер видят одни и те же настройки.
 */
import type { Lang } from "./i18n";

export type ThemeMode = "light" | "dark" | "system";
export type Accent = "ocean" | "forest" | "sunset" | "cosmos" | "candy";

export interface Settings {
  /** Язык интерфейса; null — как в системе. */
  lang: Lang | null;
  theme: ThemeMode;
  accent: Accent;
  largeText: boolean;
  speed: number;
  driveMode: "buttons" | "joystick";
  /** Последняя открытая вкладка: remote, blocks, python, csharp. */
  mode: string;
  /** Последняя выбранная сборка для каждой модели робота: deviceId → profileId. */
  lastProfile: Record<string, string>;
  /** Где стоят датчики: «устройство/сборка» → id датчика → место (front, right…, none — датчика нет). */
  sensorPlaces: Record<string, Record<string, string>>;
}

export const ACCENTS: { id: Accent; color: string }[] = [
  { id: "ocean", color: "#2f7cf6" },
  { id: "forest", color: "#17a06a" },
  { id: "sunset", color: "#f2762e" },
  { id: "cosmos", color: "#8b5cf6" },
  { id: "candy", color: "#e5488f" },
];

const KEY = "gearbit.settings";
const API = "/api/settings";
const defaults: Settings = {
  lang: null,
  theme: "system",
  accent: "ocean",
  largeText: false,
  speed: 70,
  driveMode: "buttons",
  mode: "remote",
  lastProfile: {},
  sensorPlaces: {},
};
const listeners = new Set<(s: Settings) => void>();
const media = window.matchMedia("(prefers-color-scheme: dark)");

function merge(saved: unknown): Settings {
  return saved && typeof saved === "object" && !Array.isArray(saved) ? { ...defaults, ...(saved as Partial<Settings>) } : { ...defaults };
}

function loadLocal(): Settings {
  try {
    return merge(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
  } catch {
    return { ...defaults };
  }
}

function saveLocal(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* приватный режим браузера — просто не сохраняем */
  }
}

let current = loadLocal();

/* ---------- Файл на хабе ---------- */

let saveTimer: number | undefined;
let saving: Promise<void> = Promise.resolve();

function putToHub(keepalive = false): Promise<void> {
  const body = JSON.stringify(current);
  saving = saving
    .then(() => fetch(API, { method: "PUT", headers: { "Content-Type": "application/json" }, body, keepalive }))
    .then(
      () => undefined,
      () => undefined, // хаба нет — останется копия в localStorage, запишем в следующий раз
    );
  return saving;
}

/**
 * Перед показом интерфейса: взять настройки из файла хаба (там они общие для окна и браузера).
 * Файла ещё нет — перенести туда то, что было в localStorage. Хаб не ответил за полсекунды — работаем с копией.
 */
export async function syncSettings(): Promise<void> {
  try {
    const response = await fetch(API, { signal: AbortSignal.timeout(500) });
    if (response.ok) {
      current = merge(await response.json());
      saveLocal();
    } else if (response.status === 404) {
      void putToHub();
    }
  } catch {
    /* хаб не запущен или не успел — берём копию из localStorage */
  }
  apply();
}

/** Дописать отложенное сохранение (перед перезагрузкой страницы). */
export function flushSettings(): Promise<void> {
  if (saveTimer !== undefined) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    void putToHub();
  }
  return saving;
}

addEventListener("pagehide", () => {
  if (saveTimer === undefined) return;
  clearTimeout(saveTimer);
  saveTimer = undefined;
  void putToHub(true);
});

export function settings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  remember(patch);
  apply();
}

/** Запомнить без перерисовки (последняя вкладка, сборка): подписчиков onSettings это не касается. */
export function remember(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  saveLocal();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    void putToHub();
  }, 300);
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
