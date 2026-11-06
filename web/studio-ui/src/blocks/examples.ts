/**
 * Примеры программ. Хранятся в формате XML Blockly: так короче и нагляднее, чем JSON.
 * Блоки и значения меню — из robot-blocks.ts и стандартных блоков Scratch.
 */

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
const wait = (secs: number) => item("control_wait", num("DURATION", secs, "math_positive_number"));

const xml = (body: string, variables = "") => `<xml xmlns="https://developers.google.com/blockly/xml">${variables}${body}</xml>`;

export const EXAMPLES: Example[] = [
  {
    id: "first-steps",
    title: "Первые шаги",
    text: "Проехать вперёд, повернуть и вернуться.",
    xml: xml(
      at(40, 40, flag(), light("green"), moveFor("forward", 1, 50), moveFor("right", 0.6, 40), moveFor("backward", 1, 50), say("Готово!"), item("robot_lights_off")),
    ),
  },
  {
    id: "square",
    title: "Квадрат",
    text: "Цикл «повторить»: четыре стороны — четыре поворота.",
    xml: xml(at(40, 40, flag(), item("control_repeat", num("TIMES", 4, "math_whole_number"), sub("SUBSTACK", moveFor("forward", 1, 50), moveFor("right", 0.6, 40))))),
  },
  {
    id: "traffic-light",
    title: "Светофор",
    text: "Огоньки по кругу: красный, жёлтый, зелёный.",
    xml: xml(at(40, 40, flag(), item("control_forever", sub("SUBSTACK", light("red"), wait(1), light("yellow"), wait(0.5), light("green"), wait(1))))),
  },
  {
    id: "smart-brake",
    title: "Умный тормоз",
    text: "Едет, пока не увидит стену, и останавливается.",
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
        say("Стена!"),
      ),
    ),
  },
  {
    id: "explorer",
    title: "Исследователь",
    text: "Объезжает препятствия по двум датчикам: «если … иначе» внутри «повторять всегда».",
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
    title: "Осторожный водитель",
    text: "Событие «когда расстояние <»: робот сам реагирует на стену, пока едет.",
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
    id: "counter",
    title: "Считаем препятствия",
    text: "Переменная «счёт» растёт после каждой встречи со стеной.",
    monitors: ["var-count"],
    xml: xml(
      at(
        40,
        40,
        flag(),
        item("data_setvariableto", variable("var-count", "счёт"), text("VALUE", "0")),
        item(
          "control_forever",
          sub(
            "SUBSTACK",
            move("forward", 40),
            item("control_wait_until", input("CONDITION", obstacle("front"))),
            item("data_changevariableby", variable("var-count", "счёт"), num("VALUE", 1)),
            item("robot_say", textWith("TEXT", item("operator_join", text("STRING1", "Препятствий: "), textWith("STRING2", item("data_variable", variable("var-count", "счёт")))))),
            moveFor("right", 0.7, 40),
          ),
        ),
      ),
      '<variables><variable type="" id="var-count" islocal="false" iscloud="false">счёт</variable></variables>',
    ),
  },
];
