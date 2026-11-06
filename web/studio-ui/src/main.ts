import "./styles/app.css";

import { hub } from "./hub";
import { resetInputs } from "./input/drive";
import { setupGamepad, setupKeyboard } from "./input/keyboard-gamepad";
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
const trace = createTracePanel();

const views: Record<Mode, HTMLElement> = {
  remote: createRemoteView(connect.open),
  scratch: createPlaceholder("scratch"),
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
  mode = next;
  for (const [id, view] of Object.entries(views)) view.classList.toggle("active", id === next);
  topbar.setMode(next);
  if (next !== "remote") resetInputs();
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
    h("div", {}, h("div", {}, "Нет связи с хабом BotStudio"), h("div", { class: "muted", style: "font-weight:400" }, "Запустите BotStudio (или BotStudio.Server) — пульт подключится сам.")),
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
setupKeyboard(() => mode === "remote" && !document.querySelector("dialog[open]"));
setupGamepad();

hub.start();

// Подсказка для первого запуска.
try {
  if (!localStorage.getItem("botstudio.seen")) {
    localStorage.setItem("botstudio.seen", "1");
    window.setTimeout(() => toast("Нажмите F1 — подсказка по клавишам и геймпаду", "info", 6000), 1500);
  }
} catch {
  /* без localStorage подсказку просто не показываем */
}
