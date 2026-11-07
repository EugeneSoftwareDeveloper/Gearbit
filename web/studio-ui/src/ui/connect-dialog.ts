import { hub } from "../hub";
import { messages, text } from "../i18n";
import { icons } from "../icons";
import { robotName, store, type ScanDevice } from "../model";
import { remember, settings } from "../settings";
import { h, icon } from "./dom";
import { toast } from "./toasts";

const M = messages({
  ru: {
    emulatorTitle: "Виртуальная машинка на экране",
    found: "Найденные устройства",
    build: "Сборка",
    model: "Модель робота",
    modelUnknown: "Модель (устройство не опознано)",
    connect: "Подключить",
    disconnect: "Отключить",
    rescan: "Искать снова",
    close: "Закрыть",
    title: "Подключение робота",
    intro: "Включите робота: светодиод мигает — он ждёт подключения. Мобильное приложение Apitor должно быть закрыто.",
    dbm: (rssi: number) => `${rssi} дБм`,
    searching: "Ищем…",
    nothing: "Ничего не найдено. Робот включён и рядом?",
    emulatorSub: "Без робота: тренируйтесь на экране",
    unknownDevice: "Неизвестное устройство",
    upTo: (percent: number) => `до ${percent}%`,
    scanning: "Ищем роботов по Bluetooth…",
    foundRobots: (n: number) => `Найдено роботов: ${n}`,
    noRobots: "Роботов не найдено — можно взять эмулятор",
    connecting: "Подключаем…",
    connected: (name: string) => `Подключено: ${name}`,
    connectFailed: (reason: string) => `Не удалось подключиться: ${reason}`,
    disconnected: "Робот отключён",
  },
  en: {
    emulatorTitle: "Virtual car on the screen",
    found: "Found devices",
    build: "Build",
    model: "Robot model",
    modelUnknown: "Model (device not recognized)",
    connect: "Connect",
    disconnect: "Disconnect",
    rescan: "Search again",
    close: "Close",
    title: "Connect a robot",
    intro: "Turn the robot on: a blinking light means it is waiting for a connection. Close the Apitor mobile app.",
    dbm: (rssi) => `${rssi} dBm`,
    searching: "Searching…",
    nothing: "Nothing found. Is the robot on and nearby?",
    emulatorSub: "No robot: practice on the screen",
    unknownDevice: "Unknown device",
    upTo: (percent) => `up to ${percent}%`,
    scanning: "Looking for robots over Bluetooth…",
    foundRobots: (n) => `Robots found: ${n}`,
    noRobots: "No robots found — you can use the emulator",
    connecting: "Connecting…",
    connected: (name) => `Connected: ${name}`,
    connectFailed: (reason) => `Could not connect: ${reason}`,
    disconnected: "Robot disconnected",
  },
});

const EMULATOR: ScanDevice = {
  id: "emulator:superbot",
  name: "Nordic_TUDAO",
  rssi: -40,
  transport: "emulator",
  deviceId: "tudao-superbot",
  deviceTitle: M.emulatorTitle,
  known: true,
};

/**
 * Диалог подключения: эмулятор доступен сразу, Bluetooth-устройства появляются после поиска.
 * Для своей модели выбирается сборка (куда смотрят датчики, какие моторы — колёса).
 */
