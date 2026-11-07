import * as SB from "scratch-blocks";
import { lang, messages } from "../i18n";
import { icons } from "../icons";
import { emergencyStop, onStop } from "../input/drive";
import { onSettings, settings } from "../settings";
import { askConfirm, askText, showAlert } from "../ui/ask-dialog";
import { h, icon } from "../ui/dom";
import { createExamplesDialog } from "../ui/examples-dialog";
import { openTextFile, saveJsonFile } from "../ui/files";
import { createSensorsCard } from "../ui/mini-sensors";
import { toast } from "../ui/toasts";
import { EXAMPLES, type Example } from "./examples";
import { registerRobotBlocks } from "./robot-blocks";
import { Runtime, toText, type ProgramError } from "./runtime";
import { buildTheme } from "./theme";
import { buildToolbox, VARIABLES_CALLBACK, variablesCategory } from "./toolbox";

/**
 * Вкладка «Блоки»: редактор на scratch-blocks, кнопки ▶/■, примеры, файлы,
 * а справа — комната эмулятора (или радар), датчики и таблички переменных.
 * Модуль грузится при первом открытии вкладки (см. main.ts): Blockly большой.
 */

const M = messages({
  ru: {
    runTitle: "Запустить программу",
    run: "Запустить",
    stopTitle: "Остановить программу и робота (Пробел)",
    stop: "Стоп",
    ready: "Готово к запуску",
    running: "Программа работает",
    examplesTitle: "Готовые программы",
    examples: "Примеры",
    openTitle: "Открыть программу из файла",
    open: "Открыть",
    saveTitle: "Сохранить программу в файл",
    save: "Сохранить",
    newProgram: "Новая программа",
    variables: "Переменные",
    variable: "Переменная",
    finished: "Программа закончилась — робот остановился. Чтобы ехать дольше, добавьте «ждать» или «повторять всегда».",
    addFlag: "Добавьте блок «когда флажок нажат» из «Событий» и соберите программу под ним.",
    hidden: "Программа остановлена: окно свернули.",
    noVariables: "Создайте переменную в «Переменных» и отметьте её галочкой — здесь появится её значение.",
    newConfirm: "Убрать все блоки и начать с чистого листа? Сохраните программу в файл, если она ещё нужна.",
    startOver: "Начать заново",
    openFailed: "Не получилось открыть",
    notProgram: "Это не программа Gearbit. Выберите файл, который сохранили кнопкой «Сохранить».",
    openConfirmTitle: "Открыть программу?",
    openConfirm: "Программа из файла заменит блоки на экране. Сохраните свою программу, если она ещё нужна.",
    opened: "Программа открыта",
    broken: (details: string) => `Файл повреждён или сделан в другой версии Gearbit. ${details}`,
    examplesIntro: "Откройте пример, запустите его и попробуйте поменять числа или блоки.",
    exampleConfirmTitle: "Открыть пример?",
    exampleConfirm: (title: string) => `Пример «${title}» заменит блоки на экране. Сохраните свою программу в файл, если она ещё нужна.`,
    deleteTitle: "Удалить?",
    delete: "Удалить",
    fileDescription: "Программа Gearbit",
    fileName: "Моя программа",
    saved: "Программа сохранена",
    saveFailed: "Не получилось сохранить файл",
  },
  en: {
    runTitle: "Run the program",
    run: "Run",
    stopTitle: "Stop the program and the robot (Space)",
    stop: "Stop",
    ready: "Ready to run",
    running: "The program is running",
    examplesTitle: "Ready-made programs",
    examples: "Examples",
    openTitle: "Open a program from a file",
    open: "Open",
    saveTitle: "Save the program to a file",
    save: "Save",
    newProgram: "New program",
    variables: "Variables",
    variable: "Variable",
    finished: "The program has ended and the robot stopped. To drive longer, add «wait» or «forever».",
    addFlag: "Add the «when flag clicked» block from «Events» and build the program under it.",
    hidden: "The program stopped: the window was minimized.",
    noVariables: "Create a variable in «Variables» and tick it: its value will appear here.",
    newConfirm: "Remove all blocks and start from scratch? Save the program to a file if you still need it.",
    startOver: "Start over",
    openFailed: "Could not open",
    notProgram: "This is not a Gearbit program. Choose a file saved with the «Save» button.",
    openConfirmTitle: "Open the program?",
    openConfirm: "The program from the file will replace the blocks on the screen. Save your program if you still need it.",
    opened: "Program opened",
    broken: (details) => `The file is damaged or made in another version of Gearbit. ${details}`,
    examplesIntro: "Open an example, run it and try changing the numbers or blocks.",
    exampleConfirmTitle: "Open the example?",
    exampleConfirm: (title) => `The «${title}» example will replace the blocks on the screen. Save your program to a file if you still need it.`,
    deleteTitle: "Delete?",
    delete: "Delete",
    fileDescription: "Gearbit program",
    fileName: "My program",
    saved: "Program saved",
    saveFailed: "Could not save the file",
  },
});

