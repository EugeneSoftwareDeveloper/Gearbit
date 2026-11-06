import { hub } from "./hub";

/** Кадр протокола от хаба (уведомление robot.trace). */
export interface TraceLine {
  dir: "out" | "in";
  hex: string;
  note: string | null;
  /** Миллисекунды от старта хаба. */
  t: number;
}

type Listener = (line: TraceLine) => void;

const listeners = new Set<Listener>();
let subscribed = false;

/**
 * Журнал протокола общий: его читают панель журнала, помощник замеров и запись сессии.
 * Хаб присылает кадры, пока есть хотя бы один слушатель. Возвращает функцию отписки.
 */
export function listenTrace(listener: Listener): () => void {
  listeners.add(listener);
  sync();
  return () => {
    listeners.delete(listener);
    sync();
  };
}

function sync(force = false): void {
  const wanted = listeners.size > 0;
  if (wanted === subscribed && !force) return;
  subscribed = wanted;
  void hub.call("trace.subscribe", { enabled: wanted }).catch(() => undefined);
}

hub.on("robot.trace", (line: TraceLine) => {
  for (const l of listeners) l(line);
});
// После переподключения к хабу подписку нужно включить заново.
hub.on("hub.connected", () => subscribed && sync(true));

/** «FFFE0104» → «FF FE 01 04». */
export const spacedHex = (hex: string) => hex.replace(/(..)(?!$)/g, "$1 ");
