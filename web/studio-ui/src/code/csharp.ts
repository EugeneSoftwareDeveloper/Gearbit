import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { StreamLanguage, syntaxTree } from "@codemirror/language";
import { csharp } from "@codemirror/legacy-modes/mode/clike";
import { lang, messages } from "../i18n";
import { COLOR_NAMES, COLORS, DOWN_PLACES, SENSOR_PLACES, store, TILT_DIRECTIONS } from "../model";
import { CURSOR_MARK as C } from "./editor";
import { mountCodeView, type CodeExample, type CodeLanguageSpec, type CodeView } from "./view";

/**
 * Вкладка C#: программа — скрипт C# (команды без class и Main). Её собирает и запускает
 * Gearbit.ScriptHost (Roslyn) в отдельном процессе; robot и Wait даёт библиотека Gearbit.Client.
 * Примеры, карточка «Команды» и подсказки — на языке интерфейса; код примеров одинаковый, переведены
 * только комментарии и строки.
 */

type Hint = { detail?: string; info: string };

const M = messages({
  ru: {
    examples: [
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
        id: "tilt-me",
        title: "Наклони меня",
        text: "Огоньки показывают, куда наклонили робота. В эмуляторе — кнопки «Наклонить».",
        code: `// Наклони меня: огоньки показывают, куда наклонили робота.
// В эмуляторе робота наклоняют кнопки «Наклонить» под комнатой.
while (true)
{
    if (robot.Tilted("forward"))
    {
        robot.Light("all", "green");
        robot.Say("Вперёд!");
    }
    else if (robot.Tilted("backward"))
    {
        robot.Light("all", "red");
        robot.Say("Назад!");
    }
    else if (robot.Tilted("left"))
    {
        robot.Light("all", "blue");
        robot.Say("Влево!");
    }
    else if (robot.Tilted("right"))
    {
        robot.Light("all", "yellow");
        robot.Say("Вправо!");
    }
    else
    {
        robot.Light("all", "white");
        robot.Say("Наклони меня!");
    }
    Wait(0.1);
}
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
    ],
    commands: [
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
          { code: 'robot.Tilted("forward")', text: "true, если робот наклонён вперёд (или назад, влево…)" },
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
    ],
    hello: "Привет!",
    robot: {
      Forward: { detail: "(мощность, секунды)", info: "Ехать вперёд. Мощность 0–100. Если указать секунды — проехать столько и остановиться." },
      Backward: { detail: "(мощность, секунды)", info: "Ехать назад." },
      TurnLeft: { detail: "(мощность, секунды)", info: "Поворачиваться налево на месте." },
      TurnRight: { detail: "(мощность, секунды)", info: "Поворачиваться направо на месте." },
      Drive: { detail: "(газ, руль, секунды)", info: "Газ и руль, как стик геймпада: руль больше 0 — направо, меньше 0 — налево." },
      Tank: { detail: "(левое, правое, секунды)", info: "Мощность левого и правого колеса по отдельности, как у танка." },
      Stop: { detail: "()", info: "Остановить колёса и моторы." },
      Motor: { detail: "(мотор, мощность, секунды)", info: 'Мощность одного мотора, например третьего: robot.Motor("M3", 50);' },
      Distance: { detail: "(датчик) → int", info: "Уровень датчика расстояния: 0 — препятствие вплотную, 6 — далеко." },
      DistanceCm: { detail: "(датчик) → double?", info: "Расстояние в сантиметрах, если датчик откалиброван (иначе null)." },
      Obstacle: { detail: "(датчик) → bool", info: "true, если препятствие близко (уровень меньше 2)." },
      OnLine: {
        detail: "(датчик) → bool",
        info: "true, если датчик, смотрящий в пол, видит чёрную линию. Без датчика — первый, поставленный «Вниз»: robot.OnLine().",
      },
      Tilted: { detail: "(сторона) → bool", info: "true, если робот наклонён больше чем на 15°: forward, backward, left, right или any — куда угодно." },
      Tilt: { detail: "() → (X, Y)", info: "Наклон робота в градусах (Y больше 0 — вперёд, X больше 0 — вправо): var (x, y) = robot.Tilt();" },
      Battery: { detail: "() → int", info: "Заряд батареи." },
      Light: { detail: "(огонёк, цвет)", info: 'Включить огонёк: robot.Light("L1", "red"); или все сразу: robot.Light("all", "green");' },
      LightsOff: { detail: "()", info: "Выключить все огоньки." },
      Say: { detail: "(текст)", info: "Показать надпись в облачке над роботом." },
      Wait: { detail: "(секунды)", info: "Подождать. То же, что просто Wait(1);" },
      Connected: { detail: "bool", info: "Подключён ли робот к Gearbit." },
    } satisfies Record<string, Hint>,
    console: {
      WriteLine: { detail: "(текст)", info: "Напечатать строчку в окно «Вывод»." },
      Write: { detail: "(текст)", info: "Напечатать без перехода на новую строку." },
    } satisfies Record<string, Hint>,
    math: {
      Abs: { detail: "(число)", info: "Число без минуса: Math.Abs(-5) — это 5." },
      Round: { detail: "(число)", info: "Округлить: Math.Round(2.6) — это 3." },
      Min: { detail: "(a, b)", info: "Меньшее из двух чисел." },
      Max: { detail: "(a, b)", info: "Большее из двух чисел." },
      Sqrt: { detail: "(число)", info: "Квадратный корень." },
      Clamp: { detail: "(число, от, до)", info: "Удержать число в пределах: Math.Clamp(120, 0, 100) — это 100." },
    } satisfies Record<string, Hint>,
    globals: {
      robot: { detail: "робот", info: "Робот, которым управляет программа. Наберите точку: robot." },
      Wait: { detail: "(секунды)", info: "Подождать столько секунд. Робот продолжает делать то, что ему сказали." },
      WriteLine: { detail: "(текст)", info: "Напечатать строчку в окно «Вывод»." },
      Console: { info: "Вывод текста: Console.WriteLine(…);" },
      Math: { info: "Математика: Math.Abs, Math.Round, Math.Max…" },
      Random: { detail: "(от, до)", info: "Случайное число: Random.Shared.Next(1, 7) — от 1 до 6, как кубик." },
      while: { info: "Повторять, пока условие верно: while (true) — всегда." },
      for: { info: "Повторить несколько раз." },
      foreach: { info: "Для каждого элемента списка." },
      if: { info: "Если условие верно — сделать то, что в { }." },
      else: { info: "Иначе — если условие в if неверно." },
      var: { info: "Новая переменная: var speed = 50;" },
      break: { info: "Выйти из цикла." },
      continue: { info: "Перейти к следующему кругу цикла." },
      int: { info: "Целое число." },
      double: { info: "Дробное число." },
      string: { info: "Текст." },
      bool: { info: "true или false." },
    } satisfies Record<string, Hint>,
    allLights: "все огоньки",
    fileDescription: "Программа на C#",
    starter: "// Моя программа на C#. Команды — в карточке «Команды» справа.\n\n",
    setupHint: "А пока можно программировать во вкладках «Блоки» и «Python».",
    outputHint: "сюда пишет Console.WriteLine()",
  },
  en: {
    examples: [
      {
        id: "first-ride",
        title: "First ride",
        text: "Forward, turn, backward — and a caption in a speech bubble.",
        code: `// First ride: forward, turn, backward.
robot.Say("Let's go!");
robot.Forward(50);
Wait(1);
robot.TurnRight(40);
Wait(0.5);
robot.Backward(50, 1);   // backward for 1 second and stop
robot.Say("We're there!");
`,
      },
      {
        id: "square",
        title: "Square",
        text: "A for loop: four times «forward and turn».",
        code: `// Square: four times «forward and turn».
for (var side = 1; side <= 4; side++)
{
    robot.Say($"Side {side}");
    robot.Forward(50, 1);
    robot.TurnRight(40, 0.6);
}

robot.Say("The square is done!");
`,
      },
      {
        id: "explorer",
        title: "Explorer",
        text: "Drives by itself and goes around obstacles using two sensors.",
        code: `// Explorer: drives forward and goes around obstacles.
robot.Say("Exploring!");
while (true)
{
    if (robot.Obstacle("front"))
    {
        robot.Backward(40, 0.3);
        robot.TurnLeft(40, 0.5);
    }
    else if (robot.Distance("right") < 2)
    {
        robot.Drive(40, -40);   // a wall on the right: steer left
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
        title: "Careful driver",
        text: "The closer the obstacle, the slower it drives.",
        code: `// Careful driver: the closer the obstacle, the slower it drives.
while (true)
{
    // Distance: 0 is very close, 6 is far away.
    var level = robot.Distance("front");
    if (level <= 1)
    {
        robot.Stop();
        robot.Say("Stop!");
    }
    else
    {
        var speed = level * 10;
        robot.Forward(speed);
        robot.Say($"Speed {speed}");
    }
    Wait(0.1);
}
`,
      },
      {
        id: "line",
        title: "Follow the line",
        text: "Two sensors look at the floor with the black line between them.",
        code: `// Follow the line: two sensors look at the floor, the line is between them.
// «Remote» → «Sensors»: «Down left» and «Down right».
// In the emulator choose «Line» under the room.
robot.Say("Following the line!");
while (true)
{
    var left = robot.OnLine("down_left");
    var right = robot.OnLine("down_right");
    if (left && !right)
    {
        robot.Tank(0, 40);   // the line went left
    }
    else if (right && !left)
    {
        robot.Tank(40, 0);   // the line went right
    }
    else
    {
        robot.Forward(40);   // the line is between the sensors
    }
    Wait(0.02);
}
`,
      },
      {
        id: "line-edge",
        title: "Along the line edge",
        text: "One sensor is enough: it zigzags along the edge.",
        code: `// Along the line edge: one sensor looks at the floor.
// «Remote» → «Sensors»: set a sensor to «Down».
// On black steer right, on white steer left, back to the line.
robot.Say("Keeping to the edge!");
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
        title: "Traffic light",
        text: "The lights change color, and the speech bubble gives a hint.",
        code: `// Traffic light: the lights change color in a circle.
var signals = new[]
{
    ("red", "Stop!"),
    ("yellow", "Get ready…"),
    ("green", "Go!"),
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
        id: "tilt-me",
        title: "Tilt me",
        text: "The lights show where the robot is tilted. In the emulator use the «Tilt» buttons.",
        code: `// Tilt me: the lights show where the robot is tilted.
// In the emulator the «Tilt» buttons under the room tilt the robot.
while (true)
{
    if (robot.Tilted("forward"))
    {
        robot.Light("all", "green");
        robot.Say("Forward!");
    }
    else if (robot.Tilted("backward"))
    {
        robot.Light("all", "red");
        robot.Say("Backward!");
    }
    else if (robot.Tilted("left"))
    {
        robot.Light("all", "blue");
        robot.Say("Left!");
    }
    else if (robot.Tilted("right"))
    {
        robot.Light("all", "yellow");
        robot.Say("Right!");
    }
    else
    {
        robot.Light("all", "white");
        robot.Say("Tilt me!");
    }
    Wait(0.1);
}
`,
      },
      {
        id: "counter",
        title: "Counting",
        text: "Variables, a loop and Console.WriteLine. No robot needed.",
        code: `// Counting: variables, a loop and Console.WriteLine. No robot needed.
var name = "Gearbit";
Console.WriteLine($"Hello, I am {name}");

var total = 0;
for (var n = 1; n <= 10; n++)
{
    total = total + n;
    Console.WriteLine($"{n} → sum {total}");
}

Console.WriteLine($"The sum of numbers from 1 to 10 = {total}");
`,
      },
    ],
    commands: [
      {
        title: "Motion",
        items: [
          { code: "robot.Forward(50);", text: "Forward. 50 is power from 0 to 100" },
          { code: "robot.Backward(50);", text: "Backward" },
          { code: "robot.TurnLeft(40);", text: "Turn left on the spot" },
          { code: "robot.TurnRight(40);", text: "Turn right on the spot" },
          { code: "robot.Forward(50, 2);", text: "Forward for 2 seconds and stop" },
          { code: "robot.Drive(50, 30);", text: "Throttle and steering: steering above 0 is right" },
          { code: "robot.Stop();", text: "Stop" },
        ],
      },
      {
        title: "Wait and repeat",
        items: [
          { code: "Wait(1);", text: "Wait 1 second" },
          { code: `while (true)\n{\n    ${C}\n}`, text: "Repeat forever" },
          { code: `for (var i = 0; i < 4; i++)\n{\n    ${C}\n}`, text: "Repeat 4 times" },
          { code: `if (robot.Obstacle("front"))\n{\n    ${C}\n}`, text: "If there is an obstacle in front" },
        ],
      },
      {
        title: "Sensors",
        items: [
          { code: 'robot.Distance("front")', text: "Distance: 0 is very close, 6 is far away" },
          { code: 'robot.Obstacle("front")', text: "true if an obstacle is close" },
          { code: "robot.OnLine()", text: "true if the «down» sensor sees the black line" },
          { code: 'robot.Tilted("forward")', text: "true if the robot is tilted forward (or backward, left…)" },
          { code: "robot.Tilt()", text: "Robot tilt: (X, Y)" },
        ],
      },
      {
        title: "Lights and captions",
        items: [
          { code: 'robot.Light("all", "green");', text: "Lights: red, yellow, green, blue…" },
          { code: "robot.LightsOff();", text: "Turn the lights off" },
          { code: 'robot.Say("Hello!");', text: "A speech bubble above the robot" },
          { code: 'Console.WriteLine("Hello!");', text: "Print to the «Output» window" },
        ],
      },
    ],
    hello: "Hello!",
    robot: {
      Forward: { detail: "(power, seconds)", info: "Drive forward. Power 0–100. With seconds it drives that long and stops." },
      Backward: { detail: "(power, seconds)", info: "Drive backward." },
      TurnLeft: { detail: "(power, seconds)", info: "Turn left on the spot." },
      TurnRight: { detail: "(power, seconds)", info: "Turn right on the spot." },
      Drive: { detail: "(throttle, steering, seconds)", info: "Throttle and steering, like a gamepad stick: steering above 0 is right, below 0 is left." },
      Tank: { detail: "(left, right, seconds)", info: "Power of the left and right wheels separately, like a tank." },
      Stop: { detail: "()", info: "Stop the wheels and motors." },
      Motor: { detail: "(motor, power, seconds)", info: 'Power of one motor, for example the third one: robot.Motor("M3", 50);' },
      Distance: { detail: "(sensor) → int", info: "Distance sensor level: 0 is an obstacle very close, 6 is far away." },
      DistanceCm: { detail: "(sensor) → double?", info: "Distance in centimeters if the sensor is calibrated (otherwise null)." },
      Obstacle: { detail: "(sensor) → bool", info: "true if an obstacle is close (level below 2)." },
      OnLine: {
        detail: "(sensor) → bool",
        info: "true if the sensor looking at the floor sees the black line. Without a sensor it uses the first one set to «Down»: robot.OnLine().",
      },
      Tilted: { detail: "(side) → bool", info: "true if the robot is tilted by more than 15°: forward, backward, left, right or any — any way." },
      Tilt: { detail: "() → (X, Y)", info: "Robot tilt in degrees (Y above 0 is forward, X above 0 is right): var (x, y) = robot.Tilt();" },
      Battery: { detail: "() → int", info: "Battery level." },
      Light: { detail: "(light, color)", info: 'Turn on a light: robot.Light("L1", "red"); or all at once: robot.Light("all", "green");' },
      LightsOff: { detail: "()", info: "Turn all lights off." },
      Say: { detail: "(text)", info: "Show a caption in a speech bubble above the robot." },
      Wait: { detail: "(seconds)", info: "Wait. The same as just Wait(1);" },
      Connected: { detail: "bool", info: "Whether the robot is connected to Gearbit." },
    },
    console: {
      WriteLine: { detail: "(text)", info: "Print a line to the «Output» window." },
      Write: { detail: "(text)", info: "Print without starting a new line." },
    },
    math: {
      Abs: { detail: "(number)", info: "The number without minus: Math.Abs(-5) is 5." },
      Round: { detail: "(number)", info: "Round: Math.Round(2.6) is 3." },
      Min: { detail: "(a, b)", info: "The smaller of two numbers." },
      Max: { detail: "(a, b)", info: "The larger of two numbers." },
      Sqrt: { detail: "(number)", info: "Square root." },
      Clamp: { detail: "(number, from, to)", info: "Keep the number within limits: Math.Clamp(120, 0, 100) is 100." },
    },
    globals: {
      robot: { detail: "robot", info: "The robot the program controls. Type a dot: robot." },
      Wait: { detail: "(seconds)", info: "Wait this many seconds. The robot keeps doing what it was told." },
      WriteLine: { detail: "(text)", info: "Print a line to the «Output» window." },
      Console: { info: "Text output: Console.WriteLine(…);" },
      Math: { info: "Math: Math.Abs, Math.Round, Math.Max…" },
      Random: { detail: "(from, to)", info: "A random number: Random.Shared.Next(1, 7) is from 1 to 6, like a die." },
      while: { info: "Repeat while the condition is true: while (true) is forever." },
      for: { info: "Repeat several times." },
      foreach: { info: "For each item of a list." },
      if: { info: "If the condition is true, do what is inside { }." },
      else: { info: "Otherwise: if the condition in if is false." },
      var: { info: "A new variable: var speed = 50;" },
      break: { info: "Leave the loop." },
      continue: { info: "Go to the next round of the loop." },
      int: { info: "A whole number." },
      double: { info: "A fractional number." },
      string: { info: "Text." },
      bool: { info: "true or false." },
    },
    allLights: "all lights",
    fileDescription: "C# program",
    starter: "// My C# program. Commands are on the «Commands» card on the right.\n\n",
    setupHint: "Meanwhile you can program in the «Blocks» and «Python» tabs.",
    outputHint: "Console.WriteLine() writes here",
  },
});

const EXAMPLES: CodeExample[] = M.examples;
const COMMANDS: CodeLanguageSpec["commands"] = M.commands;

/* ---------- Подсказки при наборе ---------- */
const method = (template: string, label: string, hint: Hint): Completion => snippetCompletion(template, { label, ...hint, type: "method" });
const R = M.robot;
const G = M.globals;
const hello = JSON.stringify(M.hello);

// Команды, которые ничего не возвращают, вставляются сразу с «;».
const ROBOT_METHODS: Completion[] = [
  method("Forward(${1:50});", "Forward", R.Forward),
  method("Backward(${1:50});", "Backward", R.Backward),
  method("TurnLeft(${1:40});", "TurnLeft", R.TurnLeft),
  method("TurnRight(${1:40});", "TurnRight", R.TurnRight),
  method("Drive(${1:50}, ${2:30});", "Drive", R.Drive),
  method("Tank(${1:50}, ${2:50});", "Tank", R.Tank),
  method("Stop();", "Stop", R.Stop),
  method('Motor("${1:M3}", ${2:50});', "Motor", R.Motor),
  method('Distance("${1:front}")', "Distance", R.Distance),
  method('DistanceCm("${1:front}")', "DistanceCm", R.DistanceCm),
  method('Obstacle("${1:front}")', "Obstacle", R.Obstacle),
  method('OnLine("${1:down}")', "OnLine", R.OnLine),
  method('Tilted("${1:any}")', "Tilted", R.Tilted),
  method("Tilt()", "Tilt", R.Tilt),
  method("Battery()", "Battery", R.Battery),
  method('Light("${1:all}", "${2:green}");', "Light", R.Light),
  method("LightsOff();", "LightsOff", R.LightsOff),
  method(`Say("\${1:${M.hello}}");`, "Say", R.Say),
  method("Wait(${1:1});", "Wait", R.Wait),
  { label: "Connected", type: "property", ...R.Connected },
];

const CONSOLE_MEMBERS: Completion[] = [
  method(`WriteLine(\${1:${hello}});`, "WriteLine", M.console.WriteLine),
  method(`Write(\${1:${hello}});`, "Write", M.console.Write),
];

const MATH_MEMBERS: Completion[] = [
  method("Abs(${1:x})", "Abs", M.math.Abs),
  method("Round(${1:x})", "Round", M.math.Round),
  method("Min(${1:a}, ${2:b})", "Min", M.math.Min),
  method("Max(${1:a}, ${2:b})", "Max", M.math.Max),
  method("Sqrt(${1:x})", "Sqrt", M.math.Sqrt),
  method("Clamp(${1:x}, ${2:0}, ${3:100})", "Clamp", M.math.Clamp),
];

const keyword = (label: string, hint?: Hint): Completion => ({ label, type: "keyword", ...hint });
const block = (template: string, label: string, hint: Hint): Completion => snippetCompletion(template, { label, ...hint, type: "keyword" });

const GLOBALS: Completion[] = [
  { label: "robot", type: "variable", ...G.robot },
  snippetCompletion("Wait(${1:1});", { label: "Wait", type: "function", ...G.Wait }),
  snippetCompletion(`Console.WriteLine(\${1:${hello}});`, { label: "Console.WriteLine", type: "function", ...G.WriteLine }),
  { label: "Console", type: "class", ...G.Console },
  { label: "Math", type: "class", ...G.Math },
  snippetCompletion("Random.Shared.Next(${1:1}, ${2:7})", { label: "Random", type: "class", ...G.Random }),
  block("while (${1:true})\n{\n\t${2}\n}", "while", G.while),
  block("for (var ${1:i} = 0; ${1:i} < ${2:4}; ${1:i}++)\n{\n\t${3}\n}", "for", G.for),
  block("foreach (var ${1:item} in ${2:list})\n{\n\t${3}\n}", "foreach", G.foreach),
  block('if (${1:robot.Obstacle("front")})\n{\n\t${2}\n}', "if", G.if),
  block("else\n{\n\t${1}\n}", "else", G.else),
  keyword("var", G.var),
  keyword("true"),
  keyword("false"),
  keyword("null"),
  keyword("new"),
  keyword("break", G.break),
  keyword("continue", G.continue),
  keyword("int", G.int),
  keyword("double", G.double),
  keyword("string", G.string),
  keyword("bool", G.bool),
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
      options: places.map((p) => ({ label: p.id, detail: p.title.toLocaleLowerCase(lang()), type: "constant" })),
      validFor: /^\w*$/,
    };
  }
  const tilt = context.matchBefore(/\bTilted\(\s*"\w*/);
  if (tilt) {
    return {
      from: tilt.to - inside(tilt.text).length,
      options: TILT_DIRECTIONS.map((d) => ({ label: d.id, detail: d.title, type: "constant" })),
      validFor: /^\w*$/,
    };
  }
  const color = context.matchBefore(/\bLight\(\s*"[^"]*"\s*,\s*"\w*/);
  if (color) {
    return {
      from: color.to - inside(color.text).length,
      options: COLORS.map((c) => ({ label: c, detail: COLOR_NAMES[c].toLocaleLowerCase(lang()), type: "constant" })),
      validFor: /^\w*$/,
    };
  }
  const part = context.matchBefore(/\b(Light|Motor)\(\s*"\w*/);
  if (part) {
    const kind = part.text.startsWith("Light") ? "light" : "motor";
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
  file: { description: M.fileDescription, suffix: ".cs", mime: "text/x-csharp", alsoOpen: [".csx"] },
  storageKey: "gearbit.csharp",
  language: () => language,
  completions,
  indent: "    ",
  starter: M.starter,
  examples: EXAMPLES,
  commands: COMMANDS,
  setupHint: M.setupHint,
  outputHint: M.outputHint,
};

export function mountCSharpView(root: HTMLElement): CodeView {
  return mountCodeView(root, CSHARP);
}
