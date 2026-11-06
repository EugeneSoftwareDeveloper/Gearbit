/** Мини-помощник для создания элементов без фреймворка. */

type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "class") {
      el.className = String(value);
    } else if (key === "html") {
      el.innerHTML = String(value);
    } else if (value === true) {
      el.setAttribute(key, "");
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

/** Иконка из набора icons.ts как DOM-элемент. */
export function icon(svg: string): HTMLElement {
  const span = document.createElement("span");
  span.style.display = "contents";
  span.innerHTML = svg;
  return span;
}

/** Обновить заливку ползунка (CSS-переменная --fill). */
export function paintRange(input: HTMLInputElement): void {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const pct = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.setProperty("--fill", `${pct}%`);
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
