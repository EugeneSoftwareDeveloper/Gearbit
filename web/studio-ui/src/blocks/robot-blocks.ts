import * as SB from "scratch-blocks";
import { lang, messages } from "../i18n";
import { COLOR_NAMES, COLORS, TILT_DIRECTIONS, TILT_LEVEL } from "../model";

/**
 * Блоки робота на языке интерфейса. Значения в меню — английские id (их понимает хаб и интерпретатор),
 * подписи — для ребёнка. Меню статичные: Blockly отбрасывает сохранённое значение, которого нет в меню,
 * поэтому программа должна открываться одинаково с роботом и без него.
 */

type Options = [string, string][];

const M = messages({
  ru: {
    forward: "вперёд",
    backward: "назад",
    turnLeft: "налево",
    turnRight: "направо",
    front: "впереди",
    right: "справа",
    left: "слева",
    back: "сзади",
    down: "вниз",
    downLeft: "вниз слева",
    downRight: "вниз справа",
    all: "все",
  },
  en: {
    forward: "forward",
    backward: "backward",
    turnLeft: "left",
    turnRight: "right",
    front: "front",
    right: "right",
    left: "left",
    back: "back",
    down: "down",
    downLeft: "down left",
    downRight: "down right",
    all: "all",
  },
});

export const MOVE_DIRS: Options = [
  [M.forward, "forward"],
  [M.backward, "backward"],
];
export const TURN_DIRS: Options = [
  [M.turnLeft, "left"],
  [M.turnRight, "right"],
];
export const SENSORS: Options = [
  [M.front, "front"],
  [M.right, "right"],
  [M.left, "left"],
  [M.back, "back"],
  ["D1", "D1"],
  ["D2", "D2"],
];
/** Датчики, которые смотрят в пол (езда по линии): места «вниз» из карточки «Датчики» и порты. */
export const LINE_SENSORS: Options = [
  [M.down, "down"],
  [M.downLeft, "down_left"],
  [M.downRight, "down_right"],
  ["D1", "D1"],
  ["D2", "D2"],
];
export const MOTORS: Options = [
  ["M1", "M1"],
  ["M2", "M2"],
  ["M3", "M3"],
];
export const LIGHTS: Options = [
  [M.all, "all"],
  ["L1", "L1"],
  ["L2", "L2"],
  ["L3", "L3"],
  ["L4", "L4"],
];
export const TILT_AXES: Options = [
  ["X", "x"],
  ["Y", "y"],
];
export const TILT_DIRS: Options = TILT_DIRECTIONS.map((d) => [d.title, d.id]);
const COLOR_OPTIONS: Options = COLORS.map((c) => [COLOR_NAMES[c].toLocaleLowerCase(lang()), c]);

/** Уровень датчика, ниже которого считаем, что впереди препятствие (0 — вплотную, 6 — далеко). */
export const OBSTACLE_LEVEL = 2;

type BlockJson = Record<string, unknown>;

