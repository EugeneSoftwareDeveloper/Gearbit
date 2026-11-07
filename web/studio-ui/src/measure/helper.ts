import { hub } from "../hub";
import { lang, messages } from "../i18n";
import { icons } from "../icons";
import { emergencyStop } from "../input/drive";
import { store } from "../model";
import { listenTrace, spacedHex, type TraceLine } from "../trace";
import { askConfirm } from "../ui/ask-dialog";
import { h, icon } from "../ui/dom";
import { toast } from "../ui/toasts";
import { createCalibrationTab } from "./calibration";
import { POWER_MAX, POWER_MIN, PRESETS, stateFrame } from "./frames";
import { createPowerTab } from "./power-test";
import { addMark, isRecording, onRecordingChange, recordingStats, saveCapture, startRecording, stopRecording } from "./recorder";

const M = messages({
  ru: {
    connectFirst: "Сначала подключите робота: плашка «Нет робота» вверху.",
    confirmTitle: "Включить режим замеров?",
    confirmText:
      "Кадры уходят роботу как есть, без предела мощности: колёса могут крутиться быстро. Поставьте робота на подставку, чтобы колёса крутились в воздухе. Пульт и программы на время замеров выключатся. СТОП и Пробел работают как всегда.",
    confirmOk: "Включить",
    serviceOn: "Режим замеров включён",
    serviceOff: "Режим замеров выключен",
    close: "Закрыть",
    stopTitle: "Остановить моторы (Пробел)",
    stop: "СТОП",
    sections: "Разделы замеров",
    frames: "Кадры",
    power: "Мощность",
    sensors: "Датчики",
    record: "Запись",
    title: "Помощник замеров",
    stillRecording: "Запись замеров продолжается. Остановить — в «Помощнике замеров» на вкладке «Запись».",
    finish: "Закончить замеры",
    statusNoRobot: "Робот не подключён. Подключите SuperBot (или эмулятор, чтобы потренироваться).",
    statusOn: "Режим замеров включён: кадры уходят как есть, пульт и программы выключены.",
    statusOther: "Замеры ведёт другое окно Gearbit. Их можно закончить отсюда.",
    statusOff: "Режим замеров выключен. Он включится сам, когда вы отправите первый кадр.",
    motor: (id: string) => `Мотор ${id}`,
    light: (id: string) => `Свет ${id}`,
    allLightsCode: "Код цвета для всех огоньков",
    hexFrame: "Кадр в hex",
    since: (seconds: string) => `С последнего кадра: ${seconds} с`,
    framesIntro: "Кадры для SuperBot (протокол TUDAO). Пункты — из чек-листа замеров (docs/STAGE0-CHECKLIST.md). Мощность — байт как есть: 10 = 0x0A, −10 = 0xF6.",
    stateFrame: "Кадр состояния",
    allLights: "Все огоньки:",
    fill: "Подставить",
    send: "Отправить",
    anyFrame: "Любой кадр",
    exchange: "Обмен",
    notePlaceholder: "Например: M1 — левое колесо, крутится вперёд",
    note: "Заметка",
    addNote: "Добавить заметку",
    stopAndSave: "Остановить и сохранить…",
    startRecording: "Начать запись",
    notRecording: "Запись не идёт.",
    recording: (time: string, frames: string, marks: number) => `● Идёт запись: ${time} · кадров: ${frames} · заметок: ${marks}`,
    started: "Запись началась",
    saved: "Запись сохранена",
    notSaved: "Запись не сохранена: окно закрыли",
    saveFailed: "Не получилось сохранить файл",
    recordIntro:
      "Запись сохраняет все кадры между компьютером и роботом, события СТОП и ваши заметки. Начните запись до замеров, а после сохраните файл в папку docs/captures репозитория: по нему уточняется протокол и пишутся тесты. Результаты мастеров «Мощность» и «Датчики» попадают в запись сами.",
  },
  en: {
    connectFirst: "Connect a robot first: the «No robot» badge at the top.",
    confirmTitle: "Turn on measurement mode?",
    confirmText:
      "Frames go to the robot as is, without the power limit: the wheels may spin fast. Put the robot on a stand so the wheels turn in the air. The remote and programs are off during measurements. STOP and Space work as always.",
    confirmOk: "Turn on",
    serviceOn: "Measurement mode on",
    serviceOff: "Measurement mode off",
    close: "Close",
    stopTitle: "Stop the motors (Space)",
    stop: "STOP",
    sections: "Measurement sections",
    frames: "Frames",
    power: "Power",
    sensors: "Sensors",
    record: "Recording",
    title: "Measurement helper",
    stillRecording: "The measurement recording continues. Stop it in the «Measurement helper», «Recording» tab.",
    finish: "Finish measurements",
    statusNoRobot: "No robot connected. Connect a SuperBot (or the emulator to practice).",
    statusOn: "Measurement mode is on: frames go as is, the remote and programs are off.",
    statusOther: "Another Gearbit window is measuring. You can finish it from here.",
    statusOff: "Measurement mode is off. It turns on by itself when you send the first frame.",
    motor: (id) => `Motor ${id}`,
    light: (id) => `Light ${id}`,
    allLightsCode: "Color code for all lights",
    hexFrame: "Frame in hex",
    since: (seconds) => `Since the last frame: ${seconds} s`,
    framesIntro: "Frames for SuperBot (TUDAO protocol). Items are from the measurement checklist (docs/STAGE0-CHECKLIST.md). Power is the byte as is: 10 = 0x0A, −10 = 0xF6.",
    stateFrame: "State frame",
    allLights: "All lights:",
    fill: "Fill in",
    send: "Send",
    anyFrame: "Any frame",
    exchange: "Exchange",
    notePlaceholder: "For example: M1 — left wheel, turns forward",
    note: "Note",
    addNote: "Add a note",
    stopAndSave: "Stop and save…",
    startRecording: "Start recording",
    notRecording: "Not recording.",
    recording: (time, frames, marks) => `● Recording: ${time} · frames: ${frames} · notes: ${marks}`,
    started: "Recording started",
    saved: "Recording saved",
    notSaved: "Recording not saved: the window was closed",
    saveFailed: "Could not save the file",
    recordIntro:
      "The recording keeps all frames between the computer and the robot, STOP events and your notes. Start recording before measuring, then save the file into the docs/captures folder of the repository: it is used to refine the protocol and write tests. Results of the «Power» and «Sensors» wizards get into the recording by themselves.",
  },
});

