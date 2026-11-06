import * as SB from "scratch-blocks";
import { cssVar } from "../ui/dom";

/**
 * Тема Blockly для редактора блоков. Цвета берутся из токенов (styles/tokens.css),
 * поэтому тема пересобирается при переключении светлой/тёмной темы приложения.
 * Фон рабочей области, палитры и списка категорий задаются переменными --colour-* в app.css.
 */

/** Категории Scratch, которые используют встроенные блоки (расширения colours_<имя>). */
const CATEGORIES = ["motion", "looks", "event", "control", "sensing", "operators", "data", "more"] as const;

type Style = SB.Theme.BlockStyle & { colourQuaternary: string };

function style(primary: string, secondary: string, tertiary: string): Style {
  return { colourPrimary: primary, colourSecondary: secondary, colourTertiary: tertiary, colourQuaternary: tertiary, hat: "" };
}

let counter = 0;

export function buildTheme(): SB.Theme {
  const blockStyles: Record<string, Style> = {};
  for (const c of CATEGORIES) blockStyles[c] = style(cssVar(`--block-${c}`), cssVar(`--block-${c}-2`), cssVar(`--block-${c}-3`));
  // Встроенные блоки других категорий (звук, перо, списки) в палитре не показываются, но стиль им нужен.
  blockStyles.sounds = blockStyles.looks!;
  blockStyles.pen = blockStyles.operators!;
  blockStyles.data_lists = blockStyles.data!;
  const field = cssVar("--block-field");
  blockStyles.textField = style(field, field, cssVar("--border"));

  const categoryStyles: Record<string, SB.Theme.CategoryStyle> = {};
  for (const c of CATEGORIES) categoryStyles[c] = { colour: cssVar(`--block-${c}`) };

  // Имя темы уникально: Blockly кэширует темы по имени, а цвета меняются вместе с темой приложения.
  return SB.Theme.defineTheme(`gearbit-${++counter}`, {
    name: `gearbit-${counter}`,
    blockStyles,
    categoryStyles,
    componentStyles: {
      workspaceBackgroundColour: cssVar("--surface-2"),
      toolboxBackgroundColour: cssVar("--surface"),
      toolboxForegroundColour: cssVar("--text-muted"),
      flyoutBackgroundColour: cssVar("--surface"),
      flyoutForegroundColour: cssVar("--text-muted"),
      flyoutOpacity: 1,
      scrollbarColour: cssVar("--border"),
      scrollbarOpacity: 1,
      insertionMarkerColour: cssVar("--text"),
      insertionMarkerOpacity: 0.2,
    },
    fontStyle: { family: cssVar("--font"), weight: "500", size: 12 },
  });
}