/** Подпись блока (message0) и подсказка (tooltip). */
const B = messages({
  ru: {
    robot_move: { text: "ехать %1 мощность %2", tip: "Ехать, пока другой блок не скажет иначе. Мощность 0–100." },
    robot_turn: { text: "поворачивать %1 мощность %2", tip: "Разворот на месте: колёса крутятся в разные стороны." },
    robot_move_for: { text: "ехать %1 %2 сек. мощность %3", tip: "Проехать заданное время и остановиться." },
    robot_tank: { text: "ехать: левое колесо %1 правое %2", tip: "Мощность каждого колеса от −100 до 100. Разная мощность — плавный поворот." },
    robot_stop: { text: "остановиться", tip: "Остановить колёса и моторы, которые включила программа." },
    robot_motor: { text: "мотор %1 мощность %2", tip: "Крутить один мотор. Мощность от −100 до 100, 0 — стоп." },
    robot_light: { text: "огонёк %1 цвет %2", tip: "Зажечь светодиод нужным цветом." },
    robot_lights_off: { text: "выключить огоньки" },
    robot_say: { text: "сказать %1", tip: "Показать надпись рядом с роботом на экране. Пустая строка — убрать." },
    robot_distance: { text: "расстояние %1", tip: "Уровень датчика: 0 — вплотную, 6 — далеко или ничего нет." },
    robot_obstacle: { text: "препятствие %1 ?", tip: `Да, если расстояние меньше ${OBSTACLE_LEVEL}.` },
    robot_on_line: { text: "датчик %1 видит чёрную линию?", tip: "Да, если датчик, смотрящий в пол, сейчас над чёрной линией. Куда смотрит датчик, выбирают в карточке «Датчики» на «Пульте»." },
    robot_tilted: { text: "наклонён %1 ?", tip: `Да, если робот наклонён в эту сторону больше чем на ${TILT_LEVEL}°. Гироскоп есть только у роботов с новой прошивкой.` },
    robot_tilt: { text: "наклон %1", tip: "Наклон робота по гироскопу, градусы: Y больше 0 — вперёд, X больше 0 — вправо." },
    robot_battery: { text: "заряд батареи", tip: "Заряд батареи робота." },
    robot_when_distance: { text: "когда расстояние %1 < %2", tip: "Срабатывает, когда препятствие подъехало ближе. Работает, пока запущена программа." },
    robot_when_tilted: { text: "когда наклонён %1", tip: `Срабатывает, когда робота наклонили больше чем на ${TILT_LEVEL}°. Работает, пока запущена программа.` },
  },
  en: {
    robot_move: { text: "move %1 power %2", tip: "Move until another block says otherwise. Power 0–100." },
    robot_turn: { text: "turn %1 power %2", tip: "Turn on the spot: the wheels spin in opposite directions." },
    robot_move_for: { text: "move %1 for %2 sec. power %3", tip: "Move for the given time and stop." },
    robot_tank: { text: "drive: left wheel %1 right %2", tip: "Power of each wheel from −100 to 100. Different power makes a smooth turn." },
    robot_stop: { text: "stop", tip: "Stop the wheels and motors that the program turned on." },
    robot_motor: { text: "motor %1 power %2", tip: "Turn one motor. Power from −100 to 100, 0 is stop." },
    robot_light: { text: "light %1 color %2", tip: "Turn on the LED in the chosen color." },
    robot_lights_off: { text: "turn lights off" },
    robot_say: { text: "say %1", tip: "Show a caption next to the robot on the screen. An empty line removes it." },
    robot_distance: { text: "distance %1", tip: "Sensor level: 0 is very close, 6 is far away or nothing." },
    robot_obstacle: { text: "obstacle %1 ?", tip: `Yes if the distance is less than ${OBSTACLE_LEVEL}.` },
    robot_on_line: { text: "sensor %1 sees the black line?", tip: "Yes if the sensor looking at the floor is over the black line now. Where the sensor looks is chosen on the «Sensors» card of the «Remote»." },
    robot_tilted: { text: "tilted %1 ?", tip: `Yes if the robot is tilted this way by more than ${TILT_LEVEL}°. Only robots with new firmware have a gyroscope.` },
    robot_tilt: { text: "tilt %1", tip: "Robot tilt from the gyroscope, degrees: Y above 0 is forward, X above 0 is right." },
    robot_battery: { text: "battery level", tip: "The robot battery level." },
    robot_when_distance: { text: "when distance %1 < %2", tip: "Fires when an obstacle gets closer. Works while the program is running." },
    robot_when_tilted: { text: "when tilted %1", tip: `Fires when the robot is tilted by more than ${TILT_LEVEL}°. Works while the program is running.` },
  },
});

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
    message0: B.robot_move.text,
    args0: [dropdown("DIR", MOVE_DIRS), value("POWER")],
    tooltip: B.robot_move.tip,
    extensions: ["colours_motion", "shape_statement"],
  });
  define("robot_turn", {
    message0: B.robot_turn.text,
    args0: [dropdown("DIR", TURN_DIRS), value("POWER")],
    tooltip: B.robot_turn.tip,
    extensions: ["colours_motion", "shape_statement"],
  });
  define("robot_move_for", {
    message0: B.robot_move_for.text,
    args0: [dropdown("DIR", [...MOVE_DIRS, ...TURN_DIRS]), value("SECS"), value("POWER")],
    tooltip: B.robot_move_for.tip,
    extensions: ["colours_motion", "shape_statement"],
  });
  define("robot_tank", {
    message0: B.robot_tank.text,
    args0: [value("LEFT"), value("RIGHT")],
    tooltip: B.robot_tank.tip,
    extensions: ["colours_motion", "shape_statement"],
  });
  define("robot_stop", {
    message0: B.robot_stop.text,
    tooltip: B.robot_stop.tip,
    extensions: ["colours_motion", "shape_statement"],
  });
  define("robot_motor", {
    message0: B.robot_motor.text,
    args0: [dropdown("MOTOR", MOTORS), value("POWER")],
    tooltip: B.robot_motor.tip,
    extensions: ["colours_motion", "shape_statement"],
  });

  /* ---------- Огоньки ---------- */
  define("robot_light", {
    message0: B.robot_light.text,
    args0: [dropdown("LIGHT", LIGHTS), dropdown("COLOR", COLOR_OPTIONS)],
    tooltip: B.robot_light.tip,
    extensions: ["colours_looks", "shape_statement"],
  });
  define("robot_lights_off", {
    message0: B.robot_lights_off.text,
    extensions: ["colours_looks", "shape_statement"],
  });
  define("robot_say", {
    message0: B.robot_say.text,
    args0: [value("TEXT")],
    tooltip: B.robot_say.tip,
    extensions: ["colours_looks", "shape_statement"],
  });

  /* ---------- Датчики ---------- */
  define("robot_distance", {
    message0: B.robot_distance.text,
    args0: [dropdown("SENSOR", SENSORS)],
    tooltip: B.robot_distance.tip,
    extensions: ["colours_sensing", "output_number"],
  });
  define("robot_obstacle", {
    message0: B.robot_obstacle.text,
    args0: [dropdown("SENSOR", SENSORS)],
    tooltip: B.robot_obstacle.tip,
    extensions: ["colours_sensing", "output_boolean"],
  });
  define("robot_on_line", {
    message0: B.robot_on_line.text,
    args0: [dropdown("SENSOR", LINE_SENSORS)],
    tooltip: B.robot_on_line.tip,
    extensions: ["colours_sensing", "output_boolean"],
  });
  define("robot_tilted", {
    message0: B.robot_tilted.text,
    args0: [dropdown("DIR", TILT_DIRS)],
    tooltip: B.robot_tilted.tip,
    extensions: ["colours_sensing", "output_boolean"],
  });
  define("robot_tilt", {
    message0: B.robot_tilt.text,
    args0: [dropdown("AXIS", TILT_AXES)],
    tooltip: B.robot_tilt.tip,
    extensions: ["colours_sensing", "output_number"],
  });
  define("robot_battery", {
    message0: B.robot_battery.text,
    tooltip: B.robot_battery.tip,
    extensions: ["colours_sensing", "output_number"],
  });

  /* ---------- События ---------- */
  define("robot_when_distance", {
    message0: B.robot_when_distance.text,
    args0: [dropdown("SENSOR", SENSORS), value("VALUE")],
    tooltip: B.robot_when_distance.tip,
    extensions: ["colours_event", "shape_hat"],
  });
  define("robot_when_tilted", {
    message0: B.robot_when_tilted.text,
    args0: [dropdown("DIR", TILT_DIRS)],
    tooltip: B.robot_when_tilted.tip,
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
