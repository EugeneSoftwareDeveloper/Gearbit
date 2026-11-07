import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { python } from "@codemirror/lang-python";
import { syntaxTree } from "@codemirror/language";
import { COLOR_NAMES, COLORS, DOWN_PLACES, SENSOR_PLACES, store, TILT_DIRECTIONS } from "../model";
import { mountCodeView, type CodeExample, type CodeLanguageSpec, type CodeView } from "./view";

/** Вкладка Python: пакет gearbit (python/gearbit), программа работает в отдельном процессе python.exe. */

const IMPORT = "from gearbit import robot, wait";

const EXAMPLES: CodeExample[] = [
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
];

const COMMANDS: CodeLanguageSpec["commands"] = [
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
];

/* ---------- Подсказки при наборе ---------- */
const method = (template: string, label: string, detail: string, info: string): Completion => snippetCompletion(template, { label, detail, info, type: "method" });

const ROBOT_METHODS: Completion[] = [
  method("forward(${1:50})", "forward", "(мощность, секунды)", "Ехать вперёд. Мощность 0–100. Если указать секунды — проехать столько и остановиться."),
  method("backward(${1:50})", "backward", "(мощность, секунды)", "Ехать назад."),
  method("turn_left(${1:40})", "turn_left", "(мощность, секунды)", "Поворачиваться налево на месте."),
  method("turn_right(${1:40})", "turn_right", "(мощность, секунды)", "Поворачиваться направо на месте."),
  method("drive(${1:50}, ${2:30})", "drive", "(газ, руль, секунды)", "Газ и руль, как стик геймпада: руль больше 0 — направо, меньше 0 — налево."),
  method("tank(${1:50}, ${2:50})", "tank", "(левое, правое, секунды)", "Мощность левого и правого колеса по отдельности, как у танка."),
  method("stop()", "stop", "()", "Остановить колёса и моторы."),
  method('motor("${1:M3}", ${2:50})', "motor", "(мотор, мощность, секунды)", "Мощность одного мотора, например третьего: robot.motor(\"M3\", 50)."),
  method('distance("${1:front}")', "distance", "(датчик)", "Уровень датчика расстояния: 0 — препятствие вплотную, 6 — далеко."),
  method('distance_cm("${1:front}")', "distance_cm", "(датчик)", "Расстояние в сантиметрах, если датчик откалиброван (иначе None)."),
  method('obstacle("${1:front}")', "obstacle", "(датчик)", "True, если препятствие близко (уровень меньше 2)."),
  method(
    'on_line("${1:down}")',
    "on_line",
    "(датчик)",
    "True, если датчик, смотрящий в пол, видит чёрную линию. Без датчика — первый, поставленный «Вниз»: robot.on_line().",
  ),
  method('tilted("${1:any}")', "tilted", "(сторона)", "True, если робот наклонён больше чем на 15°: forward, backward, left, right или any — куда угодно."),
  method("tilt()", "tilt", "()", "Наклон робота (x, y) в градусах: y больше 0 — вперёд, x больше 0 — вправо."),
  method("battery()", "battery", "()", "Заряд батареи."),
  method('light("${1:all}", "${2:green}")', "light", "(огонёк, цвет)", "Включить огонёк: robot.light(\"L1\", \"red\") или все сразу: robot.light(\"all\", \"green\")."),
  method("lights_off()", "lights_off", "()", "Выключить все огоньки."),
  method('say("${1:Привет!}")', "say", "(текст)", "Показать надпись в облачке над роботом."),
  { label: "connected", type: "property", detail: "True/False", info: "Подключён ли робот к Gearbit." },
];

const GLOBALS: Completion[] = [
  { label: "robot", type: "variable", detail: "робот", info: "Робот, которым управляет программа. Наберите точку: robot." },
  snippetCompletion("wait(${1:1})", { label: "wait", type: "function", detail: "(секунды)", info: "Подождать столько секунд. Робот продолжает делать то, что ему сказали." }),
  { label: IMPORT, type: "text", info: "Первая строка программы для робота." },
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
      options: places.map((p) => ({ label: p.id, detail: p.title.toLowerCase(), type: "constant" })),
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
      options: COLORS.map((c) => ({ label: c, detail: COLOR_NAMES[c].toLowerCase(), type: "constant" })),
      validFor: /^\w*$/,
    };
  }
  const part = context.matchBefore(/\b(light|motor)\(\s*["']\w*/);
  if (part) {
    const kind = part.text.startsWith("light") ? "light" : "motor";
    const ids = store.state.robot?.components.filter((c) => c.kind === kind).map((c) => c.id) ?? [];
    const options: Completion[] = ids.map((id) => ({ label: id, type: "constant" }));
    if (kind === "light") options.unshift({ label: "all", detail: "все огоньки", type: "constant" });
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
  file: { description: "Программа на Python", suffix: ".py", mime: "text/x-python" },
  storageKey: "gearbit.python",
  language: () => python(),
  completions,
  indent: "    ",
  starter: `${IMPORT}\n\n`,
  examples: EXAMPLES,
  commands: COMMANDS,
  setupHint: "А пока можно программировать во вкладке «Блоки».",
  outputHint: "сюда пишет print()",
};

export function mountPythonView(root: HTMLElement): CodeView {
  return mountCodeView(root, PYTHON);
}
