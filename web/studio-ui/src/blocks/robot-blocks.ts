import * as SB from "scratch-blocks";
import { COLOR_NAMES, COLORS } from "../model";

/**
 * Блоки робота на русском. Значения в меню — английские id (их понимает хаб и интерпретатор),
 * подписи — для ребёнка. Меню статичные: Blockly отбрасывает сохранённое значение, которого нет в меню,
 * поэтому программа должна открываться одинаково с роботом и без него.
 */

type Options = [string, string][];

export const MOVE_DIRS: Options = [
  ["вперёд", "forward"],
  ["назад", "backward"],
];
export const TURN_DIRS: Options = [
  ["налево", "left"],
  ["направо", "right"],
];
export const SENSORS: Options = [
  ["впереди", "front"],
  ["справа", "right"],
  ["D1", "D1"],
  ["D2", "D2"],
];
export const MOTORS: Options = [
  ["M1", "M1"],
  ["M2", "M2"],
  ["M3", "M3"],
];
export const LIGHTS: Options = [
  ["все", "all"],
  ["L1", "L1"],
  ["L2", "L2"],
  ["L3", "L3"],
  ["L4", "L4"],
];
export const TILT_AXES: Options = [
  ["X", "x"],
  ["Y", "y"],
];
const COLOR_OPTIONS: Options = COLORS.map((c) => [COLOR_NAMES[c].toLowerCase(), c]);

/** Уровень датчика, ниже которого считаем, что впереди препятствие (0 — вплотную, 6 — далеко). */
export const OBSTACLE_LEVEL = 2;

type BlockJson = Record<string, unknown>;

function define(type: string, json: BlockJson): void {
  SB.Blocks[type] = {
    init(this: SB.Block) {
      this.jsonInit({ type, ...json });
    },
  };
}

const dropdown = (name: string, options: Options) => ({ type: "field_dropdown", name, options });
const value = (name: string, check?: string) => ({ type: "input_value", name, ...(check ? { check } : {}) });

let registered = false;

/** Зарегистрировать блоки робота в Blockly (один раз). */
export function registerRobotBlocks(): void {
  if (registered) return;
  registered = true;

  /* ---------- Движение ---------- */
  define("robot_move", {
    message0: "ехать %1 мощность %2",
    args0: [dropdown("DIR", MOVE_DIRS), value("POWER")],
    tooltip: "Ехать, пока другой блок не скажет иначе. Мощность 0–100.",
    extensions: ["colours_motion", "shape_statement"],
  });
  define("robot_turn", {
    message0: "поворачивать %1 мощность %2",
    args0: [dropdown("DIR", TURN_DIRS), value("POWER")],
    tooltip: "Разворот на месте: колёса крутятся в разные стороны.",
    extensions: ["colours_motion", "shape_statement"],
  });
  define("robot_move_for", {
    message0: "ехать %1 %2 сек. мощность %3",
    args0: [dropdown("DIR", [...MOVE_DIRS, ...TURN_DIRS]), value("SECS"), value("POWER")],
    tooltip: "Проехать заданное время и остановиться.",
    extensions: ["colours_motion", "shape_statement"],
  });
  define("robot_tank", {
    message0: "ехать: левое колесо %1 правое %2",
    args0: [value("LEFT"), value("RIGHT")],
    tooltip: "Мощность каждого колеса от −100 до 100. Разная мощность — плавный поворот.",
    extensions: ["colours_motion", "shape_statement"],
  });
  define("robot_stop", {
    message0: "остановиться",
    tooltip: "Остановить колёса и моторы, которые включила программа.",
    extensions: ["colours_motion", "shape_statement"],
  });
  define("robot_motor", {
    message0: "мотор %1 мощность %2",
    args0: [dropdown("MOTOR", MOTORS), value("POWER")],
    tooltip: "Крутить один мотор. Мощность от −100 до 100, 0 — стоп.",
    extensions: ["colours_motion", "shape_statement"],
  });

  /* ---------- Огоньки ---------- */
  define("robot_light", {
    message0: "огонёк %1 цвет %2",
    args0: [dropdown("LIGHT", LIGHTS), dropdown("COLOR", COLOR_OPTIONS)],
    tooltip: "Зажечь светодиод нужным цветом.",
    extensions: ["colours_looks", "shape_statement"],
  });
  define("robot_lights_off", {
    message0: "выключить огоньки",
    extensions: ["colours_looks", "shape_statement"],
  });
  define("robot_say", {
    message0: "сказать %1",
    args0: [value("TEXT")],
    tooltip: "Показать надпись рядом с роботом на экране. Пустая строка — убрать.",
    extensions: ["colours_looks", "shape_statement"],
  });

  /* ---------- Датчики ---------- */
  define("robot_distance", {
    message0: "расстояние %1",
    args0: [dropdown("SENSOR", SENSORS)],
    tooltip: "Уровень датчика: 0 — вплотную, 6 — далеко или ничего нет.",
    extensions: ["colours_sensing", "output_number"],
  });
  define("robot_obstacle", {
    message0: "препятствие %1 ?",
    args0: [dropdown("SENSOR", SENSORS)],
    tooltip: `Да, если расстояние меньше ${OBSTACLE_LEVEL}.`,
    extensions: ["colours_sensing", "output_boolean"],
  });
  define("robot_tilt", {
    message0: "наклон %1",
    args0: [dropdown("AXIS", TILT_AXES)],
    tooltip: "Наклон робота по гироскопу.",
    extensions: ["colours_sensing", "output_number"],
  });
  define("robot_battery", {
    message0: "заряд батареи",
    tooltip: "Заряд батареи робота.",
    extensions: ["colours_sensing", "output_number"],
  });

  /* ---------- События ---------- */
  define("robot_when_distance", {
    message0: "когда расстояние %1 < %2",
    args0: [dropdown("SENSOR", SENSORS), value("VALUE")],
    tooltip: "Срабатывает, когда препятствие подъехало ближе. Работает, пока запущена программа.",
    extensions: ["colours_event", "shape_hat"],
  });

  /* Табличка на сцене есть только у переменных: у «таймера» убираем галочку из палитры. */
  const timer = SB.Blocks["sensing_timer"] as { init(this: SB.Block): void } | undefined;
  if (timer) {
    const init = timer.init;
    timer.init = function (this: SB.Block & { checkboxInFlyout?: boolean }) {
      init.call(this);
      const checkbox = new SB.icons.IconType("checkbox");
      if (this.hasIcon(checkbox)) this.removeIcon(checkbox);
      this.checkboxInFlyout = false;
    };
  }
}
