import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { StreamLanguage, syntaxTree } from "@codemirror/language";
import { csharp } from "@codemirror/legacy-modes/mode/clike";
import { COLOR_NAMES, COLORS, DOWN_PLACES, SENSOR_PLACES, store } from "../model";
import { CURSOR_MARK as C } from "./editor";
import { mountCodeView, type CodeExample, type CodeLanguageSpec, type CodeView } from "./view";

/**
 * Вкладка C#: программа — скрипт C# (команды без class и Main). Её собирает и запускает
 * Gearbit.ScriptHost (Roslyn) в отдельном процессе; robot и Wait даёт библиотека Gearbit.Client.
 */

const EXAMPLES: CodeExample[] = [
  {
    id: "first-ride",
    title: "Первая поездка",
    text: "Вперёд, поворот, назад — и надпись в облачке.",
    code: `// Первая поездка: вперёд, поворот, назад.
robot.Say("Поехали!");
robot.Forward(50);
Wait(1);
robot.TurnRight(40);
Wait(0.5);
robot.Backward(50, 1);   // назад 1 секунду и остановиться
robot.Say("Приехали!");
`,
  },
  {
    id: "square",
    title: "Квадрат",
    text: "Цикл for: четыре раза «вперёд и поворот».",
    code: `// Квадрат: четыре раза «вперёд и поворот».
for (var side = 1; side <= 4; side++)
{
    robot.Say($"Сторона {side}");
    robot.Forward(50, 1);
    robot.TurnRight(40, 0.6);
}

robot.Say("Квадрат готов!");
`,
  },
  {
    id: "explorer",
    title: "Исследователь",
    text: "Едет сам и объезжает препятствия по двум датчикам.",
    code: `// Исследователь: едет вперёд и объезжает препятствия.
robot.Say("Исследую!");
while (true)
{
    if (robot.Obstacle("front"))
    {
        robot.Backward(40, 0.3);
        robot.TurnLeft(40, 0.5);
    }
    else if (robot.Distance("right") < 2)
    {
        robot.Drive(40, -40);   // стена справа — влево
    }
    else
    {
        robot.Forward(50);
    }
    Wait(0.05);
}
`,
  },
  {
    id: "careful",
    title: "Осторожный водитель",
    text: "Чем ближе препятствие, тем медленнее едет.",
    code: `// Осторожный водитель: чем ближе препятствие, тем медленнее.
while (true)
{
    // Расстояние: 0 — вплотную, 6 — далеко.
    var level = robot.Distance("front");
    if (level <= 1)
    {
        robot.Stop();
        robot.Say("Стоп!");
    }
    else
    {
        var speed = level * 10;
        robot.Forward(speed);
        robot.Say($"Скорость {speed}");
    }
    Wait(0.1);
}
`,
  },
  {
    id: "line",
    title: "По линии",
    text: "Два датчика смотрят в пол, чёрная линия между ними.",
    code: `// По линии: два датчика смотрят в пол, линия — между ними.
// «Пульт» → «Датчики»: «Вниз слева» и «Вниз справа».
// В эмуляторе под комнатой выберите «Линия».
robot.Say("Еду по линии!");
while (true)
{
    var left = robot.OnLine("down_left");
    var right = robot.OnLine("down_right");
    if (left && !right)
    {
        robot.Tank(0, 40);   // линия ушла влево
    }
    else if (right && !left)
    {
        robot.Tank(40, 0);   // линия ушла вправо
    }
    else
    {
        robot.Forward(40);   // линия между датчиками
    }
    Wait(0.02);
}
`,
  },
  {
    id: "line-edge",
    title: "По краю линии",
    text: "Хватит одного датчика: едет зигзагом вдоль края.",
    code: `// По краю линии: один датчик смотрит в пол.
// «Пульт» → «Датчики»: поставьте датчик «Вниз».
// Чёрное — уходим вправо, белое — влево, к линии.
robot.Say("Держусь края!");
while (true)
{
    if (robot.OnLine())
    {
        robot.Tank(40, 10);
    }
    else
    {
        robot.Tank(10, 40);
    }
    Wait(0.02);
}
`,
  },
  {
    id: "traffic-light",
    title: "Светофор",
    text: "Огоньки меняют цвет, а в облачке — подсказка.",
    code: `// Светофор: огоньки меняют цвет по кругу.
var signals = new[]
{
    ("red", "Стой!"),
    ("yellow", "Внимание…"),
    ("green", "Можно ехать!"),
};

for (var lap = 0; lap < 3; lap++)
{
    foreach (var (color, text) in signals)
    {
        robot.Light("all", color);
        robot.Say(text);
        Wait(1);
    }
}

robot.LightsOff();
robot.Say("");
`,
  },
  {
    id: "counter",
    title: "Считалка",
    text: "Переменные, цикл и Console.WriteLine. Робот не нужен.",
    code: `// Считалка: переменные, цикл и Console.WriteLine. Робот не нужен.
var name = "Gearbit";
Console.WriteLine($"Привет, я {name}");

var total = 0;
for (var n = 1; n <= 10; n++)
{
    total = total + n;
    Console.WriteLine($"{n} → сумма {total}");
}

Console.WriteLine($"Сумма чисел от 1 до 10 = {total}");
`,
  },
];

