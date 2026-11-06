import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { python } from "@codemirror/lang-python";
import { syntaxTree } from "@codemirror/language";
import { COLOR_NAMES, COLORS, SENSOR_PLACES, store } from "../model";
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
  method("tilt()", "tilt", "()", "Наклон робота (x, y)."),
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
  const sensor = context.matchBefore(/\b(?:distance|distance_cm|obstacle)\(\s*["']\w*/);
  if (sensor) {
    return {
      from: sensor.to - inside(sensor.text).length,
      options: SENSOR_PLACES.map((p) => ({ label: p.id, detail: p.title.toLowerCase(), type: "constant" })),
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
