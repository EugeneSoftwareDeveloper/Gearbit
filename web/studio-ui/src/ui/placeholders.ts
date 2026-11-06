import { icons } from "../icons";
import { h, icon } from "./dom";

/**
 * Python и C# пока в разработке (этапы 3–4 плана).
 * Показываем, как будет выглядеть одна и та же программа «Исследователь» на каждом языке.
 */
const SAMPLES = {
  python: {
    title: "Python",
    glyph: icons.python,
    text: "Настоящий Python: пишите здесь или в любимом редакторе (VS Code, IDLE). Программа работает в отдельном процессе — СТОП прерывает её всегда.",
    code: `from gearbit import robot, wait

while True:
    if robot.distance("front") < 2:
        robot.turn_left(40)
        wait(0.4)
    elif robot.distance("right") < 2:
        robot.drive(30, 50)
    else:
        robot.forward(50)`,
  },
  csharp: {
    title: "C#",
    glyph: icons.csharp,
    text: "C#-скрипты с готовой переменной robot. Для взрослых — пакет Gearbit.Client для своих приложений в Visual Studio.",
    code: `while (true)
{
    if (robot.Distance("front") < 2)
    {
        await robot.TurnLeft(40);
        await Wait(0.4);
    }
    else if (robot.Distance("right") < 2)
        await robot.Drive(30, 50);
    else
        await robot.Forward(50);
}`,
  },
} as const;

export type ProgramMode = keyof typeof SAMPLES;

export function createPlaceholder(mode: ProgramMode): HTMLElement {
  const s = SAMPLES[mode];
  return h(
    "section",
    { class: "view", id: `view-${mode}`, "aria-label": s.title },
    h(
      "div",
      { class: "placeholder" },
      h("div", { class: "big-icon" }, icon(s.glyph)),
      h("h1", {}, `${s.title} — скоро`),
      h("p", {}, s.text),
      h("p", {}, "Пример: «Исследователь» объезжает препятствия по двум датчикам. Такая программа уже есть на вкладке «Блоки» — откройте её в «Примерах» и запустите на эмуляторе."),
      h("pre", {}, h("code", {}, s.code)),
    ),
  );
}
