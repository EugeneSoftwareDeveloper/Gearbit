import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { python } from "@codemirror/lang-python";
import { syntaxTree } from "@codemirror/language";
import { lang, messages } from "../i18n";
import { COLOR_NAMES, COLORS, DOWN_PLACES, SENSOR_PLACES, store, TILT_DIRECTIONS } from "../model";
import { mountCodeView, type CodeExample, type CodeLanguageSpec, type CodeView } from "./view";

/**
 * Вкладка Python: пакет gearbit (python/gearbit), программа работает в отдельном процессе python.exe.
 * Примеры, карточка «Команды» и подсказки — на языке интерфейса; код примеров одинаковый, переведены
 * только комментарии и строки.
 */

const IMPORT = "from gearbit import robot, wait";

type Hint = { detail: string; info: string };

const M = messages({
  ru: {
    examples: [
      {
        id: "first-ride",
        title: "Первая поездка",
        text: "Вперёд, поворот, назад — и надпись в облачке.",
        code: `# Первая поездка: вперёд, поворот, назад.
${IMPORT}

robot.say("Поехали!")
robot.forward(50)
wait(1)
robot.turn_right(40)
wait(0.5)
robot.backward(50, 1)   # назад 1 секунду и остановиться
robot.say("Приехали!")
`,
      },
      {
        id: "square",
        title: "Квадрат",
        text: "Цикл for: четыре раза «вперёд и поворот».",
        code: `# Квадрат: четыре раза «вперёд и поворот».
${IMPORT}

for side in range(4):
    robot.say(f"Сторона {side + 1}")
    robot.forward(50, 1)
    robot.turn_right(40, 0.6)

robot.say("Квадрат готов!")
`,
      },
      {
        id: "explorer",
        title: "Исследователь",
        text: "Едет сам и объезжает препятствия по двум датчикам.",
        code: `# Исследователь: едет вперёд и объезжает препятствия.
${IMPORT}

robot.say("Исследую!")
while True:
    if robot.obstacle("front"):
        robot.backward(40, 0.3)
        robot.turn_left(40, 0.5)
    elif robot.distance("right") < 2:
        robot.drive(40, -40)   # стена справа — забираем влево
    else:
        robot.forward(50)
    wait(0.05)
`,
      },
      {
        id: "careful",
        title: "Осторожный водитель",
        text: "Чем ближе препятствие, тем медленнее едет.",
        code: `# Осторожный водитель: чем ближе препятствие, тем медленнее.
${IMPORT}

while True:
    level = robot.distance("front")   # 0 — вплотную, 6 — далеко
    if level <= 1:
        robot.stop()
        robot.say("Стоп!")
    else:
        speed = level * 10
        robot.forward(speed)
        robot.say(f"Скорость {speed}")
    wait(0.1)
`,
      },
      {
        id: "line",
        title: "По линии",
        text: "Два датчика смотрят в пол, чёрная линия между ними.",
        code: `# По линии: два датчика смотрят в пол, линия — между ними.
# «Пульт» → «Датчики»: «Вниз слева» и «Вниз справа».
# В эмуляторе под комнатой выберите «Линия».
${IMPORT}

robot.say("Еду по линии!")
while True:
    left = robot.on_line("down_left")
    right = robot.on_line("down_right")
    if left and not right:
        robot.tank(0, 40)    # линия ушла влево
    elif right and not left:
        robot.tank(40, 0)    # линия ушла вправо
    else:
        robot.forward(40)    # линия между датчиками
    wait(0.02)
`,
      },
      {
        id: "line-edge",
        title: "По краю линии",
        text: "Хватит одного датчика: едет зигзагом вдоль края.",
        code: `# По краю линии: один датчик смотрит в пол.
# «Пульт» → «Датчики»: поставьте датчик «Вниз».
# Чёрное — уходим вправо, белое — влево, к линии.
${IMPORT}

robot.say("Держусь края!")
while True:
    if robot.on_line():
        robot.tank(40, 10)
    else:
        robot.tank(10, 40)
    wait(0.02)
`,
      },
      {
        id: "traffic-light",
        title: "Светофор",
        text: "Огоньки меняют цвет, а в облачке — подсказка.",
        code: `# Светофор: огоньки меняют цвет по кругу.
${IMPORT}

signals = [("red", "Стой!"), ("yellow", "Внимание…"), ("green", "Можно ехать!")]

for lap in range(3):
    for color, text in signals:
        robot.light("all", color)
        robot.say(text)
        wait(1)

robot.lights_off()
robot.say("")
`,
      },
      {
        id: "tilt-me",
        title: "Наклони меня",
        text: "Огоньки показывают, куда наклонили робота. В эмуляторе — кнопки «Наклонить».",
        code: `# Наклони меня: огоньки показывают, куда наклонили робота.
# В эмуляторе робота наклоняют кнопки «Наклонить» под комнатой.
${IMPORT}

while True:
    if robot.tilted("forward"):
        robot.light("all", "green")
        robot.say("Вперёд!")
    elif robot.tilted("backward"):
        robot.light("all", "red")
        robot.say("Назад!")
    elif robot.tilted("left"):
        robot.light("all", "blue")
        robot.say("Влево!")
    elif robot.tilted("right"):
        robot.light("all", "yellow")
        robot.say("Вправо!")
    else:
        robot.light("all", "white")
        robot.say("Наклони меня!")
    wait(0.1)
`,
      },
      {
        id: "counter",
        title: "Считалка",
        text: "Переменные, цикл и print. Робот не нужен.",
        code: `# Считалка: переменные, цикл и print. Робот не нужен.
name = "Gearbit"
print("Привет, я", name)

total = 0
for n in range(1, 11):
    total = total + n
    print(n, "→ сумма", total)

print("Сумма чисел от 1 до 10 =", total)
`,
      },
    ],
    commands: [
      {
        title: "Движение",
        items: [
          { code: "robot.forward(50)", text: "Вперёд. 50 — мощность от 0 до 100" },
          { code: "robot.backward(50)", text: "Назад" },
          { code: "robot.turn_left(40)", text: "Поворот налево на месте" },
          { code: "robot.turn_right(40)", text: "Поворот направо на месте" },
          { code: "robot.forward(50, 2)", text: "Вперёд 2 секунды и остановиться" },
          { code: "robot.drive(50, 30)", text: "Газ и руль: руль больше 0 — направо" },
          { code: "robot.stop()", text: "Остановиться" },
        ],
      },
      {
        title: "Ждать и повторять",
        items: [
          { code: "wait(1)", text: "Подождать 1 секунду" },
          { code: "while True:\n    ", text: "Повторять всегда" },
          { code: "for i in range(4):\n    ", text: "Повторить 4 раза" },
          { code: 'if robot.obstacle("front"):\n    ', text: "Если впереди препятствие" },
        ],
      },
      {
        title: "Датчики",
        items: [
          { code: 'robot.distance("front")', text: "Расстояние: 0 — вплотную, 6 — далеко" },
          { code: 'robot.obstacle("front")', text: "True, если препятствие близко" },
          { code: "robot.on_line()", text: "True, если датчик «вниз» видит чёрную линию" },
          { code: 'robot.tilted("forward")', text: "True, если робот наклонён вперёд (или назад, влево…)" },
          { code: "robot.tilt()", text: "Наклон робота: (x, y)" },
        ],
      },
      {
        title: "Свет и надписи",
        items: [
          { code: 'robot.light("all", "green")', text: "Огоньки: red, yellow, green, blue…" },
          { code: "robot.lights_off()", text: "Выключить огоньки" },
          { code: 'robot.say("Привет!")', text: "Облачко над роботом" },
          { code: 'print("Привет!")', text: "Напечатать в окно «Вывод»" },
          { code: IMPORT, text: "Первая строка программы для робота" },
        ],
      },
    ],
    hello: "Привет!",
    hints: {
      forward: { detail: "(мощность, секунды)", info: "Ехать вперёд. Мощность 0–100. Если указать секунды — проехать столько и остановиться." },
      backward: { detail: "(мощность, секунды)", info: "Ехать назад." },
      turn_left: { detail: "(мощность, секунды)", info: "Поворачиваться налево на месте." },
      turn_right: { detail: "(мощность, секунды)", info: "Поворачиваться направо на месте." },
      drive: { detail: "(газ, руль, секунды)", info: "Газ и руль, как стик геймпада: руль больше 0 — направо, меньше 0 — налево." },
      tank: { detail: "(левое, правое, секунды)", info: "Мощность левого и правого колеса по отдельности, как у танка." },
      stop: { detail: "()", info: "Остановить колёса и моторы." },
      motor: { detail: "(мотор, мощность, секунды)", info: 'Мощность одного мотора, например третьего: robot.motor("M3", 50).' },
      distance: { detail: "(датчик)", info: "Уровень датчика расстояния: 0 — препятствие вплотную, 6 — далеко." },
      distance_cm: { detail: "(датчик)", info: "Расстояние в сантиметрах, если датчик откалиброван (иначе None)." },
      obstacle: { detail: "(датчик)", info: "True, если препятствие близко (уровень меньше 2)." },
      on_line: {
        detail: "(датчик)",
        info: "True, если датчик, смотрящий в пол, видит чёрную линию. Без датчика — первый, поставленный «Вниз»: robot.on_line().",
      },
      tilted: { detail: "(сторона)", info: "True, если робот наклонён больше чем на 15°: forward, backward, left, right или any — куда угодно." },
      tilt: { detail: "()", info: "Наклон робота (x, y) в градусах: y больше 0 — вперёд, x больше 0 — вправо." },
      battery: { detail: "()", info: "Заряд батареи." },
      light: { detail: "(огонёк, цвет)", info: 'Включить огонёк: robot.light("L1", "red") или все сразу: robot.light("all", "green").' },
      lights_off: { detail: "()", info: "Выключить все огоньки." },
      say: { detail: "(текст)", info: "Показать надпись в облачке над роботом." },
      connected: { detail: "True/False", info: "Подключён ли робот к Gearbit." },
      robot: { detail: "робот", info: "Робот, которым управляет программа. Наберите точку: robot." },
      wait: { detail: "(секунды)", info: "Подождать столько секунд. Робот продолжает делать то, что ему сказали." },
    } satisfies Record<string, Hint>,
    importInfo: "Первая строка программы для робота.",
    allLights: "все огоньки",
    fileDescription: "Программа на Python",
    setupHint: "А пока можно программировать во вкладке «Блоки».",
    outputHint: "сюда пишет print()",
  },
  en: {
    examples: [
      {
        id: "first-ride",
        title: "First ride",
        text: "Forward, turn, backward — and a caption in a speech bubble.",
        code: `# First ride: forward, turn, backward.
${IMPORT}

robot.say("Let's go!")
robot.forward(50)
wait(1)
robot.turn_right(40)
wait(0.5)
robot.backward(50, 1)   # backward for 1 second and stop
robot.say("We're there!")
`,
      },
      {
        id: "square",
        title: "Square",
        text: "A for loop: four times «forward and turn».",
        code: `# Square: four times «forward and turn».
${IMPORT}

for side in range(4):
    robot.say(f"Side {side + 1}")
    robot.forward(50, 1)
    robot.turn_right(40, 0.6)

robot.say("The square is done!")
`,
      },
      {
        id: "explorer",
        title: "Explorer",
        text: "Drives by itself and goes around obstacles using two sensors.",
        code: `# Explorer: drives forward and goes around obstacles.
${IMPORT}

robot.say("Exploring!")
while True:
    if robot.obstacle("front"):
        robot.backward(40, 0.3)
        robot.turn_left(40, 0.5)
    elif robot.distance("right") < 2:
        robot.drive(40, -40)   # a wall on the right: steer left
    else:
        robot.forward(50)
    wait(0.05)
`,
      },
      {
        id: "careful",
        title: "Careful driver",
        text: "The closer the obstacle, the slower it drives.",
        code: `# Careful driver: the closer the obstacle, the slower it drives.
${IMPORT}

while True:
    level = robot.distance("front")   # 0 is very close, 6 is far away
    if level <= 1:
        robot.stop()
        robot.say("Stop!")
    else:
        speed = level * 10
        robot.forward(speed)
        robot.say(f"Speed {speed}")
    wait(0.1)
`,
      },
      {
        id: "line",
        title: "Follow the line",
        text: "Two sensors look at the floor with the black line between them.",
        code: `# Follow the line: two sensors look at the floor, the line is between them.
# «Remote» → «Sensors»: «Down left» and «Down right».
# In the emulator choose «Line» under the room.
${IMPORT}

robot.say("Following the line!")
while True:
    left = robot.on_line("down_left")
    right = robot.on_line("down_right")
    if left and not right:
        robot.tank(0, 40)    # the line went left
    elif right and not left:
        robot.tank(40, 0)    # the line went right
    else:
        robot.forward(40)    # the line is between the sensors
    wait(0.02)
`,
      },
      {
        id: "line-edge",
        title: "Along the line edge",
        text: "One sensor is enough: it zigzags along the edge.",
        code: `# Along the line edge: one sensor looks at the floor.
# «Remote» → «Sensors»: set a sensor to «Down».
# On black steer right, on white steer left, back to the line.
${IMPORT}

robot.say("Keeping to the edge!")
while True:
    if robot.on_line():
        robot.tank(40, 10)
    else:
        robot.tank(10, 40)
    wait(0.02)
`,
      },
      {
        id: "traffic-light",
        title: "Traffic light",
        text: "The lights change color, and the speech bubble gives a hint.",
        code: `# Traffic light: the lights change color in a circle.
${IMPORT}

signals = [("red", "Stop!"), ("yellow", "Get ready…"), ("green", "Go!")]

for lap in range(3):
    for color, text in signals:
        robot.light("all", color)
        robot.say(text)
        wait(1)

robot.lights_off()
robot.say("")
`,
      },
      {
        id: "tilt-me",
        title: "Tilt me",
        text: "The lights show where the robot is tilted. In the emulator use the «Tilt» buttons.",
        code: `# Tilt me: the lights show where the robot is tilted.
# In the emulator the «Tilt» buttons under the room tilt the robot.
${IMPORT}

while True:
    if robot.tilted("forward"):
        robot.light("all", "green")
        robot.say("Forward!")
    elif robot.tilted("backward"):
        robot.light("all", "red")
        robot.say("Backward!")
    elif robot.tilted("left"):
        robot.light("all", "blue")
        robot.say("Left!")
    elif robot.tilted("right"):
        robot.light("all", "yellow")
        robot.say("Right!")
    else:
        robot.light("all", "white")
        robot.say("Tilt me!")
    wait(0.1)
`,
      },
      {
        id: "counter",
        title: "Counting",
        text: "Variables, a loop and print. No robot needed.",
        code: `# Counting: variables, a loop and print. No robot needed.
name = "Gearbit"
print("Hello, I am", name)

total = 0
for n in range(1, 11):
    total = total + n
    print(n, "→ sum", total)

print("The sum of numbers from 1 to 10 =", total)
`,
      },
    ],
    commands: [
      {
        title: "Motion",
        items: [
          { code: "robot.forward(50)", text: "Forward. 50 is power from 0 to 100" },
          { code: "robot.backward(50)", text: "Backward" },
          { code: "robot.turn_left(40)", text: "Turn left on the spot" },
          { code: "robot.turn_right(40)", text: "Turn right on the spot" },
          { code: "robot.forward(50, 2)", text: "Forward for 2 seconds and stop" },
          { code: "robot.drive(50, 30)", text: "Throttle and steering: steering above 0 is right" },
          { code: "robot.stop()", text: "Stop" },
        ],
      },
      {
        title: "Wait and repeat",
        items: [
          { code: "wait(1)", text: "Wait 1 second" },
          { code: "while True:\n    ", text: "Repeat forever" },
          { code: "for i in range(4):\n    ", text: "Repeat 4 times" },
          { code: 'if robot.obstacle("front"):\n    ', text: "If there is an obstacle in front" },
        ],
      },
      {
        title: "Sensors",
        items: [
          { code: 'robot.distance("front")', text: "Distance: 0 is very close, 6 is far away" },
          { code: 'robot.obstacle("front")', text: "True if an obstacle is close" },
          { code: "robot.on_line()", text: "True if the «down» sensor sees the black line" },
          { code: 'robot.tilted("forward")', text: "True if the robot is tilted forward (or backward, left…)" },
          { code: "robot.tilt()", text: "Robot tilt: (x, y)" },
        ],
      },
      {
        title: "Lights and captions",
        items: [
          { code: 'robot.light("all", "green")', text: "Lights: red, yellow, green, blue…" },
          { code: "robot.lights_off()", text: "Turn the lights off" },
          { code: 'robot.say("Hello!")', text: "A speech bubble above the robot" },
          { code: 'print("Hello!")', text: "Print to the «Output» window" },
          { code: IMPORT, text: "The first line of a robot program" },
        ],
      },
    ],
    hello: "Hello!",
    hints: {
      forward: { detail: "(power, seconds)", info: "Drive forward. Power 0–100. With seconds it drives that long and stops." },
      backward: { detail: "(power, seconds)", info: "Drive backward." },
      turn_left: { detail: "(power, seconds)", info: "Turn left on the spot." },
      turn_right: { detail: "(power, seconds)", info: "Turn right on the spot." },
      drive: { detail: "(throttle, steering, seconds)", info: "Throttle and steering, like a gamepad stick: steering above 0 is right, below 0 is left." },
      tank: { detail: "(left, right, seconds)", info: "Power of the left and right wheels separately, like a tank." },
      stop: { detail: "()", info: "Stop the wheels and motors." },
      motor: { detail: "(motor, power, seconds)", info: 'Power of one motor, for example the third one: robot.motor("M3", 50).' },
      distance: { detail: "(sensor)", info: "Distance sensor level: 0 is an obstacle very close, 6 is far away." },
      distance_cm: { detail: "(sensor)", info: "Distance in centimeters if the sensor is calibrated (otherwise None)." },
      obstacle: { detail: "(sensor)", info: "True if an obstacle is close (level below 2)." },
      on_line: {
        detail: "(sensor)",
        info: "True if the sensor looking at the floor sees the black line. Without a sensor it uses the first one set to «Down»: robot.on_line().",
      },
      tilted: { detail: "(side)", info: "True if the robot is tilted by more than 15°: forward, backward, left, right or any — any way." },
      tilt: { detail: "()", info: "Robot tilt (x, y) in degrees: y above 0 is forward, x above 0 is right." },
      battery: { detail: "()", info: "Battery level." },
      light: { detail: "(light, color)", info: 'Turn on a light: robot.light("L1", "red") or all at once: robot.light("all", "green").' },
      lights_off: { detail: "()", info: "Turn all lights off." },
      say: { detail: "(text)", info: "Show a caption in a speech bubble above the robot." },
      connected: { detail: "True/False", info: "Whether the robot is connected to Gearbit." },
      robot: { detail: "robot", info: "The robot the program controls. Type a dot: robot." },
      wait: { detail: "(seconds)", info: "Wait this many seconds. The robot keeps doing what it was told." },
    },
    importInfo: "The first line of a robot program.",
    allLights: "all lights",
    fileDescription: "Python program",
    setupHint: "Meanwhile you can program in the «Blocks» tab.",
    outputHint: "print() writes here",
  },
});