const COMMANDS: CodeLanguageSpec["commands"] = [
  {
    title: "Движение",
    items: [
      { code: "robot.Forward(50);", text: "Вперёд. 50 — мощность от 0 до 100" },
      { code: "robot.Backward(50);", text: "Назад" },
      { code: "robot.TurnLeft(40);", text: "Поворот налево на месте" },
      { code: "robot.TurnRight(40);", text: "Поворот направо на месте" },
      { code: "robot.Forward(50, 2);", text: "Вперёд 2 секунды и остановиться" },
      { code: "robot.Drive(50, 30);", text: "Газ и руль: руль больше 0 — направо" },
      { code: "robot.Stop();", text: "Остановиться" },
    ],
  },
  {
    title: "Ждать и повторять",
    items: [
      { code: "Wait(1);", text: "Подождать 1 секунду" },
      { code: `while (true)\n{\n    ${C}\n}`, text: "Повторять всегда" },
      { code: `for (var i = 0; i < 4; i++)\n{\n    ${C}\n}`, text: "Повторить 4 раза" },
      { code: `if (robot.Obstacle("front"))\n{\n    ${C}\n}`, text: "Если впереди препятствие" },
    ],
  },
  {
    title: "Датчики",
    items: [
      { code: 'robot.Distance("front")', text: "Расстояние: 0 — вплотную, 6 — далеко" },
      { code: 'robot.Obstacle("front")', text: "true, если препятствие близко" },
      { code: "robot.OnLine()", text: "true, если датчик «вниз» видит чёрную линию" },
      { code: "robot.Tilt()", text: "Наклон робота: (X, Y)" },
    ],
  },
  {
    title: "Свет и надписи",
    items: [
      { code: 'robot.Light("all", "green");', text: "Огоньки: red, yellow, green, blue…" },
      { code: "robot.LightsOff();", text: "Выключить огоньки" },
      { code: 'robot.Say("Привет!");', text: "Облачко над роботом" },
      { code: 'Console.WriteLine("Привет!");', text: "Напечатать в окно «Вывод»" },
    ],
  },
];

/* ---------- Подсказки при наборе ---------- */
const method = (template: string, label: string, detail: string, info: string): Completion => snippetCompletion(template, { label, detail, info, type: "method" });

