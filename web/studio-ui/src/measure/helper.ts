import { hub } from "../hub";
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
        toast("Сначала подключите робота: плашка «Нет робота» вверху.", "error");
        return false;
      }
      if (robot.serviceMode && owned) return true;
      if (!warned) {
        const ok = await askConfirm(
          "Включить режим замеров?",
          "Кадры уходят роботу как есть, без предела мощности: колёса могут крутиться быстро. Поставьте робота на подставку, чтобы колёса крутились в воздухе. Пульт и программы на время замеров выключатся. СТОП и Пробел работают как всегда.",
          "Включить",
        );
        if (!ok) return false;
        warned = true;
      }
      try {
        await hub.call("service.begin");
        owned = true;
        renderStatus();
        addMark("Режим замеров включён");
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
      addMark("Режим замеров выключен");
    } catch {
      /* хаб недоступен — он сам закончит замеры, когда увидит, что мы отключились */
    }
  };

  /* ---------- Окно ---------- */
  const closeBtn = h("button", { class: "btn icon ghost", "aria-label": "Закрыть" }, icon(icons.close));
  const stopBtn = h("button", { class: "btn danger small", title: "Остановить моторы (Пробел)" }, icon(icons.stop), "СТОП");
  const status = h("div", { class: "measure-status" });
  const tabsBar = h("div", { class: "segmented measure-tabs", role: "tablist", "aria-label": "Разделы замеров" });
  const panels = h("div", { class: "measure-panels" });

  const tabs: Tab[] = [
    { id: "frames", title: "Кадры", glyph: icons.chip, ...createFramesTab(ctx, () => lastSentAt) },
    { id: "power", title: "Мощность", glyph: icons.motor, ...createPowerTab(ctx) },
    { id: "sensors", title: "Датчики", glyph: icons.radar, ...createCalibrationTab() },
    { id: "record", title: "Запись", glyph: icons.save, ...createRecordTab() },
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
    h("header", { class: "dialog-head" }, icon(icons.chip), h("h2", { id: "measure-title" }, "Помощник замеров"), stopBtn, closeBtn),
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
    if (isRecording()) toast("Запись замеров продолжается. Остановить — в «Помощнике замеров» на вкладке «Запись».", "info", 6000);
  });
  hub.on("safety.event", stopTabs);

  /* ---------- Строка состояния ---------- */
  const endBtn = h("button", { class: "btn small", onclick: () => void endService() }, "Закончить замеры");
  const statusText = h("span", { class: "text" });
  status.append(icon(icons.info), statusText, endBtn);
  function renderStatus(): void {
    const robot = store.state.robot;
    if (!robot?.serviceMode) owned = false;
    const connected = robot?.state === "connected";
    status.classList.toggle("on", !!robot?.serviceMode);
    endBtn.classList.toggle("hidden", !robot?.serviceMode);
    statusText.textContent = !connected
      ? "Робот не подключён. Подключите SuperBot (или эмулятор, чтобы потренироваться)."
      : robot.serviceMode
        ? owned
          ? "Режим замеров включён: кадры уходят как есть, пульт и программы выключены."
          : "Замеры ведёт другое окно Gearbit. Их можно закончить отсюда."
        : "Режим замеров выключен. Он включится сам, когда вы отправите первый кадр.";
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
    h("input", { class: "text-input", type: "number", min: POWER_MIN, max: POWER_MAX, step: 1, value: 0, "aria-label": `Мотор ${id}` }),
  );
  const lightInputs = ["L1", "L2", "L3", "L4"].map((id) =>
    h("input", { class: "text-input", type: "number", min: 0, max: 255, step: 1, value: 0, "aria-label": `Свет ${id}` }),
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
  const allLights = h("input", { class: "text-input", type: "number", min: 0, max: 255, step: 1, value: 1, "aria-label": "Код цвета для всех огоньков" });
  const builder = h(
    "div",
    { class: "frame-builder" },
    ...["M1", "M2", "M3"].map((id, i) => h("label", {}, h("span", {}, id), motorInputs[i]!)),
    ...["L1", "L2", "L3", "L4"].map((id, i) => h("label", {}, h("span", {}, id), lightInputs[i]!)),
  );

  // Свободный ввод.
  const hexInput = h("input", { class: "text-input mono", type: "text", placeholder: "FF FE 01 04 FD FC", spellcheck: "false", "aria-label": "Кадр в hex" });
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
    since.textContent = at === null ? "" : `С последнего кадра: ${((performance.now() - at) / 1000).toFixed(1)} с`;
  }, 200);

  const element = h(
    "section",
    { class: "measure-panel" },
    h("p", { class: "muted" }, "Кадры для SuperBot (протокол TUDAO). Пункты — из чек-листа замеров (docs/STAGE0-CHECKLIST.md). Мощность — байт как есть: 10 = 0x0A, −10 = 0xF6."),
    h("div", { class: "preset-row" }, ...PRESETS.map((p) => h("button", { class: "btn small", title: p.hint, onclick: () => void send(p.hex) }, p.title))),
    h("h3", {}, "Кадр состояния"),
    builder,
    h(
      "div",
      { class: "frame-actions" },
      preview,
      h("div", { class: "spacer" }),
      h("label", { class: "inline" }, "Все огоньки:", allLights),
      h(
        "button",
        {
          class: "btn small",
          onclick: () => {
            for (const i of lightInputs) i.value = allLights.value;
            updatePreview();
          },
        },
        "Подставить",
      ),
      h("button", { class: "btn primary small", onclick: () => void send(built()) }, icon(icons.play), "Отправить"),
    ),
    h("h3", {}, "Любой кадр"),
    h("div", { class: "frame-actions" }, hexInput, h("button", { class: "btn primary small", onclick: () => void send(hexInput.value) }, icon(icons.play), "Отправить")),
    h("div", { class: "frame-actions" }, h("h3", {}, "Обмен"), h("div", { class: "spacer" }), since),
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
  const note = h("input", { class: "text-input", type: "text", maxlength: 300, placeholder: "Например: M1 — левое колесо, крутится вперёд", "aria-label": "Заметка" });
  const addBtn = h("button", { class: "btn" }, "Добавить заметку");

  const render = () => {
    const stats = recordingStats();
    const recording = stats !== null;
    toggle.replaceChildren(icon(recording ? icons.save : icons.play), recording ? "Остановить и сохранить…" : "Начать запись");
    toggle.classList.toggle("primary", !recording);
    toggle.classList.toggle("danger", recording);
    note.disabled = !recording;
    addBtn.disabled = !recording;
    if (!stats) {
      state.textContent = "Запись не идёт.";
      return;
    }
    const s = Math.floor(stats.ms / 1000);
    state.textContent = `● Идёт запись: ${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")} · кадров: ${stats.frames.toLocaleString("ru-RU")} · заметок: ${stats.marks}`;
  };
  onRecordingChange(render);
  window.setInterval(() => isRecording() && render(), 500);
  render();

  toggle.onclick = async () => {
    if (!isRecording()) {
      startRecording();
      toast("Запись началась", "ok");
      return;
    }
    const capture = stopRecording();
    if (!capture) return;
    try {
      if (await saveCapture(capture)) toast("Запись сохранена", "ok");
      else toast("Запись не сохранена: окно закрыли", "info");
    } catch {
      toast("Не получилось сохранить файл", "error");
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
      "Запись сохраняет все кадры между компьютером и роботом, события СТОП и ваши заметки. Начните запись до замеров, а после сохраните файл в папку docs/captures репозитория: по нему уточняется протокол и пишутся тесты. Результаты мастеров «Мощность» и «Датчики» попадают в запись сами.",
    ),
    state,
    h("div", { class: "frame-actions" }, toggle),
    h("h3", {}, "Заметка"),
    h("div", { class: "frame-actions" }, note, addBtn),
  );
  return { element };
}
