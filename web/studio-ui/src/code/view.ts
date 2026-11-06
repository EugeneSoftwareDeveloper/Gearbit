import type { CompletionSource } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { hub } from "../hub";
import { icons } from "../icons";
import { emergencyStop, onStop } from "../input/drive";
import { store } from "../model";
import { sensorPlaces } from "../settings";
import { askConfirm, showAlert } from "../ui/ask-dialog";
import { h, icon } from "../ui/dom";
import { createExamplesDialog } from "../ui/examples-dialog";
import { openFile, saveTextFile, type FileKind } from "../ui/files";
import { createSensorsCard } from "../ui/mini-sensors";
import { toast } from "../ui/toasts";
import { createCodeEditor } from "./editor";

/**
 * Вкладка с программой на настоящем языке (Python, C#): редактор, ▶/■, вывод, примеры, файлы,
 * справа — комната эмулятора, подсказка по командам и датчики.
 * Программа работает в отдельном процессе, который запускает хаб (program.run); вкладка
 * только показывает её вывод. Остановка — как у «Блоков»: СТОП, страж хаба, потеря связи,
 * уход с вкладки и свёрнутое окно прерывают программу.
 */

export interface CodeExample {
  id: string;
  title: string;
  text: string;
  code: string;
}

export interface CommandGroup {
  title: string;
  items: { code: string; text: string }[];
}

export interface CodeLanguageSpec {
  /** Язык для program.run. */
  id: "python" | "csharp";
  title: string;
  file: FileKind;
  storageKey: string;
  language(): Extension;
  completions: CompletionSource;
  indent: string;
  /** Текст новой программы. */
  starter: string;
  examples: CodeExample[];
  commands: CommandGroup[];
  /** Что делать, если язык не установлен (дополнение к сообщению хаба). */
  setupHint: string;
  /** Подпись над выводом: чем в этом языке печатают. */
  outputHint: string;
}

export interface CodeView {
  stageSlot: HTMLElement;
  activate(): void;
  deactivate(): Promise<void>;
}

interface LanguageInfo {
  id: string;
  title: string;
  available: boolean;
  version: string | null;
  problem: string | null;
}

interface ProgramError {
  line: number | null;
  column: number | null;
  message: string;
}

interface Exited {
  runId: string;
  exitCode: number;
  reason: string;
  error: ProgramError | null;
  durationMs: number;
}

const DEFAULT_NAME = "Моя программа";
const OUTPUT_LIMIT = 200_000;

