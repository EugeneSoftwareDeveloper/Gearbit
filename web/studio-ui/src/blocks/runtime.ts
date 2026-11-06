import * as SB from "scratch-blocks";
import { hub } from "../hub";
import { COLORS, sensorPlace, store, type RobotColor } from "../model";
import { LIGHTS, OBSTACLE_LEVEL, SENSORS } from "./robot-blocks";

/**
 * Интерпретатор блоков. Работает прямо по блокам рабочей области (как Scratch):
 * каждый скрипт — отдельный «поток» (async-функция), циклы уступают очередь после каждого шага.
 *
 * Правила безопасности:
 * - команды движения идут в хаб с `source: "program"` и проходят арбитр, как и всё остальное;
 * - СТОП, страж хаба, потеря связи, уход с вкладки — `halt()`: потоки сразу прекращаются;
 * - программа закончилась (все скрипты дошли до конца и нет событий «когда …») — моторы в 0.
 */

export type Value = number | string | boolean;

/** Пауза в конце каждого шага цикла: даёт обновиться экрану и датчикам. */
const TICK_MS = 20;
/** Как часто проверяются события «когда расстояние < …». */
const HAT_POLL_MS = 50;
/** Наибольший уровень датчика расстояния: «ничего не видно». */
const DISTANCE_MAX = 6;
const HATS = new Set(["event_whenflagclicked", "robot_when_distance"]);

/** Поток остановлен (СТОП или «стоп этот скрипт») — это не ошибка. */
class Halt extends Error {}

/** Ошибка в программе: понятный ребёнку текст и блок, на котором она случилась. */
export class ProgramError extends Error {
  constructor(
    message: string,
    readonly blockId?: string,
  ) {
    super(message);
  }
}

interface Thread {
  top: SB.BlockSvg;
  alive: boolean;
  /** Прервать текущее ожидание («ждать», шаг цикла). */
  wake?: () => void;
}

export interface RuntimeEvents {
  /** Программа запущена или закончилась. */
  running(running: boolean): void;
  /** Блок «сказать»: пустая строка убирает надпись. */
  say(text: string): void;
  /** Изменилось значение переменной. */
  variable(): void;
  /** Ошибка: программа остановлена. */
  error(error: ProgramError): void;
  /** Программа дошла до конца сама; motorsStopped — моторы были включены и их остановили. */
  finished(motorsStopped: boolean): void;
}

export class Runtime {
  /** Значения переменных по id. Сохраняются между запусками, как в Scratch. */
  readonly variables = new Map<string, Value>();

  private readonly threads = new Set<Thread>();
  /** Программа запущена флажком: события «когда …» следят за датчиками до СТОП. */
  private armed = false;
  private hatTimer: number | undefined;
  private readonly hatState = new Map<string, boolean>();
  private timerStart = performance.now();
  /** Номер запуска: отложенные действия старого запуска не трогают новый. */
  private generation = 0;
  private active = false;

