/**
 * Примеры программ. Хранятся в формате XML Blockly: так короче и нагляднее, чем JSON.
 * Названия, описания, надписи и имена переменных — на языке интерфейса.
 * Блоки и значения меню — из robot-blocks.ts и стандартных блоков Scratch.
 */

import { messages } from "../i18n";

const M = messages({
  ru: {
    firstTitle: "Первые шаги",
    firstText: "Проехать вперёд, повернуть и вернуться.",
    done: "Готово!",
    squareTitle: "Квадрат",
    squareText: "Цикл «повторить»: четыре стороны — четыре поворота.",
    lightsTitle: "Светофор",
    lightsText: "Огоньки по кругу: красный, жёлтый, зелёный.",
    brakeTitle: "Умный тормоз",
    brakeText: "Едет, пока не увидит стену, и останавливается.",
    wall: "Стена!",
    explorerTitle: "Исследователь",
    explorerText: "Объезжает препятствия по двум датчикам: «если … иначе» внутри «повторять всегда».",
    carefulTitle: "Осторожный водитель",
    carefulText: "Событие «когда расстояние <»: робот сам реагирует на стену, пока едет.",
    lineTitle: "По линии",
    lineText: "Два датчика смотрят в пол («Вниз слева» и «Вниз справа»), линия между ними. В эмуляторе выберите «Линия».",
    onLine: "Еду по линии!",
    edgeTitle: "По краю линии",
    edgeText: "Хватит одного датчика «Вниз»: на чёрном — вправо, на белом — влево.",
    edge: "Держусь края!",
    counterTitle: "Считаем препятствия",
    counterText: "Переменная «счёт» растёт после каждой встречи со стеной.",
    obstacles: "Препятствий: ",
    tiltTitle: "Наклони меня",
    tiltText: "События «когда наклонён»: огоньки показывают, куда наклонили робота. В эмуляторе — кнопки «Наклонить».",
    tiltMe: "Наклони меня!",
    forward: "Вперёд!",
    backward: "Назад!",
    left: "Влево!",
    right: "Вправо!",
    count: "счёт",
  },
  en: {
    firstTitle: "First steps",
    firstText: "Drive forward, turn and come back.",
    done: "Done!",
    squareTitle: "Square",
    squareText: "The «repeat» loop: four sides, four turns.",
    lightsTitle: "Traffic light",
    lightsText: "Lights in a circle: red, yellow, green.",
    brakeTitle: "Smart brake",
    brakeText: "Drives until it sees a wall, then stops.",
    wall: "Wall!",
    explorerTitle: "Explorer",
    explorerText: "Drives around obstacles using two sensors: «if … else» inside «forever».",
    carefulTitle: "Careful driver",
    carefulText: "The «when distance <» event: the robot reacts to a wall by itself while driving.",
    lineTitle: "Follow the line",
    lineText: "Two sensors look at the floor («Down left» and «Down right») with the line between them. In the emulator choose «Line».",
    onLine: "Following the line!",
    edgeTitle: "Along the line edge",
    edgeText: "One «Down» sensor is enough: on black turn right, on white turn left.",
    edge: "Keeping to the edge!",
    counterTitle: "Counting obstacles",
    counterText: "The «count» variable grows after every meeting with a wall.",
    obstacles: "Obstacles: ",
    tiltTitle: "Tilt me",
    tiltText: "The «when tilted» events: the lights show where the robot is tilted. In the emulator use the «Tilt» buttons.",
    tiltMe: "Tilt me!",
    forward: "Forward!",
    backward: "Backward!",
    left: "Left!",
    right: "Right!",
    count: "count",
  },
});

export interface Example {
  id: string;
  title: string;
  text: string;
  xml: string;
  /** Переменные, которые сразу показывать табличкой. */
  monitors?: string[];
}

interface Item {
  type: string;
  inner?: string;
}

const item = (type: string, ...parts: string[]): Item => ({ type, inner: parts.join("") });
const stack = (...items: Item[]): string =>
  items.reduceRight((next, i) => `<block type="${i.type}">${i.inner ?? ""}${next ? `<next>${next}</next>` : ""}</block>`, "");
const at = (x: number, y: number, ...items: Item[]) => stack(...items).replace("<block ", `<block x="${x}" y="${y}" `);

const field = (name: string, value: string) => `<field name="${name}">${value}</field>`;
const num = (name: string, value: number | string, type = "math_number") =>
  `<value name="${name}"><shadow type="${type}"><field name="NUM">${value}</field></shadow></value>`;
const text = (name: string, value: string) => `<value name="${name}"><shadow type="text"><field name="TEXT">${value}</field></shadow></value>`;
const input = (name: string, i: Item) => `<value name="${name}">${stack(i)}</value>`;
const textWith = (name: string, i: Item) => `<value name="${name}"><shadow type="text"><field name="TEXT"></field></shadow>${stack(i)}</value>`;
const sub = (name: string, ...items: Item[]) => `<statement name="${name}">${stack(...items)}</statement>`;
const variable = (id: string, name: string) => `<field name="VARIABLE" id="${id}" variabletype="">${name}</field>`;