export function mountCodeView(root: HTMLElement, spec: CodeLanguageSpec): CodeView {
  /* ---------- Разметка ---------- */
  const runBtn = h("button", { class: "btn run-btn", title: "Запустить программу (F5 или Ctrl+Enter)" }, icon(icons.play), h("span", {}, "Запустить"));
  const stopBtn = h("button", { class: "btn", title: "Остановить программу и робота (Shift+F5 или Esc)" }, icon(icons.stop), h("span", {}, "Стоп"));
  const statusText = h("span", { class: "text" }, "Готово к запуску");
  const status = h("span", { class: "run-status", role: "status" }, h("span", { class: "dot" }), statusText);
  const examplesBtn = h("button", { class: "btn ghost", title: "Готовые программы" }, icon(icons.book), h("span", { class: "label" }, "Примеры"));
  const newBtn = h("button", { class: "btn ghost icon", title: "Новая программа", "aria-label": "Новая программа" }, icon(icons.filePlus));
  const openBtn = h("button", { class: "btn ghost icon", title: `Открыть программу (${spec.file.suffix})`, "aria-label": "Открыть" }, icon(icons.folder));
  const saveBtn = h("button", { class: "btn ghost icon", title: `Сохранить программу в файл ${spec.file.suffix}`, "aria-label": "Сохранить" }, icon(icons.save));
  const toolbar = h("div", { class: "program-toolbar" }, runBtn, stopBtn, status, h("div", { class: "spacer" }), examplesBtn, newBtn, openBtn, saveBtn);

  const noticeText = h("div", { class: "text" });
  const recheckBtn = h("button", { class: "btn", onclick: () => void checkLanguage(true) }, icon(icons.refresh), h("span", {}, "Проверить снова"));
  const notice = h("div", { class: "code-notice hidden", role: "alert" }, icon(icons.alert), noticeText, recheckBtn);

  const fileName = h("span", { class: "name" });
  const fileState = h("span", { class: "state" });
  const editorHost = h("div", { class: "code-editor" });
  const editorCard = h(
    "div",
    { class: "card code-editor-card" },
    h("div", { class: "code-file" }, icon(spec.id === "python" ? icons.python : icons.csharp), fileName, fileState),
    editorHost,
  );

  const output = h("pre", { class: "code-output", tabindex: "0", "aria-label": "Вывод программы", "aria-live": "polite" });
  const clearBtn = h("button", { class: "btn icon ghost small", title: "Очистить вывод", "aria-label": "Очистить вывод" }, icon(icons.trash));
  const outputCard = h(
    "article",
    { class: "card code-output-card" },
    h("header", { class: "card-head" }, icon(icons.terminal), h("h2", {}, "Вывод"), h("span", { class: "hint" }, spec.outputHint), clearBtn),
    output,
  );

  const bubble = h("div", { class: "say-bubble hidden", role: "status", "aria-live": "polite" });
  const stageSlot = h("div", { class: "program-stage" }, bubble);
  const commandsCard = createCommandsCard(spec.commands, (code) => editor.insertLine(code));
  const sensors = createSensorsCard();

  root.replaceChildren(
    toolbar,
    h(
      "div",
      { class: "program-body" },
      h("div", { class: "code-main" }, notice, editorCard, outputCard),
      h("aside", { class: "program-side" }, stageSlot, commandsCard, sensors),
    ),
  );

  /* ---------- Редактор ---------- */
  const editor = createCodeEditor(editorHost, {
    language: spec.language(),
    completions: spec.completions,
    indent: spec.indent,
    onChange: () => {
      renderFile();
      scheduleSave();
    },
    onRun: () => void run(),
    onEscape: () => void emergencyStop(),
  });

  /* ---------- Вывод ---------- */
  let outputLength = 0;
  function write(text: string, kind: "out" | "err" | "sys" | "ok" | "bad", action?: HTMLElement): void {
    const stick = output.scrollHeight - output.scrollTop - output.clientHeight < 24;
    const line = text.endsWith("\n") ? text.slice(0, -1) : text;
    const piece = h("span", { class: kind }, line, action, "\n");
    output.append(piece);
    outputLength += piece.textContent!.length;
    // Бесконечный print() в цикле не должен съесть память вкладки: старое уходит сверху.
    while (outputLength > OUTPUT_LIMIT && output.firstChild) {
      outputLength -= output.firstChild.textContent?.length ?? 0;
      output.firstChild.remove();
    }
    if (stick) output.scrollTop = output.scrollHeight;
  }
  function clearOutput(): void {
    output.replaceChildren();
    outputLength = 0;
  }
  clearBtn.onclick = clearOutput;

  /* ---------- Запуск ---------- */
  let runId: string | null = null;
  let starting = false;
  let startedAt = 0;
  // Уведомления, пришедшие раньше ответа program.run (короткая программа может успеть что-то напечатать).
  let early: { method: string; params: { runId: string } }[] = [];

  function setRunning(running: boolean, text?: string): void {
    root.dataset.running = String(running);
    runBtn.classList.toggle("running", running);
    statusText.textContent = text ?? (running ? "Программа работает" : idleText());
  }

  async function run(): Promise<void> {
    if (starting) return;
    const code = editor.text();
    if (code.trim() === "") {
      toast("Сначала напишите программу или откройте пример.", "info");
      return;
    }
    if (hub.status !== "open") {
      toast("Нет связи с хабом Gearbit.", "error");
      return;
    }
    if (language && !language.available) {
      await checkLanguage(true);
      if (language && !language.available) {
        void showAlert(`${spec.title} не найден`, `${language.problem ?? ""} ${spec.setupHint}`.trim());
        return;
      }
    }

    starting = true;
    runId = null;
    early = [];
    editor.clearError();
    bubble.classList.add("hidden");
    clearOutput();
    write(`▶ ${programName}`, "sys");
    if (store.state.robot?.state !== "connected") {
      write("Робот не подключён: программа запустится, но команды роботу не сработают. Подключите робота или эмулятор кнопкой «Нет робота» вверху.", "sys");
    }
    setRunning(true, "Запускаю…");
    try {
      const result = await hub.call<{ runId: string }>(
        "program.run",
        { language: spec.id, code, name: programName, sensors: sensorPlaces(store.state.robot) },
        30_000,
      );
      runId = result.runId;
      startedAt = performance.now();
      setRunning(true);
      const queued = early;
      early = [];
      for (const e of queued) if (e.params.runId === runId) handle(e.method, e.params);
    } catch (e) {
      setRunning(false);
      write(e instanceof Error ? e.message : String(e), "bad");
      void checkLanguage(true);
    } finally {
      starting = false;
    }
  }

  async function stopProgram(): Promise<void> {
    if (!runId && !starting) return;
    try {
      await hub.call("program.stop");
    } catch {
      /* связь пропала — хаб сам остановит программу, когда вкладка отключится */
    }
  }

  function handle(method: string, params: any): void {
    if (method === "program.output") {
      write(params.text as string, params.stream === "err" ? "err" : "out");
    } else if (method === "program.say") {
      const text = String(params.text ?? "");
      bubble.textContent = text;
      bubble.classList.toggle("hidden", text === "");
    } else if (method === "program.exited") {
      finished(params as Exited);
    }
  }

  function finished(exited: Exited): void {
    runId = null;
    setRunning(false);
    const seconds = (Math.max(exited.durationMs, performance.now() - startedAt) / 1000).toLocaleString("ru", { maximumFractionDigits: 1 });
    switch (exited.reason) {
      case "finished":
        write(`■ Программа закончилась (${seconds} с).`, "ok");
        break;
      case "stopped":
        write("■ Программа остановлена.", "sys");
        break;
      case "robotLost":
        write("■ Связь с роботом пропала — программа остановлена.", "bad");
        break;
      case "hubStopping":
        write("■ Gearbit закрывается — программа остановлена.", "sys");
        break;
      case "replaced":
        write("■ Запущена другая программа.", "sys");
        break;
      default: {
        const error = exited.error;
        if (error?.line) {
          const line = error.line;
          const show = h("button", { class: "btn small", onclick: () => editor.showError(line, error.column, error.message) }, `Показать строку ${line}`);
          write(`■ Программа остановилась из-за ошибки в строке ${line}.`, "bad", show);
          editor.showError(line, error.column, error.message);
        } else {
          write(`■ Программа остановилась из-за ошибки (код ${exited.exitCode}).`, "bad");
        }
      }
    }
  }

  for (const method of ["program.output", "program.say", "program.exited"]) {
    hub.on(method, (params: { runId: string }) => {
      if (params.runId === runId) handle(method, params);
      else if (starting) early.push({ method, params });
    });
  }
  // Хаб пропал — он сам остановил программу (вкладка-владелец отключилась), но сообщить об этом уже не может.
  hub.onStatus((s) => {
    if (s !== "open" && (runId || starting)) {
      runId = null;
      setRunning(false);
      write("■ Нет связи с хабом — программа остановлена.", "bad");
    }
  });
  hub.on("hub.connected", () => {
    if (checked) void checkLanguage(false);
  });

  runBtn.onclick = () => void run();
  stopBtn.onclick = () => void emergencyStop();
  // СТОП в шапке, Пробел, страж хаба, потеря связи — программа прекращается сразу.
  onStop(() => void stopProgram());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && (runId || starting)) {
      void stopProgram();
      toast("Программа остановлена: окно свернули.", "info");
    }
  });

  let active = false;
  window.addEventListener("keydown", (e) => {
    if (!active || document.querySelector("dialog[open]")) return;
    if (e.key === "F5") {
      // F5 в браузере перезагрузил бы страницу.
      e.preventDefault();
      if (e.shiftKey) void emergencyStop();
      else void run();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.defaultPrevented) {
      e.preventDefault();
      void run();
    }
  });

  /* ---------- Есть ли язык на компьютере ---------- */
  let language: LanguageInfo | null = null;
  let checked = false;
  async function checkLanguage(force: boolean): Promise<void> {
    if (checked && !force) return;
    checked = true;
    if (hub.status !== "open") return;
    recheckBtn.disabled = true;
    try {
      const list = await hub.call<LanguageInfo[]>("program.languages", {}, 30_000);
      language = list.find((l) => l.id === spec.id) ?? {
        id: spec.id,
        title: spec.title,
        available: false,
        version: null,
        problem: `Эта версия Gearbit пока не умеет запускать ${spec.title}.`,
      };
    } catch {
      language = null;
    } finally {
      recheckBtn.disabled = false;
    }
    notice.classList.toggle("hidden", !language || language.available);
    noticeText.replaceChildren(h("strong", {}, language?.problem ?? `${spec.title} не найден.`), ` ${spec.setupHint}`);
    if (!runId && !starting) setRunning(false);
  }
  function idleText(): string {
    return language?.available && language.version ? `Готово к запуску · ${spec.title} ${language.version}` : "Готово к запуску";
  }

  /* ---------- Сохранение ---------- */
  let programName = DEFAULT_NAME;
  // Текст, который уже есть в файле или в примере: с ним можно расстаться без вопроса.
  let baseline: string | null = null;
  const hasUnsavedWork = () => {
    const text = editor.text();
    return text.trim() !== "" && text !== baseline && text !== spec.starter;
  };

  function renderFile(): void {
    fileName.textContent = programName + spec.file.suffix;
    const dirty = editor.text() !== baseline;
    fileState.textContent = dirty ? "изменена" : "";
    fileState.title = dirty ? "Программа изменена и ещё не сохранена в файл" : "";
  }

  let saveTimer: number | undefined;
  function scheduleSave(): void {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveLocal, 400);
  }
  function saveLocal(): void {
    try {
      const code = editor.text();
      localStorage.setItem(spec.storageKey, JSON.stringify({ code, name: programName, pristine: code === baseline }));
    } catch {
      /* нет места или приватный режим — программа останется только на экране */
    }
  }

  function load(code: string, name: string, clean = true): void {
    void stopProgram();
    programName = name;
    editor.setText(code);
    baseline = clean ? code : null;
    bubble.classList.add("hidden");
    renderFile();
    saveLocal();
  }

  function restore(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(spec.storageKey) ?? "null") as { code?: unknown; name?: unknown; pristine?: unknown } | null;
      if (saved && typeof saved.code === "string") {
        load(saved.code, typeof saved.name === "string" && saved.name ? saved.name : DEFAULT_NAME, saved.pristine === true);
        return;
      }
    } catch {
      /* испорченное сохранение — начинаем с примера */
    }
    const first = spec.examples[0]!;
    load(first.code, first.title);
  }

  newBtn.onclick = async () => {
    if (hasUnsavedWork() && !(await askConfirm("Новая программа", "Стереть текст и начать с чистого листа? Сохраните программу в файл, если она ещё нужна.", "Начать заново", true))) return;
    load(spec.starter, DEFAULT_NAME);
    editor.focus();
  };

  saveBtn.onclick = async () => {
    try {
      const saved = await saveTextFile(editor.text(), programName + spec.file.suffix, spec.file);
      if (saved === null) return;
      programName = stripSuffix(saved, spec.file.suffix);
      baseline = editor.text();
      renderFile();
      saveLocal();
      toast("Программа сохранена", "ok");
    } catch {
      toast("Не получилось сохранить файл", "error");
    }
  };

  openBtn.onclick = async () => {
    const file = await openFile(spec.file);
    if (file === null) return;
    if (file.text.includes("\u0000")) {
      void showAlert("Не получилось открыть", `Это не текст программы. Выберите файл ${spec.file.suffix}.`);
      return;
    }
    if (hasUnsavedWork() && !(await askConfirm("Открыть программу?", "Программа из файла заменит текст на экране. Сохраните свою программу, если она ещё нужна.", "Открыть"))) return;
    load(file.text.replace(/\r\n/g, "\n"), stripSuffix(file.name, spec.file.suffix));
    toast("Программа открыта", "ok");
  };

  const examples = createExamplesDialog(spec.examples, "Откройте пример, запустите его и попробуйте поменять числа или команды.", async (example) => {
    if (hasUnsavedWork() && !(await askConfirm("Открыть пример?", `Пример «${example.title}» заменит текст на экране. Сохраните свою программу в файл, если она ещё нужна.`, "Открыть"))) return;
    load(example.code, example.title);
  });
  examplesBtn.onclick = examples.open;

  restore();

  return {
    stageSlot,
    activate() {
      active = true;
      editor.view.requestMeasure();
      void checkLanguage(false);
    },
    async deactivate() {
      active = false;
      await stopProgram();
    },
  };
}

function stripSuffix(name: string, suffix: string): string {
  const base = name.toLowerCase().endsWith(suffix.toLowerCase()) ? name.slice(0, -suffix.length) : name.replace(/\.[^.]*$/, "");
  return base.trim() || DEFAULT_NAME;
}

/** Подсказка по командам: щелчок вставляет команду в программу. */
function createCommandsCard(groups: CommandGroup[], insert: (code: string) => void): HTMLElement {
  const list = h("div", { class: "code-commands" });
  for (const group of groups) {
    list.append(h("h3", {}, group.title));
    for (const item of group.items) {
      list.append(
        h(
          "button",
          { class: "code-command", title: "Вставить в программу", onclick: () => insert(item.code) },
          h("code", {}, item.code.split("\n")[0]!),
          h("span", {}, item.text),
        ),
      );
    }
  }
  return h(
    "article",
    { class: "card" },
    h("header", { class: "card-head" }, icon(icons.code), h("h2", {}, "Команды"), h("span", { class: "hint" }, "щелчок — вставить")),
    list,
  );
}