/**
 * Помощник замеров (этап 0): всё, что раньше делали в nRF Connect, — внутри Gearbit.
 * Вкладки: кадры вручную, тест мощности, калибровка датчиков расстояния, запись сессии.
 * Кадры уходят через режим замеров хаба (service.*): цикл отправки молчит, пульт и программы выключены,
 * СТОП работает как всегда. Закрыли окно — замеры закончены, моторы в 0.
 */

export interface MeasureContext {
  /** Включить режим замеров (при первом включении — предупреждение). false — отказались или не вышло. */
  ensureService(): Promise<boolean>;
  /** Отправить кадр в режиме замеров. Ошибка — исключение с понятным текстом. */
  send(hex: string): Promise<void>;
}

interface Tab {
  id: string;
  title: string;
  glyph: string;
  element: HTMLElement;
  /** Окно закрывается или пришёл СТОП: прекратить, что делает вкладка. */
  stop?(): void;
}

export function createMeasureHelper(): { open: () => void } {
  let owned = false;
  let warned = false;
  let lastSentAt: number | null = null;

  const ctx: MeasureContext = {
    async ensureService() {
      const robot = store.state.robot;
      if (robot?.state !== "connected") {
        toast(M.connectFirst, "error");
        return false;
      }
      if (robot.serviceMode && owned) return true;
      if (!warned) {
        const ok = await askConfirm(
          M.confirmTitle,
          M.confirmText,
          M.confirmOk,
        );
        if (!ok) return false;
        warned = true;
      }
      try {
        await hub.call("service.begin");
        owned = true;
        renderStatus();
        addMark(M.serviceOn);
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), "error");
        return false;
      }
    },
    async send(hex: string) {
      await hub.call("service.send", { hex }, 3000);
      lastSentAt = performance.now();
    },
  };

  const endService = async () => {
    if (!owned) return;
    owned = false;
    lastSentAt = null;
    renderStatus();
    try {
      await hub.call("service.end");
      addMark(M.serviceOff);
    } catch {
      /* хаб недоступен — он сам закончит замеры, когда увидит, что мы отключились */
    }
  };

  /* ---------- Окно ---------- */
  const closeBtn = h("button", { class: "btn icon ghost", "aria-label": M.close }, icon(icons.close));
  const stopBtn = h("button", { class: "btn danger small", title: M.stopTitle }, icon(icons.stop), M.stop);
  const status = h("div", { class: "measure-status" });
  const tabsBar = h("div", { class: "segmented measure-tabs", role: "tablist", "aria-label": M.sections });
  const panels = h("div", { class: "measure-panels" });

  const tabs: Tab[] = [
    { id: "frames", title: M.frames, glyph: icons.chip, ...createFramesTab(ctx, () => lastSentAt) },
    { id: "power", title: M.power, glyph: icons.motor, ...createPowerTab(ctx) },
    { id: "sensors", title: M.sensors, glyph: icons.radar, ...createCalibrationTab() },
    { id: "record", title: M.record, glyph: icons.save, ...createRecordTab() },
  ];
  const select = (id: string) => {
    for (const t of tabs) {
      const on = t.id === id;
      t.element.classList.toggle("hidden", !on);
      tabsBar.querySelector<HTMLButtonElement>(`[data-tab="${t.id}"]`)?.setAttribute("aria-pressed", String(on));
    }
  };
  for (const t of tabs) {
    tabsBar.append(h("button", { "data-tab": t.id, "aria-pressed": "false", role: "tab", onclick: () => select(t.id) }, icon(t.glyph), t.title));
    panels.append(t.element);
  }
  select("frames");

  const dialog = h(
    "dialog",
    { class: "wide measure-dialog", "aria-labelledby": "measure-title" },
    h("header", { class: "dialog-head" }, icon(icons.chip), h("h2", { id: "measure-title" }, M.title), stopBtn, closeBtn),
    h("div", { class: "dialog-body" }, status, tabsBar, panels),
  );
  document.body.append(dialog);

  const stopTabs = () => {
    for (const t of tabs) t.stop?.();
  };
  stopBtn.onclick = () => {
    stopTabs();
    void emergencyStop();
  };
  closeBtn.onclick = () => dialog.close();
  dialog.addEventListener("close", () => {
    stopTabs();
    void endService();
    if (isRecording()) toast(M.stillRecording, "info", 6000);
  });
  hub.on("safety.event", stopTabs);

  /* ---------- Строка состояния ---------- */
  const endBtn = h("button", { class: "btn small", onclick: () => void endService() }, M.finish);
  const statusText = h("span", { class: "text" });
  status.append(icon(icons.info), statusText, endBtn);
  function renderStatus(): void {
    const robot = store.state.robot;
    if (!robot?.serviceMode) owned = false;
    const connected = robot?.state === "connected";
    status.classList.toggle("on", !!robot?.serviceMode);
    endBtn.classList.toggle("hidden", !robot?.serviceMode);
    statusText.textContent = !connected
      ? M.statusNoRobot
      : robot.serviceMode
        ? owned
          ? M.statusOn
          : M.statusOther
        : M.statusOff;
  }
  store.subscribe(renderStatus);

  return {
    open: () => {
      if (!dialog.open) dialog.showModal();
    },
  };
}