/** Подписи scratch-blocks, которых нет в переводе Scratch или которые здесь звучат странно. */
const SCRATCH_MSGS = messages<Record<string, string>>({
  ru: {
    VARIABLE_ALREADY_EXISTS: "Переменная «%1» уже есть. Придумайте другое имя.",
    VARIABLE_ALREADY_EXISTS_FOR_ANOTHER_TYPE: "Имя «%1» уже занято. Придумайте другое.",
    RENAME_VARIABLE_TITLE: "Новое имя для «%1»:",
    DELETE_VARIABLE: "Удалить переменную «%1»",
    DELETE_ALL_BLOCKS: "Удалить все блоки (%1)?",
    DELETE_X_BLOCKS: "Удалить блоки (%1)",
    CLEAN_UP: "Упорядочить блоки",
    CONTROL_STOP_OTHER: "другие скрипты",
    OPERATORS_RANDOM: "случайное от %1 до %2",
  },
  en: {
    VARIABLE_ALREADY_EXISTS: "There is already a variable «%1». Think of another name.",
    VARIABLE_ALREADY_EXISTS_FOR_ANOTHER_TYPE: "The name «%1» is taken. Think of another one.",
    CONTROL_STOP_OTHER: "other scripts",
  },
});

export interface BlocksView {
  /** Сюда main.ts переносит карточку комнаты/радара из «Пульта». */
  stageSlot: HTMLElement;
  activate(): void;
  /** Уход с вкладки: программа останавливается. */
  deactivate(): Promise<void>;
}

const STORAGE_KEY = "gearbit.blocks";
const FILE_FORMAT = "gearbit-blocks";
const FILE_SUFFIX = ".gearbit.json";

interface ProjectFile {
  format: string;
  version: number;
  workspace: object;
  monitors?: string[];
}

/** Переменные, значения которых показываются табличкой (галочка в палитре). */
const monitors = new Set<string>();