// Команды, которые ничего не возвращают, вставляются сразу с «;».
const ROBOT_METHODS: Completion[] = [
  method("Forward(${1:50});", "Forward", "(мощность, секунды)", "Ехать вперёд. Мощность 0–100. Если указать секунды — проехать столько и остановиться."),
  method("Backward(${1:50});", "Backward", "(мощность, секунды)", "Ехать назад."),
  method("TurnLeft(${1:40});", "TurnLeft", "(мощность, секунды)", "Поворачиваться налево на месте."),
  method("TurnRight(${1:40});", "TurnRight", "(мощность, секунды)", "Поворачиваться направо на месте."),
  method("Drive(${1:50}, ${2:30});", "Drive", "(газ, руль, секунды)", "Газ и руль, как стик геймпада: руль больше 0 — направо, меньше 0 — налево."),
  method("Tank(${1:50}, ${2:50});", "Tank", "(левое, правое, секунды)", "Мощность левого и правого колеса по отдельности, как у танка."),
  method("Stop();", "Stop", "()", "Остановить колёса и моторы."),
  method('Motor("${1:M3}", ${2:50});', "Motor", "(мотор, мощность, секунды)", 'Мощность одного мотора, например третьего: robot.Motor("M3", 50);'),
  method('Distance("${1:front}")', "Distance", "(датчик) → int", "Уровень датчика расстояния: 0 — препятствие вплотную, 6 — далеко."),
  method('DistanceCm("${1:front}")', "DistanceCm", "(датчик) → double?", "Расстояние в сантиметрах, если датчик откалиброван (иначе null)."),
  method('Obstacle("${1:front}")', "Obstacle", "(датчик) → bool", "true, если препятствие близко (уровень меньше 2)."),
  method(
    'OnLine("${1:down}")',
    "OnLine",
    "(датчик) → bool",
    "true, если датчик, смотрящий в пол, видит чёрную линию. Без датчика — первый, поставленный «Вниз»: robot.OnLine().",
  ),
  method("Tilt()", "Tilt", "() → (X, Y)", "Наклон робота: var (x, y) = robot.Tilt();"),
  method("Battery()", "Battery", "() → int", "Заряд батареи."),
  method('Light("${1:all}", "${2:green}");', "Light", "(огонёк, цвет)", 'Включить огонёк: robot.Light("L1", "red"); или все сразу: robot.Light("all", "green");'),
  method("LightsOff();", "LightsOff", "()", "Выключить все огоньки."),
  method('Say("${1:Привет!}");', "Say", "(текст)", "Показать надпись в облачке над роботом."),
  method("Wait(${1:1});", "Wait", "(секунды)", "Подождать. То же, что просто Wait(1);"),
  { label: "Connected", type: "property", detail: "bool", info: "Подключён ли робот к Gearbit." },
];

const CONSOLE_MEMBERS: Completion[] = [
  method('WriteLine(${1:"Привет!"});', "WriteLine", "(текст)", "Напечатать строчку в окно «Вывод»."),
  method('Write(${1:"Привет!"});', "Write", "(текст)", "Напечатать без перехода на новую строку."),
];

const MATH_MEMBERS: Completion[] = [
  method("Abs(${1:x})", "Abs", "(число)", "Число без минуса: Math.Abs(-5) — это 5."),
  method("Round(${1:x})", "Round", "(число)", "Округлить: Math.Round(2.6) — это 3."),
  method("Min(${1:a}, ${2:b})", "Min", "(a, b)", "Меньшее из двух чисел."),
  method("Max(${1:a}, ${2:b})", "Max", "(a, b)", "Большее из двух чисел."),
  method("Sqrt(${1:x})", "Sqrt", "(число)", "Квадратный корень."),
  method("Clamp(${1:x}, ${2:0}, ${3:100})", "Clamp", "(число, от, до)", "Удержать число в пределах: Math.Clamp(120, 0, 100) — это 100."),
];

const keyword = (label: string, info?: string): Completion => ({ label, type: "keyword", info });
const block = (template: string, label: string, info: string): Completion => snippetCompletion(template, { label, info, type: "keyword" });