const EXAMPLES: CodeExample[] = M.examples;
const COMMANDS: CodeLanguageSpec["commands"] = M.commands;

/* ---------- Подсказки при наборе ---------- */
const H = M.hints;
const method = (template: string, label: keyof typeof H): Completion => snippetCompletion(template, { label, ...H[label], type: "method" });

const ROBOT_METHODS: Completion[] = [
  method("forward(${1:50})", "forward"),
  method("backward(${1:50})", "backward"),
  method("turn_left(${1:40})", "turn_left"),
  method("turn_right(${1:40})", "turn_right"),
  method("drive(${1:50}, ${2:30})", "drive"),
  method("tank(${1:50}, ${2:50})", "tank"),
  method("stop()", "stop"),
  method('motor("${1:M3}", ${2:50})', "motor"),
  method('distance("${1:front}")', "distance"),
  method('distance_cm("${1:front}")', "distance_cm"),
  method('obstacle("${1:front}")', "obstacle"),
  method('on_line("${1:down}")', "on_line"),
  method('tilted("${1:any}")', "tilted"),
  method("tilt()", "tilt"),
  method("battery()", "battery"),
  method('light("${1:all}", "${2:green}")', "light"),
  method("lights_off()", "lights_off"),
  method(`say("\${1:${M.hello}}")`, "say"),
  { label: "connected", type: "property", ...H.connected },
];

