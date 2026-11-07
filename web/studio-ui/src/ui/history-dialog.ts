import type { HistoryEntry, HistoryReason, HistorySnapshot, ProgramHistory } from "../history";
import { lang, messages } from "../i18n";
import { icons } from "../icons";
import { h, icon } from "./dom";
import { toast } from "./toasts";

/**
 * Окно «История»: снимки программы по дням, просмотр выбранного и «Вернуть эту версию».
 * Перед возвратом текущая программа сама попадает в историю — так ничего не теряется.
 */

const M = messages({
  ru: {
    title: "История программы",
    close: "Закрыть",
    intro: "Gearbit сам сохраняет программу: при запуске, перед новой программой, примером или открытием файла и каждые 5 минут, пока вы работаете.",
    empty: "Снимков пока нет. Поменяйте программу или запустите её — здесь появится первая версия.",
    noHub: "Нет связи с хабом Gearbit: история хранится на компьютере, где он запущен.",
    choose: "Выберите версию слева, чтобы посмотреть её.",
    loadFailed: "Не получилось открыть эту версию.",
    restore: "Вернуть эту версию",
    restored: "Версия возвращена. Прежняя программа — в истории.",
    today: "Сегодня",
    yesterday: "Вчера",
    untitled: "Без названия",
    reasons: {
      new: "перед новой программой",
      example: "перед примером",
      open: "перед открытием файла",
      restore: "перед возвратом версии",
      run: "запуск",
      auto: "автосохранение",
      leave: "окно свернули",
      start: "открытие Gearbit",
    } satisfies Record<HistoryReason, string>,
  },
  en: {
    title: "Program history",
    close: "Close",
    intro: "Gearbit saves the program by itself: when you run it, before a new program, an example or opening a file, and every 5 minutes while you work.",
    empty: "No versions yet. Change the program or run it, and the first version will appear here.",
    noHub: "No connection to the Gearbit hub: the history is kept on the computer where it runs.",
    choose: "Choose a version on the left to look at it.",
    loadFailed: "Could not open this version.",
    restore: "Restore this version",
    restored: "The version is restored. The previous program is in the history.",
    today: "Today",
    yesterday: "Yesterday",
    untitled: "Untitled",
    reasons: {
      new: "before a new program",
      example: "before an example",
      open: "before opening a file",
      restore: "before restoring a version",
      run: "run",
      auto: "autosave",
      leave: "window hidden",
      start: "Gearbit opened",
    },
  },
});

export interface HistoryDialogOptions {
  history: ProgramHistory;
  /** Как показать снимок: текст программы или краткое описание блоков. */
  preview(snapshot: HistorySnapshot): HTMLElement;
  /** Вернуть версию на экран. Текущую программу окно перед этим сохраняет в историю. */
  restore(snapshot: HistorySnapshot): void;
}

export function createHistoryDialog(options: HistoryDialogOptions): { open: () => void } {
  const closeBtn = h("button", { class: "btn icon ghost", "aria-label": M.close }, icon(icons.close));
  const list = h("div", { class: "history-list", role: "listbox", "aria-label": M.title });
  const view = h("div", { class: "history-view" });
  const restoreBtn = h("button", { class: "btn primary", disabled: true }, icon(icons.history), h("span", {}, M.restore));
  const titleId = `history-title-${Math.random().toString(36).slice(2, 8)}`;
  const dialog = h(
    "dialog",
    { class: "wide history-dialog", "aria-labelledby": titleId },
    h("header", { class: "dialog-head" }, icon(icons.history), h("h2", { id: titleId }, M.title), closeBtn),
    h("div", { class: "dialog-body" }, h("p", { class: "muted", style: "margin:0" }, M.intro), h("div", { class: "history-panes" }, list, view)),
    h("footer", { class: "dialog-foot" }, restoreBtn),
  );
  document.body.append(dialog);
  closeBtn.onclick = () => dialog.close();
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });

  let selected: HistorySnapshot | null = null;
  let request = 0;

  function message(text: string): HTMLElement {
    return h("p", { class: "muted history-message" }, text);
  }

  async function select(entry: HistoryEntry, button: HTMLElement): Promise<void> {
    for (const b of list.querySelectorAll("[aria-selected]")) b.setAttribute("aria-selected", "false");
    button.setAttribute("aria-selected", "true");
    const mine = ++request;
    selected = null;
    restoreBtn.disabled = true;
    try {
      const snapshot = await options.history.get(entry.id);
      if (mine !== request) return;
      selected = snapshot;
      view.replaceChildren(options.preview(snapshot));
      restoreBtn.disabled = false;
    } catch {
      if (mine === request) view.replaceChildren(message(M.loadFailed));
    }
  }

  async function refresh(): Promise<void> {
    selected = null;
    restoreBtn.disabled = true;
    list.replaceChildren();
    view.replaceChildren(message(M.choose));
    let entries: HistoryEntry[];
    try {
      entries = await options.history.list();
    } catch {
      view.replaceChildren(message(M.noHub));
      return;
    }
    if (entries.length === 0) {
      view.replaceChildren(message(M.empty));
      return;
    }
    let day = "";
    for (const entry of entries) {
      const time = new Date(entry.time);
      const label = dayLabel(time);
      if (label !== day) {
        day = label;
        list.append(h("h3", {}, label));
      }
      const button = h(
        "button",
        { class: "history-item", role: "option", "aria-selected": "false" },
        h("span", { class: "time" }, time.toLocaleTimeString(lang(), { hour: "2-digit", minute: "2-digit" })),
        h("span", { class: "reason" }, M.reasons[entry.reason] ?? entry.reason),
        h("span", { class: "name" }, entry.name ?? M.untitled),
      );
      button.onclick = () => void select(entry, button);
      list.append(button);
    }
    const first = list.querySelector<HTMLElement>(".history-item");
    if (first) void select(entries[0]!, first);
  }

  restoreBtn.onclick = async () => {
    const snapshot = selected;
    if (!snapshot) return;
    restoreBtn.disabled = true;
    await options.history.snapshot("restore");
    options.restore(snapshot);
    dialog.close();
    toast(M.restored, "ok");
  };

  return {
    open() {
      dialog.showModal();
      void refresh();
    },
  };
}

function dayLabel(time: Date): string {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(time)) / 86_400_000);
  if (days === 0) return M.today;
  if (days === 1) return M.yesterday;
  return time.toLocaleDateString(lang(), { weekday: "long", day: "numeric", month: "long" });
}
