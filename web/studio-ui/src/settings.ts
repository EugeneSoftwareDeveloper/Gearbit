/** Настройки интерфейса (тема, палитра, крупный текст), хранятся в localStorage. */

export type ThemeMode = "light" | "dark" | "system";
export type Accent = "ocean" | "forest" | "sunset" | "cosmos" | "candy";

export interface Settings {
  theme: ThemeMode;
  accent: Accent;
  largeText: boolean;
  speed: number;
  driveMode: "buttons" | "joystick";
}

export const ACCENTS: { id: Accent; name: string; color: string }[] = [
  { id: "ocean", name: "Океан", color: "#2f7cf6" },
  { id: "forest", name: "Лес", color: "#17a06a" },
  { id: "sunset", name: "Закат", color: "#f2762e" },
  { id: "cosmos", name: "Космос", color: "#8b5cf6" },
  { id: "candy", name: "Конфета", color: "#e5488f" },
];

const KEY = "botstudio.settings";
const defaults: Settings = { theme: "system", accent: "ocean", largeText: false, speed: 70, driveMode: "buttons" };
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
  for (const l of listeners) l(current);
}

media.addEventListener("change", () => {
  if (current.theme === "system") apply();
});

apply();