  /** Последние отправленные значения — повторно одно и то же в хаб не шлём. */
  private drive: [number, number] = [0, 0];
  private readonly motors = new Map<string, number>();
  private readonly lights = new Map<string, RobotColor>();
  private ownsControl = false;
  private inFlight = 0;
  private lastMotionAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly workspace: SB.WorkspaceSvg,
    private readonly events: RuntimeEvents,
  ) {}

  get running(): boolean {
    return this.active;
  }

  /** Есть ли с чего начать: «когда флажок нажат» или «когда расстояние …». */
  hasEntryPoints(): boolean {
    return this.workspace.getTopBlocks(false).some((b) => HATS.has(b.type));
  }

  /** ▶: перезапустить программу — все скрипты «когда флажок нажат» и события датчиков. */
  start(): void {
    this.abort();
    this.begin();
    this.armed = true;
    this.hatState.clear();
    for (const top of this.tops("event_whenflagclicked")) this.spawn(top);
    this.hatTimer = window.setInterval(() => this.pollHats(), HAT_POLL_MS);
    this.pollHats();
  }

  /** Щелчок по скрипту: запустить его, а если уже работает — остановить (как в Scratch). */
  toggle(top: SB.BlockSvg): void {
    const running = [...this.threads].find((t) => t.top === top);
    if (running) {
      this.kill(running);
      this.settle();
      return;
    }
    if (!this.active) this.begin();
    this.spawn(top);
  }

  /** Значение блока-репортёра (для щелчка по нему в редакторе). */
  report(block: SB.Block): string {
    return toText(this.evaluate(block));
  }

  /**
   * Немедленно остановить программу (СТОП, страж хаба, потеря связи, уход с вкладки).
   * Обычно робота уже остановили, поэтому команды не нужны. Но СТОП мог прийти от другого клиента,
   * пока наша команда движения летела к хабу, — тогда она включила бы моторы уже после СТОП.
   * В этом случае (и при forceStop) повторяем СТОП: он разрешён всегда.
   */
  halt(forceStop = false): void {
    const wasActive = this.active;
    this.abort();
    if (forceStop || this.inFlight > 0 || performance.now() - this.lastMotionAt < 300) {
      this.lastMotionAt = Number.NEGATIVE_INFINITY;
      void hub.call("robot.stop").catch(() => undefined);
    }
    if (this.ownsControl) {
      this.ownsControl = false;
      void hub.call("control.release").catch(() => undefined);
    }
    if (wasActive) {
      this.events.say("");
      this.events.running(false);
    }
  }

  /**
   * Мягкая остановка (уход с вкладки «Блоки»): потоки прекращаются, а свои моторы программа
   * выключает обычными командами — они идут в хаб по порядку после уже отправленных.
   */
  async stop(): Promise<void> {
    if (!this.active) return;
    const drive = this.drive;
    const motors = [...this.motors].filter(([, p]) => p !== 0);
    const owner = this.ownsControl;
    this.ownsControl = false;
    this.halt();
    try {
      if (drive[0] !== 0 || drive[1] !== 0) await this.command("drive.stop", {}, null);
      for (const [id] of motors) await this.command("motor.setPower", { id, power: 0 }, null);
    } catch {
      /* робот отключился или управление забрали — моторы уже не наши */
    }
    if (owner || this.ownsControl) void hub.call("control.release").catch(() => undefined);
    this.ownsControl = false;
  }

  /* ---------- Потоки ---------- */

  /** Прекратить потоки и забыть отправленные значения, ничего не сообщая. */
  private abort(): void {
    this.generation++;
    for (const t of [...this.threads]) this.kill(t);
    this.stopHats();
    this.resetOutputs();
    this.active = false;
  }

  private begin(): void {
    this.active = true;
    this.events.say("");
    this.events.running(true);
  }

  private tops(type: string): SB.BlockSvg[] {
    return this.workspace.getTopBlocks(false).filter((b) => b.type === type && !b.isInsertionMarker());
  }

  private spawn(top: SB.BlockSvg): void {
    const thread: Thread = { top, alive: true };
    this.threads.add(thread);
    glow(top, true);
    void this.run(thread);
  }

  private async run(thread: Thread): Promise<void> {
    try {
      await this.runStack(thread.top, thread);
    } catch (e) {
      if (!(e instanceof Halt) && thread.alive) {
        this.fail(e);
        return;
      }
    }
    if (thread.alive) {
      this.kill(thread);
      this.settle();
    }
  }

  private kill(thread: Thread): void {
    thread.alive = false;
    thread.wake?.();
    this.threads.delete(thread);
    glow(thread.top, false);
  }

  /** Потоков не осталось: если некого ждать (нет событий «когда …»), программа закончена. */
  private settle(): void {
    if (!this.active || this.threads.size > 0) return;
    if (this.armed && this.tops("robot_when_distance").length > 0) return;
    void this.finish();
  }

  private async finish(): Promise<void> {
    const gen = this.generation;
    this.stopHats();
    this.active = false;
    this.events.running(false);
    const motorsOn = this.motorsOn();
    try {
      if (motorsOn) await this.stopMotors();
    } catch {
      /* робот отключился — моторы и так стоят */
    }
    // Пока останавливали моторы, программу могли запустить снова — тогда управление не отдаём.
    if (gen !== this.generation) return;
    if (this.ownsControl) {
      this.ownsControl = false;
      void hub.call("control.release").catch(() => undefined);
    }
    this.events.finished(motorsOn);
  }

  private fail(e: unknown): void {
    const error = e instanceof ProgramError ? e : new ProgramError(e instanceof Error ? e.message : String(e));
    this.halt(this.motorsOn());
    this.events.error(error);
  }

  private stopHats(): void {
    this.armed = false;
    if (this.hatTimer !== undefined) {
      clearInterval(this.hatTimer);
      this.hatTimer = undefined;
    }
  }

  /** События «когда расстояние < N» срабатывают по фронту: было «нет», стало «да». */
  private pollHats(): void {
    if (!this.armed) return;
    const hats = this.tops("robot_when_distance");
    for (const top of hats) {
      let now: boolean;
      try {
        now = this.distance(top.getFieldValue("SENSOR"), top.id) < this.num(top, "VALUE");
      } catch (e) {
        this.fail(e);
        return;
      }
      const before = this.hatState.get(top.id) ?? false;
      this.hatState.set(top.id, now);
      if (now && !before && ![...this.threads].some((t) => t.top === top)) this.spawn(top);
    }
    if (hats.length === 0) this.settle();
  }

  private check(thread: Thread): void {
    if (!thread.alive) throw new Halt();
  }

  private sleep(thread: Thread, ms: number): Promise<void> {
    this.check(thread);
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        thread.wake = undefined;
        resolve();
      };
      const timer = window.setTimeout(done, Math.max(0, ms));
      thread.wake = done;
    }).then(() => this.check(thread));
  }

  private tick(thread: Thread): Promise<void> {
    return this.sleep(thread, TICK_MS);
  }

  /* ---------- Выполнение ---------- */

  private async runStack(first: SB.Block | null, thread: Thread): Promise<void> {
    for (let block = first; block; block = block.getNextBlock()) {
      this.check(thread);
      if (block.isDeadOrDying()) throw new Halt();
      try {
        await this.exec(block, thread);
      } catch (e) {
        if (e instanceof Halt || e instanceof ProgramError) throw e;
        throw new ProgramError(e instanceof Error ? e.message : String(e), block.id);
      }
    }
  }

  private async exec(b: SB.Block, t: Thread): Promise<void> {
    const sub = () => b.getInputTargetBlock("SUBSTACK");
    switch (b.type) {
      case "event_whenflagclicked":
      case "robot_when_distance":
        return;

      /* Управление */
      case "control_wait":
        return this.sleep(t, this.num(b, "DURATION") * 1000);
      case "control_repeat": {
        const times = Math.round(this.num(b, "TIMES"));
        for (let i = 0; i < times; i++) {
          await this.runStack(sub(), t);
          await this.tick(t);
        }
        return;
      }
      case "control_forever":
        for (;;) {
          await this.runStack(sub(), t);
          await this.tick(t);
        }
      case "control_if":
        if (this.bool(b, "CONDITION")) await this.runStack(sub(), t);
        return;
      case "control_if_else":
        return this.runStack(this.bool(b, "CONDITION") ? sub() : b.getInputTargetBlock("SUBSTACK2"), t);
      case "control_wait_until":
        while (!this.bool(b, "CONDITION")) await this.tick(t);
        return;
      case "control_repeat_until":
        while (!this.bool(b, "CONDITION")) {
          await this.runStack(sub(), t);
          await this.tick(t);
        }
        return;
      case "control_while":
        while (this.bool(b, "CONDITION")) {
          await this.runStack(sub(), t);
          await this.tick(t);
        }
        return;
      case "control_stop": {
        const option = b.getFieldValue("STOP_OPTION");
        if (option === "all") {
          // «стоп все»: и скрипты, и события «когда …». Моторы остановит конец программы.
          this.stopHats();
          for (const other of [...this.threads]) if (other !== t) this.kill(other);
          throw new Halt();
        }
        if (option === "this script") throw new Halt();
        for (const other of [...this.threads]) if (other !== t) this.kill(other);
        return;
      }

      /* Переменные и таймер */
      case "data_setvariableto":
        return this.setVariable(b.getFieldValue("VARIABLE"), this.value(b, "VALUE"));
      case "data_changevariableby": {
        const id = b.getFieldValue("VARIABLE");
        return this.setVariable(id, toNumber(this.variables.get(id) ?? 0) + this.num(b, "VALUE"));
      }
      case "sensing_resettimer":
        this.timerStart = performance.now();
        return;

      /* Робот */
      case "robot_move": {
        const p = this.power(b, "POWER");
        const s = b.getFieldValue("DIR") === "backward" ? -p : p;
        return this.tank(s, s, t, b);
      }
      case "robot_turn": {
        const p = this.power(b, "POWER");
        return b.getFieldValue("DIR") === "left" ? this.tank(-p, p, t, b) : this.tank(p, -p, t, b);
      }
      case "robot_move_for": {
        const p = this.power(b, "POWER");
        const sides: Record<string, [number, number]> = { forward: [p, p], backward: [-p, -p], left: [-p, p], right: [p, -p] };
        const [left, right] = sides[b.getFieldValue("DIR")] ?? [0, 0];
        await this.tank(left, right, t, b);
        await this.sleep(t, this.num(b, "SECS") * 1000);
        return this.tank(0, 0, t, b);
      }
      case "robot_tank":
        return this.tank(this.power(b, "LEFT"), this.power(b, "RIGHT"), t, b);
      case "robot_stop":
        return this.stopMotors(t);
      case "robot_motor":
        return this.motor(b.getFieldValue("MOTOR"), this.power(b, "POWER"), t, b);
      case "robot_light":
        return this.light(b.getFieldValue("LIGHT"), b.getFieldValue("COLOR"), t, b);
      case "robot_lights_off":
        return this.light("all", "off", t, b);
      case "robot_say":
        this.events.say(toText(this.value(b, "TEXT")));
        return;

      default:
        throw new ProgramError(`Блок «${blockText(b)}» пока не работает в Gearbit.`, b.id);
    }
  }

  /* ---------- Значения ---------- */

  private evaluate(b: SB.Block): Value {
    switch (b.type) {
      case "math_number":
      case "math_positive_number":
      case "math_whole_number":
      case "math_integer":
      case "math_angle":
        return toNumber(b.getFieldValue("NUM"));
      case "text":
        return String(b.getFieldValue("TEXT") ?? "");
      case "data_variable":
        return this.variables.get(b.getFieldValue("VARIABLE")) ?? 0;

      case "operator_add":
        return this.num(b, "NUM1") + this.num(b, "NUM2");
      case "operator_subtract":
        return this.num(b, "NUM1") - this.num(b, "NUM2");
      case "operator_multiply":
        return this.num(b, "NUM1") * this.num(b, "NUM2");
      case "operator_divide":
        return this.num(b, "NUM1") / this.num(b, "NUM2");
      case "operator_random":
        return random(this.value(b, "FROM"), this.value(b, "TO"));
      case "operator_lt":
        return compare(this.value(b, "OPERAND1"), this.value(b, "OPERAND2")) < 0;
      case "operator_equals":
        return compare(this.value(b, "OPERAND1"), this.value(b, "OPERAND2")) === 0;
      case "operator_gt":
        return compare(this.value(b, "OPERAND1"), this.value(b, "OPERAND2")) > 0;
      case "operator_and":
        return this.bool(b, "OPERAND1") && this.bool(b, "OPERAND2");
      case "operator_or":
        return this.bool(b, "OPERAND1") || this.bool(b, "OPERAND2");
      case "operator_not":
        return !this.bool(b, "OPERAND");
      case "operator_join":
        return toText(this.value(b, "STRING1")) + toText(this.value(b, "STRING2"));
      case "operator_mod": {
        const n = this.num(b, "NUM1");
        const m = this.num(b, "NUM2");
        const r = n % m;
        return r !== 0 && r / m < 0 ? r + m : r;
      }
      case "operator_round":
        return Math.round(this.num(b, "NUM"));
      case "operator_mathop":
        return mathop(b.getFieldValue("OPERATOR"), this.num(b, "NUM"));

      case "sensing_timer":
        return Math.round(performance.now() - this.timerStart) / 1000;
      case "robot_distance":
        return this.distance(b.getFieldValue("SENSOR"), b.id);
      case "robot_obstacle":
        return this.distance(b.getFieldValue("SENSOR"), b.id) < OBSTACLE_LEVEL;
      case "robot_tilt": {
        const tilt = store.state.telemetry?.tilt;
        return tilt ? (b.getFieldValue("AXIS") === "y" ? tilt.y : tilt.x) : 0;
      }
      case "robot_battery":
        return store.state.telemetry?.battery ?? 0;

      default:
        throw new ProgramError(`Блок «${blockText(b)}» пока не работает в Gearbit.`, b.id);
    }
  }

  private value(b: SB.Block, input: string): Value {
    const target = b.getInputTargetBlock(input);
    return target ? this.evaluate(target) : "";
  }

  private num(b: SB.Block, input: string): number {
    return toNumber(this.value(b, input));
  }

  private bool(b: SB.Block, input: string): boolean {
    const target = b.getInputTargetBlock(input);
    return target ? toBoolean(this.evaluate(target)) : false;
  }

  /** Мощность в процентах −100..100; предел для детей применит хаб. */
  private power(b: SB.Block, input: string): number {
    return Math.round(Math.max(-100, Math.min(100, this.num(b, input))));
  }

  private setVariable(id: string, value: Value): void {
    this.variables.set(id, value);
    this.events.variable();
  }

  private distance(key: string, blockId: string): number {
    const robot = store.state.robot;
    if (!robot || robot.state !== "connected") return DISTANCE_MAX;
    // «Впереди» — тот датчик, который стоит спереди (пользователь мог переставить его в карточке «Датчики»).
    const sensor = robot.components.find((c) => c.kind === "distance" && (c.id === key || sensorPlace(c, robot) === key));
    if (!sensor) throw new ProgramError(`У этой сборки нет датчика «${label(SENSORS, key)}». Выберите другой в блоке.`, blockId);
    return store.state.telemetry?.distances[sensor.id] ?? DISTANCE_MAX;
  }

  /* ---------- Команды роботу ---------- */

  private requireRobot(blockId?: string): void {
    if (store.state.robot?.state !== "connected") {
      throw new ProgramError("Робот не подключён. Нажмите «Нет робота» вверху и выберите робота или эмулятор.", blockId);
    }
  }

  /**
   * Команда хабу от имени программы. moving — команда включает моторы: такие считаются «в пути»
   * для повторного СТОП в halt(). Команды остановки и огоньки не считаются.
   */
  private async command(method: string, params: Record<string, unknown>, thread: Thread | null, blockId?: string, moving = false): Promise<void> {
    if (thread) this.check(thread);
    this.requireRobot(blockId);
    if (moving) {
      this.inFlight++;
      this.lastMotionAt = performance.now();
    }
    try {
      await hub.call(method, { ...params, source: "program" }, 3000);
      this.ownsControl = true;
    } catch (e) {
      throw new ProgramError(e instanceof Error ? e.message : String(e), blockId);
    } finally {
      if (moving) this.inFlight--;
    }
    if (thread) this.check(thread);
  }

  private async tank(left: number, right: number, thread: Thread, block: SB.Block): Promise<void> {
    if (left === this.drive[0] && right === this.drive[1]) return;
    this.drive = [left, right];
    if (left === 0 && right === 0) await this.command("drive.stop", {}, thread, block.id);
    else await this.command("drive.tank", { left, right }, thread, block.id, true);
  }

  private async motor(id: string, power: number, thread: Thread, block: SB.Block): Promise<void> {
    if (this.motors.get(id) === power) return;
    this.motors.set(id, power);
    await this.command("motor.setPower", { id, power }, thread, block.id, power !== 0);
  }

  private async light(id: string, color: string, thread: Thread, block: SB.Block): Promise<void> {
    this.requireRobot(block.id);
    const all = store.state.robot?.components.filter((c) => c.kind === "light").map((c) => c.id) ?? [];
    const ids = id === "all" ? all : [id];
    if (id !== "all" && !all.includes(id)) {
      throw new ProgramError(`У этой модели нет огонька «${label(LIGHTS, id)}».`, block.id);
    }
    const target = (COLORS as string[]).includes(color) ? (color as RobotColor) : "off";
    for (const lightId of ids) {
      if (this.lights.get(lightId) === target) continue;
      this.lights.set(lightId, target);
      await this.command("light.setColor", { id: lightId, color: target }, thread, block.id);
    }
  }

  private motorsOn(): boolean {
    return this.drive[0] !== 0 || this.drive[1] !== 0 || [...this.motors.values()].some((p) => p !== 0);
  }

  /** «остановиться» и конец программы: колёса и моторы, которые включала программа, — в 0. */
  private async stopMotors(thread: Thread | null = null): Promise<void> {
    if (this.drive[0] !== 0 || this.drive[1] !== 0) {
      this.drive = [0, 0];
      await this.command("drive.stop", {}, thread);
    }
    for (const [id, power] of this.motors) {
      if (power === 0) continue;
      this.motors.set(id, 0);
      await this.command("motor.setPower", { id, power: 0 }, thread);
    }
  }

  private resetOutputs(): void {
    this.drive = [0, 0];
    this.motors.clear();
    this.lights.clear();
  }
}