const GLOBALS: Completion[] = [
  { label: "robot", type: "variable", detail: "робот", info: "Робот, которым управляет программа. Наберите точку: robot." },
  snippetCompletion("Wait(${1:1});", { label: "Wait", type: "function", detail: "(секунды)", info: "Подождать столько секунд. Робот продолжает делать то, что ему сказали." }),
  snippetCompletion('Console.WriteLine(${1:"Привет!"});', { label: "Console.WriteLine", type: "function", detail: "(текст)", info: "Напечатать строчку в окно «Вывод»." }),
  { label: "Console", type: "class", info: "Вывод текста: Console.WriteLine(…);" },
  { label: "Math", type: "class", info: "Математика: Math.Abs, Math.Round, Math.Max…" },
  snippetCompletion("Random.Shared.Next(${1:1}, ${2:7})", { label: "Random", type: "class", detail: "(от, до)", info: "Случайное число: Random.Shared.Next(1, 7) — от 1 до 6, как кубик." }),
  block("while (${1:true})\n{\n\t${2}\n}", "while", "Повторять, пока условие верно: while (true) — всегда."),
  block("for (var ${1:i} = 0; ${1:i} < ${2:4}; ${1:i}++)\n{\n\t${3}\n}", "for", "Повторить несколько раз."),
  block("foreach (var ${1:item} in ${2:list})\n{\n\t${3}\n}", "foreach", "Для каждого элемента списка."),
  block('if (${1:robot.Obstacle("front")})\n{\n\t${2}\n}', "if", "Если условие верно — сделать то, что в { }."),
  block("else\n{\n\t${1}\n}", "else", "Иначе — если условие в if неверно."),
  keyword("var", "Новая переменная: var speed = 50;"),
  keyword("true"),
  keyword("false"),
  keyword("null"),
  keyword("new"),
  keyword("break", "Выйти из цикла."),
  keyword("continue", "Перейти к следующему кругу цикла."),
  keyword("int", "Целое число."),
  keyword("double", "Дробное число."),
  keyword("string", "Текст."),
  keyword("bool", "true или false."),
];

const members: Record<string, Completion[]> = { robot: ROBOT_METHODS, Console: CONSOLE_MEMBERS, Math: MATH_MEMBERS };

function inside(text: string): string {
  return /\w*$/.exec(text)?.[0] ?? "";
}

function stringOptions(context: CompletionContext): CompletionResult | null {
  const sensor = context.matchBefore(/\b(?:Distance|DistanceCm|Obstacle|OnLine)\(\s*"\w*/);
  if (sensor) {
    const places = sensor.text.startsWith("OnLine") ? DOWN_PLACES : [...SENSOR_PLACES, ...DOWN_PLACES];
    return {
      from: sensor.to - inside(sensor.text).length,
      options: places.map((p) => ({ label: p.id, detail: p.title.toLowerCase(), type: "constant" })),
      validFor: /^\w*$/,
    };
  }
  const color = context.matchBefore(/\bLight\(\s*"[^"]*"\s*,\s*"\w*/);
  if (color) {
    return {
      from: color.to - inside(color.text).length,
      options: COLORS.map((c) => ({ label: c, detail: COLOR_NAMES[c].toLowerCase(), type: "constant" })),
      validFor: /^\w*$/,
    };
  }
  const part = context.matchBefore(/\b(Light|Motor)\(\s*"\w*/);
  if (part) {
    const kind = part.text.startsWith("Light") ? "light" : "motor";
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
  // У старых режимов CodeMirror узлы называются по стилю токена: comment, string.
  const node = syntaxTree(context.state).resolveInner(context.pos, -1);
  if (/comment|string/i.test(node.name)) return null;

  const member = context.matchBefore(/\b(robot|Console|Math)\.\w*/);
  if (member) {
    const owner = member.text.slice(0, member.text.indexOf("."));
    return { from: member.from + owner.length + 1, options: members[owner] ?? [], validFor: /^\w*$/ };
  }

  const word = context.matchBefore(/\w+/);
  if (!word && !context.explicit) return null;
  return { from: word?.from ?? context.pos, options: GLOBALS, validFor: /^[\w.]*$/ };
}

// Свой список подсказок вместо встроенного списка всех ключевых слов C# (там много лишнего для ребёнка).
const language = StreamLanguage.define({ ...csharp, languageData: { ...csharp.languageData, autocomplete: undefined } });

export const CSHARP: CodeLanguageSpec = {
  id: "csharp",
  title: "C#",
  file: { description: "Программа на C#", suffix: ".cs", mime: "text/x-csharp", alsoOpen: [".csx"] },
  storageKey: "gearbit.csharp",
  language: () => language,
  completions,
  indent: "    ",
  starter: "// Моя программа на C#. Команды — в карточке «Команды» справа.\n\n",
  examples: EXAMPLES,
  commands: COMMANDS,
  setupHint: "А пока можно программировать во вкладках «Блоки» и «Python».",
  outputHint: "сюда пишет Console.WriteLine()",
};

export function mountCSharpView(root: HTMLElement): CodeView {
  return mountCodeView(root, CSHARP);
}