/* ---------- Кадры вручную ---------- */
function createFramesTab(ctx: MeasureContext, lastSentAt: () => number | null): Pick<Tab, "element" | "stop"> {
  const send = async (hex: string) => {
    if (!(await ctx.ensureService())) return;
    try {
      await ctx.send(hex);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  // Конструктор кадра состояния.
  const motorInputs = ["M1", "M2", "M3"].map((id) =>
    h("input", { class: "text-input", type: "number", min: POWER_MIN, max: POWER_MAX, step: 1, value: 0, "aria-label": M.motor(id) }),
  );
  const lightInputs = ["L1", "L2", "L3", "L4"].map((id) =>
    h("input", { class: "text-input", type: "number", min: 0, max: 255, step: 1, value: 0, "aria-label": M.light(id) }),
  );
  const preview = h("code", { class: "hex-preview" });
  const read = (input: HTMLInputElement, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(input.value) || 0)));
  const built = () =>
    stateFrame(
      motorInputs.map((i) => read(i, POWER_MIN, POWER_MAX)),
      lightInputs.map((i) => read(i, 0, 255)),
    );
  const updatePreview = () => (preview.textContent = spacedHex(built()));
  for (const i of [...motorInputs, ...lightInputs]) i.addEventListener("input", updatePreview);
  updatePreview();
  const allLights = h("input", { class: "text-input", type: "number", min: 0, max: 255, step: 1, value: 1, "aria-label": M.allLightsCode });
  const builder = h(
    "div",
    { class: "frame-builder" },
    ...["M1", "M2", "M3"].map((id, i) => h("label", {}, h("span", {}, id), motorInputs[i]!)),
    ...["L1", "L2", "L3", "L4"].map((id, i) => h("label", {}, h("span", {}, id), lightInputs[i]!)),
  );

  // Свободный ввод.
  const hexInput = h("input", { class: "text-input mono", type: "text", placeholder: "FF FE 01 04 FD FC", spellcheck: "false", "aria-label": M.hexFrame });
  hexInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void send(hexInput.value);
  });

  // Последние кадры: повторы схлопываются в «×N» (телеметрия и повтор кадра состояния идут вперемешку,
  // поэтому сравниваем с несколькими последними строками, а не только с предыдущей).
  const log = h("div", { class: "mini-log", role: "log" });
  let recent: { dir: string; hex: string; row: HTMLElement; count: number }[] = [];
  const onLine = (line: TraceLine) => {
    const same = recent.find((r) => r.dir === line.dir && r.hex === line.hex);
    if (same) {
      same.count++;
      same.row.querySelector(".count")!.textContent = `×${same.count}`;
      return;
    }
    const row = h(
      "div",
      { class: `trace-line ${line.dir}` },
      h("span", { class: "dir" }, line.dir === "out" ? "→" : "←"),
      h("span", { class: "hex" }, spacedHex(line.hex)),
      h("span", { class: "note" }, line.note ?? ""),
      h("span", { class: "count muted" }),
    );
    log.append(row);
    while (log.childElementCount > 14) log.firstElementChild?.remove();
    recent = [...recent.slice(-3), { dir: line.dir, hex: line.hex, row, count: 1 }];
    log.scrollTop = log.scrollHeight;
  };
  let unlisten: (() => void) | null = null;

  // Сколько прошло с последнего кадра: для проверки «останавливается ли робот сам» (п. 8).
  const since = h("span", { class: "muted" });
  window.setInterval(() => {
    const at = lastSentAt();
    since.textContent = at === null ? "" : M.since(((performance.now() - at) / 1000).toFixed(1));
  }, 200);

  const element = h(
    "section",
    { class: "measure-panel" },
    h("p", { class: "muted" }, M.framesIntro),
    h("div", { class: "preset-row" }, ...PRESETS.map((p) => h("button", { class: "btn small", title: p.hint, onclick: () => void send(p.hex) }, p.title))),
    h("h3", {}, M.stateFrame),
    builder,
    h(
      "div",
      { class: "frame-actions" },
      preview,
      h("div", { class: "spacer" }),
      h("label", { class: "inline" }, M.allLights, allLights),
      h(
        "button",
        {
          class: "btn small",
          onclick: () => {
            for (const i of lightInputs) i.value = allLights.value;
            updatePreview();
          },
        },
        M.fill,
      ),
      h("button", { class: "btn primary small", onclick: () => void send(built()) }, icon(icons.play), M.send),
    ),
    h("h3", {}, M.anyFrame),
    h("div", { class: "frame-actions" }, hexInput, h("button", { class: "btn primary small", onclick: () => void send(hexInput.value) }, icon(icons.play), M.send)),
    h("div", { class: "frame-actions" }, h("h3", {}, M.exchange), h("div", { class: "spacer" }), since),
    log,
  );

  // Журнал слушаем, только пока окно открыто.
  new MutationObserver(() => {
    const open = !!element.closest("dialog[open]");
    if (open && !unlisten) unlisten = listenTrace(onLine);
    if (!open && unlisten) {
      unlisten();
      unlisten = null;
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });

  return { element };
}

