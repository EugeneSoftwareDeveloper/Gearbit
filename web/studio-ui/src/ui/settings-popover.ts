import { hub } from "../hub";
import { LANGS, lang, messages, setLang } from "../i18n";
import { icons } from "../icons";
import { store } from "../model";
import { ACCENTS, settings, updateSettings, type ThemeMode } from "../settings";
import { h, icon, paintRange } from "./dom";
import { toast } from "./toasts";

const M = messages({
  ru: {
    title: "Настройки",
    language: "Язык · Language",
    theme: "Тема",
    day: "День",
    night: "Ночь",
    auto: "Авто",
    color: "Цвет",
    colorOf: (name: string) => `Цвет: ${name}`,
    accents: { ocean: "Океан", forest: "Лес", sunset: "Закат", cosmos: "Космос", candy: "Конфета" },
    largeText: "Крупный текст",
    robot: "Робот",
    powerLimit: "Предел мощности",
    motorPowerLimit: "Предел мощности моторов",
    powerSet: (value: number) => `Предел мощности: ${value}%`,
    powerNote: (max: number) => `Сборка рекомендует до ${max}%. Действует на всех: пульт, блоки, Python, C#.`,
  },
  en: {
    title: "Settings",
    language: "Language · Язык",
    theme: "Theme",
    day: "Day",
    night: "Night",
    auto: "Auto",
    color: "Color",
    colorOf: (name) => `Color: ${name}`,
    accents: { ocean: "Ocean", forest: "Forest", sunset: "Sunset", cosmos: "Cosmos", candy: "Candy" },
    largeText: "Large text",
    robot: "Robot",
    powerLimit: "Power limit",
    motorPowerLimit: "Motor power limit",
    powerSet: (value) => `Power limit: ${value}%`,
    powerNote: (max) => `The build recommends up to ${max}%. Applies to everything: remote, blocks, Python, C#.`,
  },
});

/** Поповер оформления: язык, тема (день/ночь/как в системе), цвет, крупный текст, предел мощности. */
export function createSettingsPopover(): { toggle: (anchor: HTMLElement) => void } {
  // Язык: переключение перезагружает страницу (тексты выбираются при загрузке).
  const langButtons = LANGS.map((l) => {
    const b = h("button", { "aria-pressed": String(l.id === lang()), lang: l.id }, l.name);
    b.onclick = () => {
      if (l.id !== lang()) void setLang(l.id);
    };
    return b;
  });

  const themes: { id: ThemeMode; title: string; glyph: string }[] = [
    { id: "light", title: M.day, glyph: icons.sun },
    { id: "dark", title: M.night, glyph: icons.moon },
    { id: "system", title: M.auto, glyph: icons.monitor },
  ];
  const themeButtons = themes.map((t) => {
    const b = h("button", { "aria-pressed": "false", title: t.title }, icon(t.glyph), t.title);
    b.onclick = () => {
      updateSettings({ theme: t.id });
      sync();
    };
    return { id: t.id, b };
  });

  const accentButtons = ACCENTS.map((a) => {
    const b = h("button", { class: "accent-swatch", style: `background:${a.color}`, title: M.accents[a.id], "aria-label": M.colorOf(M.accents[a.id]), "aria-pressed": "false" });
    b.onclick = () => {
      updateSettings({ accent: a.id });
      sync();
    };
    return { id: a.id, b };
  });

  const large = h("button", { class: "switch", role: "switch", "aria-checked": "false", "aria-label": M.largeText });
  large.onclick = () => {
    updateSettings({ largeText: !settings().largeText });
    sync();
  };

  // Предел мощности относится к роботу, а не к оформлению: меняется на хабе для всех клиентов.
  const powerOut = h("output");
  const power = h("input", { type: "range", min: 10, max: 100, step: 5, value: 60, "aria-label": M.powerLimit });
  const powerNote = h("div", { class: "muted", style: "font-size:.8rem" });
  const powerBlock = h(
    "div",
    {},
    h("h3", {}, M.robot),
    h("div", { class: "field" }, h("div", { class: "field-row" }, h("span", {}, M.motorPowerLimit), powerOut), power, powerNote),
  );
  power.addEventListener("input", () => {
    powerOut.textContent = `${power.value}%`;
    paintRange(power);
  });
  power.addEventListener("change", async () => {
    try {
      const value = await hub.call<number>("robot.setMaxPower", { percent: Number(power.value) });
      toast(M.powerSet(value), "ok");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  });

  const popover = h(
    "div",
    { class: "popover hidden", role: "dialog", "aria-label": M.title },
    h("div", {}, h("h3", {}, M.language), h("div", { class: "segmented" }, ...langButtons)),
    h("div", {}, h("h3", {}, M.theme), h("div", { class: "segmented" }, ...themeButtons.map((t) => t.b))),
    h("div", {}, h("h3", {}, M.color), h("div", { class: "accents" }, ...accentButtons.map((a) => a.b))),
    h("div", { class: "toggle-row" }, h("span", {}, M.largeText), large),
    powerBlock,
  );
  document.body.append(popover);

  function sync(): void {
    const s = settings();
    for (const t of themeButtons) t.b.setAttribute("aria-pressed", String(t.id === s.theme));
    for (const a of accentButtons) a.b.setAttribute("aria-pressed", String(a.id === s.accent));
    large.setAttribute("aria-checked", String(s.largeText));
  }

  store.subscribe((s) => {
    const r = s.robot;
    const connected = r?.state === "connected";
    powerBlock.classList.toggle("hidden", !connected);
    if (r && document.activeElement !== power) {
      power.value = String(r.maxPowerPercent);
      powerOut.textContent = `${r.maxPowerPercent}%`;
      paintRange(power);
      powerNote.textContent = M.powerNote(r.profileMaxPowerPercent);
    }
  });

  const hide = () => popover.classList.add("hidden");
  document.addEventListener("click", (e) => {
    if (!popover.classList.contains("hidden") && !popover.contains(e.target as Node)) hide();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });

  return {
    toggle: () => {
      sync();
      popover.classList.toggle("hidden");
    },
  };
}