export function mountBlocksView(root: HTMLElement): BlocksView {
  setupScratchBlocks();

  /* ---------- Разметка ---------- */
  const runBtn = h("button", { class: "btn run-btn", title: M.runTitle }, icon(icons.flag), h("span", {}, M.run));
  const stopBtn = h("button", { class: "btn", title: M.stopTitle }, icon(icons.stop), h("span", {}, M.stop));
  const status = h("span", { class: "run-status", role: "status" }, h("span", { class: "dot" }), h("span", { class: "text" }, M.ready));
  const examplesBtn = h("button", { class: "btn ghost", title: M.examplesTitle }, icon(icons.book), h("span", { class: "label" }, M.examples));
  const openBtn = h("button", { class: "btn ghost icon", title: M.openTitle, "aria-label": M.open }, icon(icons.folder));
  const saveBtn = h("button", { class: "btn ghost icon", title: M.saveTitle, "aria-label": M.save }, icon(icons.save));
  const newBtn = h("button", { class: "btn ghost icon", title: M.newProgram, "aria-label": M.newProgram }, icon(icons.filePlus));
  const toolbar = h("div", { class: "program-toolbar" }, runBtn, stopBtn, status, h("div", { class: "spacer" }), examplesBtn, newBtn, openBtn, saveBtn);

  const editor = h("div", { class: "blocks-editor" });
  const bubble = h("div", { class: "say-bubble hidden", role: "status", "aria-live": "polite" });
  const stageSlot = h("div", { class: "program-stage" }, bubble);
  const sensors = createSensorsCard();
  const variables = h("div", { class: "var-monitors" });
  const variablesCard = h(
    "article",
    { class: "card" },
    h("header", { class: "card-head" }, icon(icons.variable), h("h2", {}, M.variables)),
    variables,
  );
  root.replaceChildren(
    toolbar,
    h("div", { class: "program-body" }, h("div", { class: "card blocks-editor-card" }, editor), h("aside", { class: "program-side" }, stageSlot, variablesCard, sensors)),
  );

  /* ---------- Редактор ---------- */
  const workspace = SB.inject(editor, {
    toolbox: buildToolbox(false),
    media: "./scratch-media/",
    theme: buildTheme(),
    scratchTheme: SB.ScratchBlocksTheme.CLASSIC,
    zoom: { controls: true, wheel: false, startScale: scaleFor(), maxScale: 2, minScale: 0.3, scaleSpeed: 1.15 },
    move: { scrollbars: true, drag: true, wheel: true },
    comments: true,
    sounds: false,
    trashcan: false,
  });
  workspace.registerToolboxCategoryCallback(VARIABLES_CALLBACK, variablesCategory);
  workspace.updateToolbox(buildToolbox());

  const runtime = new Runtime(workspace, {
    running(running) {
      root.dataset.running = String(running);
      runBtn.classList.toggle("running", running);
      status.querySelector(".text")!.textContent = running ? M.running : M.ready;
    },
    say(text) {
      bubble.textContent = text;
      bubble.classList.toggle("hidden", text === "");
    },
    variable: () => scheduleVariables(),
    error(error: ProgramError) {
      toast(error.message, "error", 7000);
      const block = error.blockId ? workspace.getBlockById(error.blockId) : null;
      if (block) {
        workspace.centerOnBlock(block.id);
        block.select();
      }
    },
    finished(motorsStopped) {
      if (motorsStopped) toast(M.finished, "info", 6000);
    },
  });

  runBtn.onclick = () => {
    if (!runtime.hasEntryPoints()) {
      toast(M.addFlag, "info", 5000);
      return;
    }
    runtime.start();
  };
  stopBtn.onclick = () => void emergencyStop();
  // СТОП в шапке, Пробел, страж хаба, потеря связи — программа прекращается сразу.
  onStop(() => runtime.halt());
  // В свёрнутом окне браузер замедляет таймеры: программа реагировала бы на датчики с опозданием.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && runtime.running) {
      void runtime.stop();
      toast(M.hidden, "info");
    }
  });

  /* Щелчок по скрипту — запустить его, по репортёру — показать значение (как в Scratch). */
  const onClick = (e: SB.Events.Abstract) => {
    if (e.type !== SB.Events.CLICK) return;
    const click = e as SB.Events.Click;
    if (click.targetType !== "block" || !click.blockId || !click.workspaceId) return;
    const source = SB.Workspace.getById(click.workspaceId) as SB.WorkspaceSvg | null;
    const block = source?.getBlockById(click.blockId);
    if (!block) return;
    const top = block.getRootBlock();
    if (top.outputConnection) {
      try {
        SB.reportValue(top.id, runtime.report(top));
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "error");
      }
      return;
    }
    runtime.toggle(top);
  };
  workspace.addChangeListener(onClick);

  /* Галочки у переменных в палитре — таблички со значениями. */
  const flyoutWorkspace = workspace.getFlyout()?.getWorkspace();
  flyoutWorkspace?.addChangeListener(onClick);
  flyoutWorkspace?.addChangeListener((e) => {
    if (e.type !== SB.Events.BLOCK_CHANGE) return;
    const change = e as SB.Events.BlockChange;
    if (change.element !== "checkbox" || !change.blockId) return;
    if (change.newValue) monitors.add(change.blockId);
    else monitors.delete(change.blockId);
    renderVariables();
    scheduleSave();
  });

  /* Изменения программы: автосохранение, таблички переменных, палитра. */
  const variableById = (id: string) => workspace.getVariableMap().getVariableById(id);
  workspace.addChangeListener((e) => {
    if (e.isUiEvent) return;
    if (e.type === SB.Events.VAR_CREATE || e.type === SB.Events.VAR_DELETE || e.type === SB.Events.VAR_RENAME) {
      // События приходят с задержкой: при загрузке примера переменная с тем же id уже создана заново.
      const id = (e as SB.Events.VarBase).varId;
      if (e.type === SB.Events.VAR_DELETE && id && !variableById(id)) {
        monitors.delete(id);
        runtime.variables.delete(id);
      }
      refreshToolbox();
      renderVariables();
    }
    scheduleSave();
  });

  /* Палитра Scratch сама не перестраивается: новые переменные появляются в ней после forceRerender. */
  const toolbox = workspace.getToolbox() as unknown as { forceRerender(): void } | null;
  let toolboxQueued = false;
  function refreshToolbox(): void {
    if (toolboxQueued) return;
    toolboxQueued = true;
    requestAnimationFrame(() => {
      toolboxQueued = false;
      toolbox?.forceRerender();
    });
  }

  let renderQueued = false;
  function scheduleVariables(): void {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderVariables();
    });
  }

  function renderVariables(): void {
    const shown = [...monitors]
      .map(variableById)
      .filter((v): v is SB.IVariableModel<SB.IVariableState> => !!v)
      .sort((a, b) => a.getName().localeCompare(b.getName(), lang()));
    if (shown.length === 0) {
      variables.replaceChildren(h("p", { class: "muted", style: "margin:0" }, M.noVariables));
      return;
    }
    variables.replaceChildren(
      ...shown.map((v) => h("div", { class: "var-monitor" }, h("span", { class: "name" }, v.getName()), h("span", { class: "value" }, toText(runtime.variables.get(v.getId()) ?? 0)))),
    );
  }

  /* ---------- Сохранение ---------- */
  // Снимок программы, которая уже есть в файле или в примере: с ней можно расстаться без вопроса.
  let baseline: string | null = null;
  const snapshot = () => JSON.stringify(SB.serialization.workspaces.save(workspace));
  const markClean = () => {
    baseline = snapshot();
  };
  const isEmpty = () => workspace.getTopBlocks(false).length === 0;
  const hasUnsavedWork = () => !isEmpty() && snapshot() !== baseline;

  let saveTimer: number | undefined;
  function scheduleSave(): void {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveLocal, 400);
  }

  function project(): ProjectFile {
    return { format: FILE_FORMAT, version: 1, workspace: SB.serialization.workspaces.save(workspace), monitors: [...monitors] };
  }

  function saveLocal(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...project(), pristine: snapshot() === baseline }));
    } catch {
      /* нет места или приватный режим — программа останется только на экране */
    }
  }

  function loadProject(file: ProjectFile, clean = true): void {
    void runtime.stop();
    SB.serialization.workspaces.load(file.workspace, workspace);
    applyLoaded(file.monitors ?? [], clean);
  }

  function loadExample(example: Example): void {
    void runtime.stop();
    SB.Xml.clearWorkspaceAndLoadFromXml(SB.utils.xml.textToDom(example.xml), workspace);
    applyLoaded(example.monitors ?? []);
  }

  function applyLoaded(shown: string[], clean = true): void {
    runtime.variables.clear();
    monitors.clear();
    for (const id of shown) if (variableById(id)) monitors.add(id);
    bubble.classList.add("hidden");
    workspace.clearUndo();
    workspace.scroll(0, 0);
    refreshToolbox();
    renderVariables();
    if (clean) markClean();
    else baseline = null;
    saveLocal();
  }

  function restore(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const file = JSON.parse(saved) as ProjectFile & { pristine?: boolean };
        if (file.format === FILE_FORMAT) {
          // Своя программа, которую ещё не сохраняли в файл, — перед заменой спросим.
          loadProject(file, file.pristine === true);
          return;
        }
      }
    } catch {
      /* испорченное сохранение — начинаем с примера */
    }
    loadExample(EXAMPLES[0]!);
  }

  newBtn.onclick = async () => {
    if (hasUnsavedWork() && !(await askConfirm(M.newProgram, M.newConfirm, M.startOver, true))) return;
    void runtime.stop();
    workspace.clear();
    applyLoaded([]);
  };

  saveBtn.onclick = async () => {
    if (await saveToFile(project())) {
      markClean();
      saveLocal();
    }
  };

  openBtn.onclick = async () => {
    const text = await openTextFile(PROGRAM_FILE);
    if (text === null) return;
    let file: ProjectFile;
    try {
      file = JSON.parse(text) as ProjectFile;
      if (file.format !== FILE_FORMAT || typeof file.workspace !== "object") throw new Error();
    } catch {
      void showAlert(M.openFailed, M.notProgram);
      return;
    }
    if (hasUnsavedWork() && !(await askConfirm(M.openConfirmTitle, M.openConfirm, M.open))) return;
    try {
      loadProject(file);
      toast(M.opened, "ok");
    } catch (e) {
      void showAlert(M.openFailed, M.broken(e instanceof Error ? e.message : ""));
    }
  };

  const examples = createExamplesDialog(EXAMPLES, M.examplesIntro, async (example) => {
    if (hasUnsavedWork() && !(await askConfirm(M.exampleConfirmTitle, M.exampleConfirm(example.title), M.open))) return;
    loadExample(example);
  });
  examplesBtn.onclick = examples.open;

  /* ---------- Тема и размер ---------- */
  let large = settings().largeText;
  onSettings((s) => {
    workspace.setTheme(buildTheme());
    if (s.largeText !== large) {
      large = s.largeText;
      workspace.setScale(scaleFor());
    }
  });
  // Скрытая вкладка имеет нулевой размер: пересчёт в этот момент сдвинул бы программу под палитру.
  new ResizeObserver(() => {
    if (editor.clientWidth > 0 && editor.clientHeight > 0) SB.svgResize(workspace);
  }).observe(editor);

  restore();
  renderVariables();

  return {
    stageSlot,
    activate() {
      SB.svgResize(workspace);
    },
    async deactivate() {
      await runtime.stop();
    },
  };
}

