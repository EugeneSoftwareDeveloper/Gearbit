import { hub } from "../hub";
import { icons } from "../icons";
import { store } from "../model";
import { ACCENTS, settings, updateSettings, type ThemeMode } from "../settings";
import { h, icon, paintRange } from "./dom";
import { toast } from "./toasts";

/** Поповер оформления: тема (день/ночь/как в системе), цвет, крупный текст, предел мощности. */
export function createSettingsPopover(): { toggle: (anchor: HTMLElement) => void } {
  const themes: { id: ThemeMode; title: string; glyph: string }[] = [
    { id: "light", title: "Светлая", glyph: icons.sun },
    { id: "dark", title: "Ночная", glyph: icons.moon },
    { id: "system", title: "Как в системе", glyph: icons.monitor },
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
    const b = h("button", { class: "accent-swatch", style: `background:${a.color}`, title: a.name, "aria-label": `Цвет: ${a.name}`, "aria-pressed": "false" });
    b.onclick = () => {
      updateSettings({ accent: a.id });
      sync();
    };
    return { id: a.id, b };
  });

  const large = h("button", { class: "switch", role: "switch", "aria-checked": "false", "aria-label": "Крупный текст" });
  large.onclick = () => {
    updateSettings({ largeText: !settings().largeText });
    sync();
  };

  // Предел мощности относится к роботу, а не к оформлению: меняется на хабе для всех клиентов.
  const powerOut = h("output");
  const power = h("input", { type: "range", min: 10, max: 100, step: 5, value: 60, "aria-label": "Предел мощности" });
  const powerNote = h("div", { class: "muted", style: "font-size:.8rem" });
  const powerBlock = h(
    "div",
    {},
    h("h3", {}, "Робот"),
    h("div", { class: "field" }, h("div", { class: "field-row" }, h("span", {}, "Предел мощности моторов"), powerOut), power, powerNote),
  );
  power.addEventListener("input", () => {
    powerOut.textContent = `${power.value}%`;
    paintRange(power);
  });
  power.addEventListener("change", async () => {
    try {
      const value = await hub.call<number>("robot.setMaxPower", { percent: Number(power.value) });
      toast(`Предел мощности: ${value}%`, "ok");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  });

  const popover = h(
    "div",
    { class: "popover hidden", role: "dialog", "aria-label": "Настройки" },
    h("div", {}, h("h3", {}, "Тема"), h("div", { class: "segmented" }, ...themeButtons.map((t) => t.b))),
    h("div", {}, h("h3", {}, "Цвет"), h("div", { class: "accents" }, ...accentButtons.map((a) => a.b))),
    h("div", { class: "toggle-row" }, h("span", {}, "Крупный текст"), large),
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
      powerNote.textContent = `Сборка рекомендует до ${r.profileMaxPowerPercent}%. Действует на всех: пульт, Scratch, Python, C#.`;
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
