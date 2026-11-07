/**
 * Язык интерфейса: русский или английский. Выбирается один раз при загрузке страницы:
 * из настроек, а если там «как в системе» — по языку системы. Смена языка перезагружает страницу.
 *
 * Тексты лежат рядом с кодом, который их показывает:
 *   const M = messages({ ru: { stop: "СТОП", run: (n: number) => `Шаг ${n}` }, en: { stop: "STOP", run: (n) => `Step ${n}` } });
 * TypeScript не соберёт проект, если в en не хватает текста или у функции другие параметры.
 */
import { settings, updateSettings, flushSettings } from "./settings";

export type Lang = "ru" | "en";

/** Названия языков всегда на самих этих языках: их должен узнать тот, кто не читает текущий. */
export const LANGS: { id: Lang; name: string }[] = [
  { id: "ru", name: "Русский" },
  { id: "en", name: "English" },
];

/** Русский — для русского и соседних языков, где дети чаще читают по-русски, чем по-английски. */
const RUSSIAN_READERS = ["ru", "uk", "be", "kk"];

/** Язык по списку языков системы (navigator.languages): решает первый, самый предпочтительный. */
export function detectLang(languages: readonly string[]): Lang {
  const first = (languages[0] ?? "").toLowerCase().split("-")[0] ?? "";
  return RUSSIAN_READERS.includes(first) ? "ru" : "en";
}

let current: Lang | undefined;

/** Язык этой страницы. Не меняется до перезагрузки. */
export function lang(): Lang {
  current ??= settings().lang ?? detectLang(navigator.languages?.length ? navigator.languages : [navigator.language]);
  return current;
}

/** Тексты на языке страницы. */
export function messages<T>(m: { ru: T; en: NoInfer<T> }): T {
  return m[lang()];
}

/** Название из описания робота или сборки: строка (одна на все языки) или {"ru": …, "en": …}. */
export type LocalizedText = string | Partial<Record<Lang, string>>;

export function text(value: LocalizedText | null | undefined): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return value[lang()] ?? value.ru ?? value.en ?? "";
}

/** Сменить язык (null — как в системе) и перезагрузить страницу. Черновики программ к этому времени уже сохранены. */
export async function setLang(next: Lang | null): Promise<void> {
  updateSettings({ lang: next });
  await flushSettings();
  location.reload();
}