const GLOBALS: Completion[] = [
  { label: "robot", type: "variable", ...H.robot },
  snippetCompletion("wait(${1:1})", { label: "wait", type: "function", ...H.wait }),
  { label: IMPORT, type: "text", info: M.importInfo },
];

function inside(text: string): string {
  return /\w*$/.exec(text)?.[0] ?? "";
}

function stringOptions(context: CompletionContext): CompletionResult | null {
  const sensor = context.matchBefore(/\b(?:distance|distance_cm|obstacle|on_line)\(\s*["']\w*/);
  if (sensor) {
    const places = sensor.text.startsWith("on_line") ? DOWN_PLACES : [...SENSOR_PLACES, ...DOWN_PLACES];
    return {
      from: sensor.to - inside(sensor.text).length,
      options: places.map((p) => ({ label: p.id, detail: p.title.toLocaleLowerCase(lang()), type: "constant" })),
      validFor: /^\w*$/,
    };
  }
  const tilt = context.matchBefore(/\btilted\(\s*["']\w*/);
  if (tilt) {
    return {
      from: tilt.to - inside(tilt.text).length,
      options: TILT_DIRECTIONS.map((d) => ({ label: d.id, detail: d.title, type: "constant" })),
      validFor: /^\w*$/,
    };
  }
  const color = context.matchBefore(/\blight\(\s*["'][^"']*["']\s*,\s*["']\w*/);
  if (color) {
    return {
      from: color.to - inside(color.text).length,
      options: COLORS.map((c) => ({ label: c, detail: COLOR_NAMES[c].toLocaleLowerCase(lang()), type: "constant" })),
      validFor: /^\w*$/,
    };
  }
  const part = context.matchBefore(/\b(light|motor)\(\s*["']\w*/);
  if (part) {
    const kind = part.text.startsWith("light") ? "light" : "motor";
    const ids = store.state.robot?.components.filter((c) => c.kind === kind).map((c) => c.id) ?? [];
    const options: Completion[] = ids.map((id) => ({ label: id, type: "constant" }));
    if (kind === "light") options.unshift({ label: "all", detail: M.allLights, type: "constant" });
    return options.length > 0 ? { from: part.to - inside(part.text).length, options, validFor: /^\w*$/ } : null;
  }
  return null;
}

function completions(context: CompletionContext): CompletionResult | null {
  const inString = stringOptions(context);
  if (inString) return inString;
  const node = syntaxTree(context.state).resolveInner(context.pos, -1);
  if (/Comment|String/.test(node.name)) return null;

  const member = context.matchBefore(/\brobot\.\w*/);
  if (member) return { from: member.from + "robot.".length, options: ROBOT_METHODS, validFor: /^\w*$/ };

  const word = context.matchBefore(/\w+/);
  if (!word && !context.explicit) return null;
  return { from: word?.from ?? context.pos, options: GLOBALS, validFor: /^[\w ,]*$/ };
}

export const PYTHON: CodeLanguageSpec = {
  id: "python",
  title: "Python",
  file: { description: M.fileDescription, suffix: ".py", mime: "text/x-python" },
  storageKey: "gearbit.python",
  language: () => python(),
  completions,
  indent: "    ",
  starter: `${IMPORT}\n\n`,
  examples: EXAMPLES,
  commands: COMMANDS,
  setupHint: M.setupHint,
  outputHint: M.outputHint,
};

export function mountPythonView(root: HTMLElement): CodeView {
  return mountCodeView(root, PYTHON);
}