export function createConnectDialog(): { open: () => void } {
  const list = h("div", { class: "device-list", role: "listbox", "aria-label": M.found });
  const status = h("div", { class: "muted", style: "display:flex;align-items:center;gap:8px;min-height:24px" });
  const warnings = h("div");
  const error = h("div", { class: "banner warn hidden", role: "alert" });
  const profileSelect = h("select", { "aria-label": M.build });
  const modelSelect = h("select", { "aria-label": M.model });
  const profileField = h("label", { class: "field" }, h("span", {}, M.build), profileSelect);
  const modelField = h("label", { class: "field hidden" }, h("span", {}, M.modelUnknown), modelSelect);
  const connectBtn = h("button", { class: "btn primary" }, icon(icons.plug), M.connect);
  const disconnectBtn = h("button", { class: "btn ghost hidden" }, icon(icons.unplug), M.disconnect);
  const rescanBtn = h("button", { class: "btn ghost" }, icon(icons.refresh), M.rescan);
  const closeBtn = h("button", { class: "btn icon ghost", "aria-label": M.close }, icon(icons.close));

  const dialog = h(
    "dialog",
    { "aria-labelledby": "connect-title" },
    h("header", { class: "dialog-head" }, icon(icons.bluetooth), h("h2", { id: "connect-title" }, M.title), closeBtn),
    h(
      "div",
      { class: "dialog-body" },
      h("p", { class: "muted", style: "margin:0" }, M.intro),
      status,
      list,
      warnings,
      modelField,
      profileField,
      error,
    ),
    h("footer", { class: "dialog-foot" }, disconnectBtn, h("div", { class: "spacer" }), rescanBtn, connectBtn),
  );
  document.body.append(dialog);

  let devices: ScanDevice[] = [];
  let selected: string | null = null;
  let scanning = false;
  let busy = false;

  const close = () => dialog.close();
  closeBtn.onclick = close;
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });

  const signal = (rssi: number | null) => {
    const bars = rssi === null ? 0 : rssi > -60 ? 4 : rssi > -70 ? 3 : rssi > -80 ? 2 : 1;
    return h("span", { class: "signal", title: rssi === null ? "" : M.dbm(rssi) }, ...[1, 2, 3, 4].map((i) => h("i", { class: i <= bars ? "on" : "" })));
  };

  const renderList = () => {
    list.replaceChildren();
    if (!devices.length) {
      list.append(h("p", { class: "muted", style: "margin:0" }, scanning ? M.searching : M.nothing));
    }
    for (const d of devices) {
      const sub = d.transport === "emulator" ? M.emulatorSub : d.known ? text(d.deviceTitle) : M.unknownDevice;
      const item = h(
        "button",
        { class: `device ${d.known ? "known" : ""}`, role: "option", "aria-pressed": String(d.id === selected), onclick: () => select(d.id) },
        h("span", { class: "ico" }, icon(d.transport === "emulator" ? icons.monitor : d.known ? icons.robot : icons.bluetooth)),
        h("span", { class: "info" }, h("span", { class: "title" }, robotName(d)), h("span", { class: "sub" }, sub)),
        d.transport === "emulator" ? null : signal(d.rssi),
      );
      item.addEventListener("dblclick", () => void connect());
      list.append(item);
    }
  };

  const renderOptions = () => {
    const device = devices.find((d) => d.id === selected);
    const catalog = store.state.catalog;
    const unknown = !!device && !device.known;
    modelField.classList.toggle("hidden", !unknown);
    if (unknown && catalog && !modelSelect.options.length) {
      for (const d of catalog.devices) modelSelect.append(h("option", { value: d.id }, text(d.title)));
    }
    const modelId = device?.deviceId ?? (unknown ? modelSelect.value : null);
    const profiles = catalog?.profiles.filter((p) => p.device === modelId) ?? [];
    profileSelect.replaceChildren(...profiles.map((p) => h("option", { value: p.id }, `${text(p.title)} · ${M.upTo(p.maxPowerPercent)}`)));
    // Сборку, выбранную для этой модели в прошлый раз, предлагаем снова.
    const last = modelId ? settings().lastProfile[modelId] : undefined;
    if (last && profiles.some((p) => p.id === last)) profileSelect.value = last;
    profileField.classList.toggle("hidden", profiles.length === 0);
    connectBtn.disabled = !device || busy;
  };
  modelSelect.addEventListener("change", renderOptions);

  const rememberProfile = () => {
    const device = devices.find((d) => d.id === selected);
    const modelId = device?.deviceId ?? (device && !device.known ? modelSelect.value : null);
    if (modelId && profileSelect.value) remember({ lastProfile: { ...settings().lastProfile, [modelId]: profileSelect.value } });
  };
  profileSelect.addEventListener("change", rememberProfile);

  const select = (id: string) => {
    selected = id;
    renderList();
    renderOptions();
  };

  const showError = (message: string | null) => {
    error.classList.toggle("hidden", !message);
    error.replaceChildren(icon(icons.alert), h("span", { class: "text" }, message ?? ""));
  };

  const merge = (found: ScanDevice[]) => {
    const byId = new Map(devices.map((d) => [d.id, d]));
    for (const d of found) byId.set(d.id, d);
    // Эмулятор первым, затем опознанные роботы, затем остальное по силе сигнала.
    devices = [...byId.values()].sort(
      (a, b) =>
        Number(b.transport === "emulator") - Number(a.transport === "emulator") ||
        Number(b.known) - Number(a.known) ||
        (b.rssi ?? -999) - (a.rssi ?? -999),
    );
    if (!selected) selected = devices.find((d) => d.known && d.transport !== "emulator")?.id ?? devices[0]?.id ?? null;
  };

  const scan = async () => {
    if (scanning) return;
    scanning = true;
    rescanBtn.disabled = true;
    status.replaceChildren(h("span", { class: "spinner" }), M.scanning);
    warnings.replaceChildren();
    renderList();
    try {
      const report = await hub.call<{ devices: ScanDevice[]; warnings: string[] }>("robot.scan", {}, 40000);
      merge(report.devices);
      for (const w of report.warnings) warnings.append(h("div", { class: "banner warn" }, icon(icons.info), h("span", { class: "text" }, w)));
      const robots = report.devices.filter((d) => d.known && d.transport !== "emulator").length;
      status.textContent = robots ? M.foundRobots(robots) : M.noRobots;
    } catch (e) {
      status.textContent = "";
      showError((e as Error).message);
    } finally {
      scanning = false;
      rescanBtn.disabled = false;
      renderList();
      renderOptions();
    }
  };
  rescanBtn.onclick = () => void scan();

  const connect = async () => {
    const device = devices.find((d) => d.id === selected);
    if (!device || busy) return;
    busy = true;
    showError(null);
    connectBtn.replaceChildren(h("span", { class: "spinner" }), M.connecting);
    renderOptions();
    try {
      const params: Record<string, unknown> = { id: device.id };
      if (!device.known && modelSelect.value) params.deviceId = modelSelect.value;
      if (profileSelect.value) params.profileId = profileSelect.value;
      rememberProfile();
      const robot = await hub.call("robot.connect", params, 45000);
      store.set({ robot });
      toast(M.connected(robotName(device)), "ok");
      close();
    } catch (e) {
      showError(M.connectFailed((e as Error).message));
    } finally {
      busy = false;
      connectBtn.replaceChildren(icon(icons.plug), M.connect);
      renderOptions();
    }
  };
  connectBtn.onclick = () => void connect();

  disconnectBtn.onclick = async () => {
    try {
      await hub.call("robot.disconnect", {}, 10000);
      toast(M.disconnected);
      disconnectBtn.classList.add("hidden");
    } catch (e) {
      showError((e as Error).message);
    }
  };

  const open = () => {
    showError(null);
    const r = store.state.robot;
    disconnectBtn.classList.toggle("hidden", !r || r.state === "disconnected");
    if (hubTransports.includes("emulator") && !devices.some((d) => d.id === EMULATOR.id)) merge([EMULATOR]);
    if (r && r.state !== "disconnected") selected = r.id;
    renderList();
    renderOptions();
    if (r?.profileId) profileSelect.value = r.profileId;
    dialog.showModal();
    void scan();
  };

  return { open };
}

let hubTransports: string[] = [];
/** Какие транспорты есть у хаба (из hub.hello): эмулятор показываем сразу, без ожидания поиска. */
export function setHubTransports(transports: string[]): void {
  hubTransports = transports;
}
