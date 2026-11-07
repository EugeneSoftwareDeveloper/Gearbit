/**
 * Локальная история программ (как Local History в IDE): снимки хранит хаб в
 * %LOCALAPPDATA%\Gearbit\History (/api/history). Черновик в localStorage остаётся мгновенной копией,
 * а история — страховка: «Новая», пример или открытый файл больше не стирают работу без следа.
 *
 * Когда делается снимок:
 *  - перед заменой программы («Новая», пример, файл, возврат версии) и при запуске;
 *  - при старте вкладки (хаб не пишет снимок, если он такой же, как последний);
 *  - во время работы — не чаще раза в 5 минут;
 *  - когда окно сворачивают или закрывают.
 * Программа без изменений (пустая, пример как есть, сохранённая в файл) в историю не попадает.
 */

export type HistoryKind = "blocks" | "python" | "csharp";

export type HistoryReason = "new" | "example" | "open" | "restore" | "run" | "auto" | "leave" | "start";

export interface HistoryEntry {
  id: string;
  time: string;
  reason: HistoryReason;
  name: string | null;
  size: number;
}

export interface HistorySnapshot extends Omit<HistoryEntry, "size"> {
  content: string;
}

/** Программа на экране: имя и текст снимка. null — сохранять нечего. */
export type CurrentProgram = () => { name: string | null; content: string } | null;

export interface ProgramHistory {
  /** Сделать снимок сейчас. Хаба нет — тихо ничего не делает. */
  snapshot(reason: HistoryReason, keepalive?: boolean): Promise<void>;
  /** Программа изменилась (после сохранения черновика): снимок, если с прошлого прошло 5 минут. */
  changed(): void;
  list(): Promise<HistoryEntry[]>;
  get(id: string): Promise<HistorySnapshot>;
}

const AUTO_INTERVAL_MS = 5 * 60_000;
/** Браузер не отправит при закрытии страницы запрос больше 64 КБ (keepalive). */
const KEEPALIVE_LIMIT = 60_000;

export function createHistory(kind: HistoryKind, current: CurrentProgram): ProgramHistory {
  const api = `/api/history/${kind}`;
  let lastContent: string | null = null;
  // Первый автоснимок — через 5 минут работы: начало покрывает снимок «start».
  let lastAttempt = Date.now();
  let queue: Promise<void> = Promise.resolve();

  function snapshot(reason: HistoryReason, keepalive = false): Promise<void> {
    const program = current();
    if (!program || program.content.trim() === "" || program.content === lastContent) return queue;
    lastAttempt = Date.now();
    const body = JSON.stringify({ reason, name: program.name, content: program.content });
    const send = () =>
      fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: keepalive && body.length < KEEPALIVE_LIMIT,
      }).then((response) => {
        if (response.ok) lastContent = program.content;
      });
    // По очереди: иначе снимок «перед заменой» мог бы записаться позже следующего.
    queue = queue.then(send).catch(() => undefined); // хаба нет — снимок пропускаем, черновик в localStorage цел
    return queue;
  }

  // Свернули или закрыли окно — последняя версия попадает в историю.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void snapshot("leave", true);
  });

  return {
    snapshot,
    changed() {
      if (Date.now() - lastAttempt >= AUTO_INTERVAL_MS) void snapshot("auto");
    },
    async list() {
      const response = await fetch(api, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(String(response.status));
      return (await response.json()) as HistoryEntry[];
    },
    async get(id) {
      const response = await fetch(`${api}/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(String(response.status));
      return (await response.json()) as HistorySnapshot;
    },
  };
}