/* Блоки робота */
const flag = () => item("event_whenflagclicked");
const moveFor = (dir: string, secs: number, power: number) => item("robot_move_for", field("DIR", dir), num("SECS", secs, "math_positive_number"), num("POWER", power));
const move = (dir: string, power: number) => item("robot_move", field("DIR", dir), num("POWER", power));
const turn = (dir: string, power: number) => item("robot_turn", field("DIR", dir), num("POWER", power));
const tank = (left: number, right: number) => item("robot_tank", num("LEFT", left), num("RIGHT", right));
const light = (color: string) => item("robot_light", field("LIGHT", "all"), field("COLOR", color));
const say = (value: string) => item("robot_say", text("TEXT", value));
const obstacle = (sensor: string) => item("robot_obstacle", field("SENSOR", sensor));
const onLine = (sensor: string) => item("robot_on_line", field("SENSOR", sensor));
const wait = (secs: number) => item("control_wait", num("DURATION", secs, "math_positive_number"));
const tilted = (dir: string) => item("robot_when_tilted", field("DIR", dir));

const xml = (body: string, variables = "") => `<xml xmlns="https://developers.google.com/blockly/xml">${variables}${body}</xml>`;

export const EXAMPLES: Example[] = [
  {
    id: "first-steps",
    title: M.firstTitle,
    text: M.firstText,
    xml: xml(
      at(40, 40, flag(), light("green"), moveFor("forward", 1, 50), moveFor("right", 0.6, 40), moveFor("backward", 1, 50), say(M.done), item("robot_lights_off")),
    ),
  },
  {
    id: "square",
    title: M.squareTitle,
    text: M.squareText,
    xml: xml(at(40, 40, flag(), item("control_repeat", num("TIMES", 4, "math_whole_number"), sub("SUBSTACK", moveFor("forward", 1, 50), moveFor("right", 0.6, 40))))),
  },
  {
    id: "traffic-light",
    title: M.lightsTitle,
    text: M.lightsText,
    xml: xml(at(40, 40, flag(), item("control_forever", sub("SUBSTACK", light("red"), wait(1), light("yellow"), wait(0.5), light("green"), wait(1))))),
  },
  {
    id: "smart-brake",
    title: M.brakeTitle,
    text: M.brakeText,
    xml: xml(
      at(
        40,
        40,
        flag(),
        light("green"),
        move("forward", 40),
        item("control_wait_until", input("CONDITION", obstacle("front"))),
        item("robot_stop"),
        light("red"),
        say(M.wall),
      ),
    ),
  },
  {
    id: "explorer",
    title: M.explorerTitle,
    text: M.explorerText,
    xml: xml(
      at(
        40,
        40,
        flag(),
        item(
          "control_forever",
          sub(
            "SUBSTACK",
            item(
              "control_if_else",
              input("CONDITION", obstacle("front")),
              sub("SUBSTACK", turn("left", 40), wait(0.4)),
              sub("SUBSTACK2", item("control_if_else", input("CONDITION", obstacle("right")), sub("SUBSTACK", tank(30, 50)), sub("SUBSTACK2", move("forward", 50)))),
            ),
          ),
        ),
      ),
    ),
  },
  {
    id: "careful-driver",
    title: M.carefulTitle,
    text: M.carefulText,
    xml: xml(
      at(40, 40, flag(), light("green"), move("forward", 40)) +
        at(
          40,
          220,
          item("robot_when_distance", field("SENSOR", "front"), num("VALUE", 2)),
          item("robot_stop"),
          light("red"),
          moveFor("backward", 0.5, 40),
          moveFor("right", 0.6, 40),
          light("green"),
          move("forward", 40),
        ),
    ),
  },
  {
    id: "line",
    title: M.lineTitle,
    text: M.lineText,
    xml: xml(
      at(
        40,
        40,
        flag(),
        say(M.onLine),
        item(
          "control_forever",
          sub(
            "SUBSTACK",
            item(
              "control_if_else",
              input("CONDITION", onLine("down_left")),
              sub("SUBSTACK", tank(0, 40)),
              sub("SUBSTACK2", item("control_if_else", input("CONDITION", onLine("down_right")), sub("SUBSTACK", tank(40, 0)), sub("SUBSTACK2", move("forward", 40)))),
            ),
          ),
        ),
      ),
    ),
  },
  {
    id: "line-edge",
    title: M.edgeTitle,
    text: M.edgeText,
    xml: xml(
      at(
        40,
        40,
        flag(),
        say(M.edge),
        item("control_forever", sub("SUBSTACK", item("control_if_else", input("CONDITION", onLine("down")), sub("SUBSTACK", tank(40, 10)), sub("SUBSTACK2", tank(10, 40))))),
      ),
    ),
  },
  {
    id: "counter",
    title: M.counterTitle,
    text: M.counterText,
    monitors: ["var-count"],
    xml: xml(
      at(
        40,
        40,
        flag(),
        item("data_setvariableto", variable("var-count", M.count), text("VALUE", "0")),
        item(
          "control_forever",
          sub(
            "SUBSTACK",
            move("forward", 40),
            item("control_wait_until", input("CONDITION", obstacle("front"))),
            item("data_changevariableby", variable("var-count", M.count), num("VALUE", 1)),
            item("robot_say", textWith("TEXT", item("operator_join", text("STRING1", M.obstacles), textWith("STRING2", item("data_variable", variable("var-count", M.count)))))),
            moveFor("right", 0.7, 40),
          ),
        ),
      ),
      `<variables><variable type="" id="var-count" islocal="false" iscloud="false">${M.count}</variable></variables>`,
    ),
  },
  {
    id: "tilt-me",
    title: M.tiltTitle,
    text: M.tiltText,
    xml: xml(
      at(40, 40, flag(), light("white"), say(M.tiltMe)) +
        at(40, 240, tilted("forward"), light("green"), say(M.forward)) +
        at(380, 240, tilted("backward"), light("red"), say(M.backward)) +
        at(40, 450, tilted("left"), light("blue"), say(M.left)) +
        at(380, 450, tilted("right"), light("yellow"), say(M.right)),
    ),
  },
];