/* ---------- Запись сессии ---------- */
function createRecordTab(): Pick<Tab, "element"> {
  const state = h("p", { class: "record-state" });
  const toggle = h("button", { class: "btn primary" });
  const note = h("input", { class: "text-input", type: "text", maxlength: 300, placeholder: M.notePlaceholder, "aria-label": M.note });
  const addBtn = h("button", { class: "btn" }, M.addNote);

  const render = () => {
    const stats = recordingStats();
    const recording = stats !== null;
    toggle.replaceChildren(icon(recording ? icons.save : icons.play), recording ? M.stopAndSave : M.startRecording);
    toggle.classList.toggle("primary", !recording);
    toggle.classList.toggle("danger", recording);
    note.disabled = !recording;
    addBtn.disabled = !recording;
    if (!stats) {
      state.textContent = M.notRecording;
      return;
    }
    const s = Math.floor(stats.ms / 1000);
    state.textContent = M.recording(`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`, stats.frames.toLocaleString(lang()), stats.marks);
  };
  onRecordingChange(render);
  window.setInterval(() => isRecording() && render(), 500);
  render();

  toggle.onclick = async () => {
    if (!isRecording()) {
      startRecording();
      toast(M.started, "ok");
      return;
    }
    const capture = stopRecording();
    if (!capture) return;
    try {
      if (await saveCapture(capture)) toast(M.saved, "ok");
      else toast(M.notSaved, "info");
    } catch {
      toast(M.saveFailed, "error");
    }
  };
  const add = () => {
    const text = note.value.trim();
    if (!text) return;
    addMark(text);
    note.value = "";
    render();
  };
  addBtn.onclick = add;
  note.addEventListener("keydown", (e) => {
    if (e.key === "Enter") add();
  });

  const element = h(
    "section",
    { class: "measure-panel" },
    h(
      "p",
      { class: "muted" },
      M.recordIntro,
    ),
    state,
    h("div", { class: "frame-actions" }, toggle),
    h("h3", {}, M.note),
    h("div", { class: "frame-actions" }, note, addBtn),
  );
  return { element };
}