function scaleFor(): number {
  return settings().largeText ? 0.8 : 0.675;
}

/* ---------- Настройка scratch-blocks (один раз) ---------- */
function setupScratchBlocks(): void {
  SB.ScratchMsgs.setLocale(lang());
  Object.assign(SB.Msg, SCRATCH_MSGS);
  registerRobotBlocks();

  SB.ScratchVariables.setPromptHandler((message, defaultValue, callback, title) => {
    void askText(title ?? M.variable, message, defaultValue).then((name) => callback(name?.trim() ?? "", []));
  });
  SB.dialog.setAlert((message, callback) => void showAlert(M.variables, message).then(() => callback?.()));
  SB.dialog.setConfirm((message, callback) => void askConfirm(M.deleteTitle, message, M.delete, true).then(callback));

  // Галочка у переменной в палитре отмечена, если её табличка показана.
  (SB.CheckboxBubble.prototype as unknown as { isChecked(id: string): boolean }).isChecked = (id) => monitors.has(id);
}

/* ---------- Файлы ---------- */
const PROGRAM_FILE = { description: M.fileDescription, suffix: FILE_SUFFIX };

/** Сохранить в файл. true — сохранено (или отдано браузеру на скачивание). */
async function saveToFile(file: ProjectFile): Promise<boolean> {
  try {
    if (!(await saveJsonFile(file, `${M.fileName}${FILE_SUFFIX}`, PROGRAM_FILE))) return false;
    toast(M.saved, "ok");
    return true;
  } catch {
    toast(M.saveFailed, "error");
    return false;
  }
}
