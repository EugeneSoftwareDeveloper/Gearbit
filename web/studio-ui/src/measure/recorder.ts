import { hub } from "../hub";
import { store } from "../model";
import { listenTrace, type TraceLine } from "../trace";
import { saveJsonFile } from "../ui/files";

/**
 * Запись сессии замеров: все кадры протокола, события безопасности, заметки и результаты мастеров.
 * Файл кладут в docs/captures — по нему уточняют протокол и пишут тесты на «золотых» кадрах.
 * Формат описан в docs/captures/README.md.
 */

export const CAPTURE_FORMAT = "gearbit-capture";
export const CAPTURE_FILE = { description: "Запись замеров Gearbit", suffix: ".capture.json" };

/** Больше кадров не храним: при 10 кадрах телеметрии в секунду это несколько часов. */
const MAX_FRAMES = 200_000;

export interface CaptureFrame {
  /** Мс от начала записи (часы интерфейса). */
  at: number;
  /** Мс от старта хаба (часы хаба). */
  t: number;
  dir: "out" | "in";
  hex: string;
  note?: string;
}

export interface CaptureMark {
  at: number;
  text: string;
  data?: unknown;
}

export interface CaptureEvent {
  at: number;
  type: string;
  data: unknown;
}

export interface Capture {
  format: typeof CAPTURE_FORMAT;
  version: 1;
  startedAt: string;
  durationMs: number;
  robot: { name: string; deviceId: string; profileId: string | null; firmware: string | null } | null;
  truncated: boolean;
  frames: CaptureFrame[];
  marks: CaptureMark[];
  events: CaptureEvent[];
}

interface Session {
  started: number;
  capture: Capture;
  stop: (() => void)[];
}

let session: Session | null = null;
const listeners = new Set<(recording: boolean) => void>();

export const isRecording = () => session !== null;

export function onRecordingChange(listener: (recording: boolean) => void): void {
  listeners.add(listener);
}

/** Сколько записано: для строки состояния. */
export function recordingStats(): { ms: number; frames: number; marks: number } | null {
  if (!session) return null;
  return { ms: performance.now() - session.started, frames: session.capture.frames.length, marks: session.capture.marks.length };
}

export function startRecording(): void {
  if (session) return;
  const robot = store.state.robot;
  const started = performance.now();
  const capture: Capture = {
    format: CAPTURE_FORMAT,
    version: 1,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    // UID робота не записываем: файлы попадают в репозиторий.
    robot: robot ? { name: robot.name, deviceId: robot.deviceId, profileId: robot.profileId, firmware: robot.firmware } : null,
    truncated: false,
    frames: [],
    marks: [],
    events: [],
  };
  const at = () => Math.round(performance.now() - started);
  const onFrame = (line: TraceLine) => {
    if (capture.frames.length >= MAX_FRAMES) {
      capture.truncated = true;
      return;
    }
    capture.frames.push({ at: at(), t: line.t, dir: line.dir, hex: line.hex, ...(line.note ? { note: line.note } : {}) });
  };
  const event = (type: string) => (data: unknown) => capture.events.push({ at: at(), type, data });
  session = {
    started,
    capture,
    stop: [
      listenTrace(onFrame),
      hub.on("safety.event", event("safety.event")),
      hub.on("robot.state", event("robot.state")),
      hub.on("robot.info", (info: unknown) => {
        // Прошивка становится известна после первого кадра телеметрии.
        const r = info as { firmware?: string | null } | null;
        if (capture.robot && r?.firmware) capture.robot.firmware = r.firmware;
      }),
    ],
  };
  for (const l of listeners) l(true);
}

/** Заметка в записи. Без записи ничего не делает. */
export function addMark(text: string, data?: unknown): void {
  if (!session) return;
  session.capture.marks.push({ at: Math.round(performance.now() - session.started), text, ...(data === undefined ? {} : { data }) });
}

export function stopRecording(): Capture | null {
  if (!session) return null;
  const { capture, started, stop } = session;
  session = null;
  for (const s of stop) s();
  capture.durationMs = Math.round(performance.now() - started);
  for (const l of listeners) l(false);
  return capture;
}

/** Предложить сохранить запись. Имя файла — дата и время начала. */
export function saveCapture(capture: Capture): Promise<boolean> {
  const stamp = capture.startedAt.slice(0, 16).replace("T", "-").replace(":", "");
  return saveJsonFile(capture, `${stamp}${CAPTURE_FILE.suffix}`, CAPTURE_FILE);
}
