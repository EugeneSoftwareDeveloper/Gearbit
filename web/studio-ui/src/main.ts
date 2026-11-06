import "./styles/app.css";

import type { BlocksView } from "./blocks/view";
import { hub } from "./hub";
import { resetInputs } from "./input/drive";
import { setupGamepad, setupKeyboard } from "./input/keyboard-gamepad";
import { createMeasureHelper } from "./measure/helper";
import { store, type Catalog, type Control, type ConnectionState, type RobotInfo, type Telemetry } from "./model";
import { createConnectDialog, setHubTransports } from "./ui/connect-dialog";
import { h } from "./ui/dom";
import { createHelpDialog } from "./ui/help-dialog";
import { createPlaceholder } from "./ui/placeholders";
import { createRemoteView } from "./ui/remote-view";
import { createSettingsPopover } from "./ui/settings-popover";
import { toast } from "./ui/toasts";
import { createTopbar, type Mode } from "./ui/topbar";
import { createTracePanel } from "./ui/trace-panel";

const app = document.getElementById("app")!;

const connect = createConnectDialog();
const help = createHelpDialog();
const settingsPopover = createSettingsPopover();
const measure = createMeasureHelper();
const trace = createTracePanel(measure.open);

const remote = createRemoteView(connect.open);
const stageHome = remote.stage.parentElement!;

/* «Блоки» — большой редактор (Blockly): грузим его, только когда вкладку открыли. */
const blocksSection = h(
  "section",
  { class: "view blocks-view", id: "view-blocks", "aria-label": "Блоки" },
  h("div", { class: "blocks-loading" }, h("span", { class: "spinner" }), "Загружаю редактор блоков…"),
);
let blocks: BlocksView | null = null;
let blocksLoading: Promise<BlocksView> | null = null;
function loadBlocks(): Promise<BlocksView> {
  blocksLoading ??= import("./blocks/view")
    .then((m) => (blocks = m.mountBlocksView(blocksSection)))
    .catch((e: unknown) => {
      blocksLoading = null;
      throw e;
    });
  return blocksLoading;
}

const views: Record<Mode, HTMLElement> = {
  remote: remote.element,
  blocks: blocksSection,
  python: createPlaceholder("python"),
  csharp: createPlaceholder("csharp"),
};

let mode: Mode = "remote";
const topbar = createTopbar({
  onMode: (m) => setMode(m),
  onRobot: connect.open,
  onSettings: (anchor) => settingsPopover.toggle(anchor),
  onHelp: help.open,
  onTrace: trace.toggle,
});

function setMode(next: Mode): void {
  const prev = mode;
  mode = next;
  for (const [id, view] of Object.entries(views)) view.classList.toggle("active", id === next);
  topbar.setMode(next);
  if (prev === "remote" && next !== "remote") resetInputs();
  // Ушли с «Блоков» — программа останавливается, комната возвращается в «Пульт».
  if (prev === "blocks" && next !== "blocks") {
    stageHome.append(remote.stage);
    void blocks?.deactivate();
  }
  if (next === "blocks") {
    loadBlocks().then(
      (view) => {
        if (mode !== "blocks") return;
        view.stageSlot.append(remote.stage);
        view.activate();
      },
      (e: unknown) => toast(`Не удалось загрузить редактор блоков: ${e instanceof Error ? e.message : String(e)}`, "error", 8000),
    );
  }
}

app.append(topbar.element, h("main", { class: "main" }, ...Object.values(views)), trace.element);
setMode("remote");

/* ---------- Нет связи с хабом ---------- */
const offline = h(
  "div",
  { class: "offline hidden", role: "alert" },
  h(
    "div",
    { class: "card", style: "padding:20px 24px" },
    h("span", { class: "spinner" }),
    h("div", {}, h("div", {}, "Нет связи с хабом Gearbit"), h("div", { class: "muted", style: "font-weight:400" }, "Запустите Gearbit (или Gearbit.Server) — пульт подключится сам.")),
  ),
);
document.body.append(offline);
let offlineTimer: number | undefined;
hub.onStatus((status) => {
  store.set({ hub: status });
  clearTimeout(offlineTimer);
  if (status === "open") offline.classList.add("hidden");
  // Короткие переподключения не показываем — только если хаба нет дольше секунды.
  else offlineTimer = window.setTimeout(() => offline.classList.remove("hidden"), 1200);
  if (status === "closed") resetInputs();
});

/* ---------- События хаба → состояние ---------- */
interface Hello {
  version: string;
  clientId: string;
  transports: string[];
  robot: RobotInfo | null;
  control: Control;
}

hub.on("hub.connected", async (hello: Hello | null) => {
  if (!hello) return;
  setHubTransports(hello.transports);
  store.set({ robot: hello.robot, control: hello.control, telemetry: null });
  try {
    store.set({ catalog: await hub.call<Catalog>("catalog.get") });
    if (hello.robot?.state === "connected") store.set({ telemetry: await hub.call<Telemetry>("robot.telemetry") });
  } catch {
    /* хаб переподключится и пришлёт заново */
  }
});

hub.on("robot.info", (robot: RobotInfo | null) => store.set({ robot, ...(robot ? {} : { telemetry: null }) }));
hub.on("robot.telemetry", (telemetry: Telemetry) => store.set({ telemetry }));
hub.on("control.changed", (control: Control) => store.set({ control }));
hub.on("robot.state", ({ state }: { state: ConnectionState }) => {
  const robot = store.state.robot;
  if (robot) store.set({ robot: { ...robot, state }, ...(state === "disconnected" ? { telemetry: null } : {}) });
  if (state !== "connected") resetInputs();
});
hub.on("safety.event", ({ reason, message }: { reason: string; message: string }) => {
  resetInputs();
  toast(message, reason === "stop" ? "info" : "safety", reason === "stop" ? 2000 : 5000);
});

/* ---------- Ввод ---------- */
// Во время замеров (service.*) клавиши движения молчат: хаб всё равно отказал бы. Пробел и Esc — СТОП всегда.
setupKeyboard(() => mode === "remote" && !document.querySelector("dialog[open]") && !store.state.robot?.serviceMode);
setupGamepad();

hub.start();

// Подсказка для первого запуска.
try {
  if (!localStorage.getItem("gearbit.seen")) {
    localStorage.setItem("gearbit.seen", "1");
    window.setTimeout(() => toast("Нажмите F1 — подсказка по клавишам и геймпаду", "info", 6000), 1500);
  }
} catch {
  /* без localStorage подсказку просто не показываем */
}