/* ---------- Приведение типов (как в Scratch) ---------- */

export function toNumber(v: Value | null | undefined): number {
  if (typeof v === "number") return Number.isNaN(v) ? 0 : v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).trim().replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

function toBoolean(v: Value): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = v.trim().toLowerCase();
  return s !== "" && s !== "0" && s !== "false" && s !== "нет";
}

/** Текст для «сказать», «объединить» и табличек переменных. */
export function toText(v: Value): string {
  if (typeof v === "boolean") return v ? "да" : "нет";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return v > 0 ? "бесконечность" : v < 0 ? "−бесконечность" : "0";
    return String(Number.isInteger(v) ? v : Number(v.toFixed(3)));
  }
  return v;
}

function asNumberOrNull(v: Value): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return null;
  if (v.trim() === "") return null;
  const n = Number(v.trim().replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

/** Сравнение: числа — как числа, иначе как текст без учёта регистра. */
function compare(a: Value, b: Value): number {
  const x = asNumberOrNull(a);
  const y = asNumberOrNull(b);
  if (x !== null && y !== null) return x - y;
  const s1 = toText(a).toLowerCase();
  const s2 = toText(b).toLowerCase();
  return s1 < s2 ? -1 : s1 > s2 ? 1 : 0;
}

function random(fromValue: Value, toValue: Value): number {
  const from = toNumber(fromValue);
  const to = toNumber(toValue);
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const decimal = (v: Value) => typeof v === "string" && v.includes(".");
  if (Number.isInteger(low) && Number.isInteger(high) && !decimal(fromValue) && !decimal(toValue)) {
    return low + Math.floor(Math.random() * (high - low + 1));
  }
  return low + Math.random() * (high - low);
}

function mathop(op: string, n: number): number {
  const rad = (n * Math.PI) / 180;
  const trig = (v: number) => Math.round(v * 1e10) / 1e10;
  switch (op) {
    case "abs":
      return Math.abs(n);
    case "floor":
      return Math.floor(n);
    case "ceiling":
      return Math.ceil(n);
    case "sqrt":
      return Math.sqrt(n);
    case "sin":
      return trig(Math.sin(rad));
    case "cos":
      return trig(Math.cos(rad));
    case "tan":
      return trig(Math.tan(rad));
    case "asin":
      return (Math.asin(n) * 180) / Math.PI;
    case "acos":
      return (Math.acos(n) * 180) / Math.PI;
    case "atan":
      return (Math.atan(n) * 180) / Math.PI;
    case "ln":
      return Math.log(n);
    case "log":
      return Math.log10(n);
    case "e ^":
      return Math.exp(n);
    case "10 ^":
      return 10 ** n;
    default:
      return 0;
  }
}

function label(options: [string, string][], value: string): string {
  return options.find(([, v]) => v === value)?.[0] ?? value;
}

function blockText(b: SB.Block): string {
  return b.toString().trim() || b.type;
}

function glow(block: SB.BlockSvg, on: boolean): void {
  try {
    if (!block.isDeadOrDying()) SB.glowStack(block.id, on);
  } catch {
    /* блок удалили или палитра перерисовалась — подсвечивать нечего */
  }
}
