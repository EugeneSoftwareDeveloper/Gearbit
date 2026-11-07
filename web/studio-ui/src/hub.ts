/**
 * Клиент хаба: JSON-RPC 2.0 через WebSocket с автоматическим переподключением.
 * Тот же протокол используют Python- и C#-клиенты (docs/dev/hub-api.md).
 */

import { lang, messages } from "./i18n";

const M = messages({
  ru: {
    noHub: "Нет связи с хабом",
    noAnswer: (method: string) => `Хаб не ответил: ${method}`,
    lost: "Связь с хабом прервана",
    clientName: "Пульт Gearbit",
  },
  en: {
    noHub: "No connection to the hub",
    noAnswer: (method) => `The hub did not answer: ${method}`,
    lost: "Connection to the hub was lost",
    clientName: "Gearbit remote",
  },
});

export class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: number };
type Listener = (params: any) => void;
export type HubStatus = "connecting" | "open" | "closed";

export class HubClient {
  private socket?: WebSocket;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly statusListeners = new Set<(s: HubStatus) => void>();
  private retryMs = 500;
  status: HubStatus = "closed";

  constructor(
    private readonly url: string,
    private readonly clientName: string,
  ) {}

  start(): void {
    this.open();
  }

  /** Вызов метода хаба. Ошибки хаба приходят как RpcError с понятным текстом. */
  call<T = any>(method: string, params: Record<string, unknown> = {}, timeoutMs = 15000): Promise<T> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new RpcError(-1, M.noHub));
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new RpcError(-2, M.noAnswer(method)));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  /** Отправить без ожидания ответа (частые команды движения). */
  notify(method: string, params: Record<string, unknown> = {}): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
    }
  }

  on(method: string, listener: Listener): () => void {
    let set = this.listeners.get(method);
    if (!set) {
      set = new Set();
      this.listeners.set(method, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  onStatus(listener: (s: HubStatus) => void): void {
    this.statusListeners.add(listener);
  }

  private setStatus(status: HubStatus): void {
    this.status = status;
    for (const l of this.statusListeners) l(status);
  }

  private open(): void {
    this.setStatus("connecting");
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = async () => {
      this.retryMs = 500;
      this.setStatus("open");
      this.emit("hub.connected", await this.call("hub.hello", { name: this.clientName, lang: lang() }).catch(() => null));
    };

    socket.onmessage = (event) => {
      let message: any;
      try {
        message = JSON.parse(event.data as string);
      } catch {
        return;
      }
      if (message.id !== undefined && message.id !== null && (message.result !== undefined || message.error)) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new RpcError(message.error.code, message.error.message));
        else pending.resolve(message.result);
      } else if (typeof message.method === "string") {
        this.emit(message.method, message.params);
      }
    };

    socket.onclose = () => {
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new RpcError(-1, M.lost));
      }
      this.pending.clear();
      this.setStatus("closed");
      window.setTimeout(() => this.open(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 5000);
    };
  }

  private emit(method: string, params: unknown): void {
    const set = this.listeners.get(method);
    if (set) for (const l of set) l(params);
  }
}

const protocol = location.protocol === "https:" ? "wss" : "ws";
export const hub = new HubClient(`${protocol}://${location.host}/ws`, M.clientName);
