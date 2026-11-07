import * as SB from "scratch-blocks";
import { cssVar } from "../ui/dom";

/**
 * Палитра блоков (toolbox): категории в порядке, привычном по Scratch.
 * Встроенные блоки Scratch берут русские подписи из scratch-l10n, блоки робота — из robot-blocks.ts.
 */

type Item = Record<string, unknown>;

/** Ключ обработчика категории «Переменные» (регистрируется в view.ts). */
export const VARIABLES_CALLBACK = "GEARBIT_VARIABLES";

const num = (n: number | string, type = "math_number") => ({ shadow: { type, fields: { NUM: n } } });
const text = (t: string) => ({ shadow: { type: "text", fields: { TEXT: t } } });
const block = (type: string, inputs?: Record<string, unknown>, fields?: Record<string, unknown>): Item => ({
  kind: "block",
  type,
  ...(inputs ? { inputs } : {}),
  ...(fields ? { fields } : {}),
});
const gap = (size = 24): Item => ({ kind: "sep", gap: size });

function category(name: string, key: string, contents: Item[] | string): Item {
  const colours = { colour: cssVar(`--block-${key}`), secondaryColour: cssVar(`--block-${key}-3`) };
  return typeof contents === "string"
    ? { kind: "category", name, id: key, custom: contents, ...colours }
    : { kind: "category", name, id: key, contents, ...colours };
}

/**
 * withVariables = false — палитра без «Переменных»: ею создаётся редактор, пока для категории
 * ещё не зарегистрирован обработчик (непрерывная палитра Scratch строит все категории сразу).
 */
export function buildToolbox(withVariables = true): SB.utils.toolbox.ToolboxDefinition {
  // Формат JSON-палитры Blockly; типы Blockly не описывают категории Scratch (colour, custom), поэтому приводим.
  const toolbox = {
    kind: "categoryToolbox",
    contents: [
      category("События", "event", [block("event_whenflagclicked"), block("robot_when_distance", { VALUE: num(2) })]),
      category("Движение", "motion", [
        block("robot_move", { POWER: num(50) }),
        block("robot_turn", { POWER: num(40) }),
        block("robot_move_for", { SECS: num(1, "math_positive_number"), POWER: num(50) }),
        gap(),
        block("robot_tank", { LEFT: num(30), RIGHT: num(50) }),
        block("robot_motor", { POWER: num(50) }),
        gap(),
        block("robot_stop"),
      ]),
      category("Огоньки", "looks", [
        block("robot_light", undefined, { COLOR: "green" }),
        block("robot_lights_off"),
        gap(),
        block("robot_say", { TEXT: text("Привет!") }),
      ]),
      category("Управление", "control", [
        block("control_wait", { DURATION: num(1, "math_positive_number") }),
        gap(),
        block("control_repeat", { TIMES: num(10, "math_whole_number") }),
        block("control_forever"),
        gap(),
        block("control_if"),
        block("control_if_else"),
        block("control_wait_until"),
        block("control_repeat_until"),
        gap(),
        block("control_stop"),
      ]),
      category("Датчики", "sensing", [
        block("robot_distance"),
        block("robot_obstacle"),
        block("robot_on_line"),
        gap(),
        block("robot_tilt"),
        block("robot_battery"),
        gap(),
        block("sensing_timer"),
        block("sensing_resettimer"),
      ]),
      category("Операторы", "operators", [
        block("operator_add", { NUM1: num(""), NUM2: num("") }),
        block("operator_subtract", { NUM1: num(""), NUM2: num("") }),
        block("operator_multiply", { NUM1: num(""), NUM2: num("") }),
        block("operator_divide", { NUM1: num(""), NUM2: num("") }),
        gap(),
        block("operator_random", { FROM: num(1), TO: num(10) }),
        gap(),
        block("operator_gt", { OPERAND1: text(""), OPERAND2: text("50") }),
        block("operator_lt", { OPERAND1: text(""), OPERAND2: text("50") }),
        block("operator_equals", { OPERAND1: text(""), OPERAND2: text("50") }),
        gap(),
        block("operator_and"),
        block("operator_or"),
        block("operator_not"),
        gap(),
        block("operator_join", { STRING1: text("Привет, "), STRING2: text("робот") }),
        gap(),
        block("operator_mod", { NUM1: num(""), NUM2: num("") }),
        block("operator_round", { NUM: num("") }),
        block("operator_mathop", { NUM: num("") }),
      ]),
      ...(withVariables ? [category("Переменные", "data", VARIABLES_CALLBACK)] : []),
    ],
  };
  return toolbox as unknown as SB.utils.toolbox.ToolboxDefinition;
}

/**
 * Категория «Переменные»: кнопка «Создать переменную» и блоки для простых переменных.
 * Списки и показ/скрытие на сцене Scratch здесь не нужны — отрезаем их от стандартной категории.
 */
export function variablesCategory(workspace: SB.WorkspaceSvg): Element[] {
  const all = SB.ScratchVariables.getVariablesCategory(workspace);
  const listStart = all.findIndex((el) => el.getAttribute("callbackKey") === "CREATE_LIST");
  const scalars = listStart >= 0 ? all.slice(0, listStart) : all;
  // У блока переменной в палитре id = id переменной (как в Scratch): по нему работает галочка-табличка.
  for (const el of scalars) {
    const id = el.getAttribute("type") === "data_variable" ? el.querySelector("field")?.getAttribute("id") : null;
    if (id) el.setAttribute("id", id);
  }
  return scalars.filter((el) => !/^data_(show|hide)variable$/.test(el.getAttribute("type") ?? ""));
}
