/**
 * Расчёты калибровки датчика расстояния, без DOM: что вставить в profiles/superbot-car.json (calibration.distance).
 * Вкладка «Датчики» помощника замеров (calibration.ts) только собирает замеры и показывает итог.
 */

/** Уровней у датчика SuperBot: 0..6. */
export const LEVELS = 7;

/** Один замер: на каком расстоянии (null — без препятствия или над полом) и какие уровни пришли. */
export interface Sample {
  cm: number | null;
  mode: number | null;
  min: number | null;
  max: number | null;
  count: number;
}

/** Замеры по строкам таблицы. Незамеренная строка — undefined (в массиве бывают дыры). */
export type Samples = readonly (Sample | undefined)[];

/** Самое частое значение (при равенстве — меньшее). */
export function mode(values: readonly number[]): number | null {
  if (!values.length) return null;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
}

/** Уровень, когда датчик ничего не видит: замер «Нет препятствия». */
export function farLevel(samples: Samples): number | null {
  return samples.find((s) => s !== undefined && s.cm === null)?.mode ?? null;
}

/** Замеры с препятствием на известном расстоянии. */
function distanceSamples(samples: Samples): (Sample & { cm: number; mode: number })[] {
  return samples.filter((s): s is Sample & { cm: number; mode: number } => s !== undefined && s.cm !== null && s.mode !== null);
}

/**
 * С какого расстояния датчик уже не замечает препятствие: самое близкое, где уровень такой же, как без препятствия.
 * null — такого замера нет (или не замерено «Нет препятствия»).
 */
export function blindFrom(samples: Samples): number | null {
  const far = farLevel(samples);
  const cms = distanceSamples(samples)
    .filter((s) => s.mode === far)
    .map((s) => s.cm);
  return far !== null && cms.length ? Math.min(...cms) : null;
}

/**
 * Уровень → сантиметры. Замеренному уровню — среднее расстояние. Уровню «без препятствия» — самое близкое
 * расстояние, где датчик уже не видит препятствие («отсюда и дальше»), а не среднее по всем дальним замерам.
 * Между замеренными уровнями — по прямой, за краями — ближайшее известное. null — замеров меньше двух уровней.
 */
export function levelToCm(samples: Samples): number[] | null {
  const far = farLevel(samples);
  const byLevel = new Map<number, number[]>();
  for (const s of distanceSamples(samples)) byLevel.set(s.mode, [...(byLevel.get(s.mode) ?? []), s.cm]);
  const known = [...byLevel]
    .map(([level, cms]) => [level, level === far ? Math.min(...cms) : cms.reduce((a, b) => a + b, 0) / cms.length] as const)
    .sort((a, b) => a[0] - b[0]);
  if (known.length < 2) return null;
  return Array.from({ length: LEVELS }, (_, level) => {
    const exact = known.find(([l]) => l === level);
    if (exact) return Math.round(exact[1]);
    const below = [...known].reverse().find(([l]) => l < level);
    const above = known.find(([l]) => l > level);
    if (!below) return Math.round(above![1]);
    if (!above) return Math.round(below[1]);
    const k = (level - below[0]) / (above[0] - below[0]);
    return Math.round(below[1] + k * (above[1] - below[1]));
  });
}

/**
 * Уровни ниже самого маленького замеренного: в таблице для них взято ближайшее известное расстояние.
 * nearestCm — самое близкое расстояние среди замеров.
 */
export function unseenNearLevels(samples: Samples): { levels: number[]; nearestCm: number | null } {
  const measured = distanceSamples(samples);
  if (!measured.length) return { levels: [], nearestCm: null };
  const lowest = Math.min(...measured.map((s) => s.mode));
  return { levels: Array.from({ length: lowest }, (_, i) => i), nearestCm: Math.min(...measured.map((s) => s.cm)) };
}

/**
 * Порог линии по замерам над белым и над чёрным: с какого уровня датчик видит чёрное.
 * Берём середину между самым тёмным «белым» и самым светлым «чёрным». problem — что пошло не так.
 */
export function lineLevel(white: Sample | undefined, black: Sample | undefined): { level: number | null; problem: string | null } {
  if (white?.max == null || black?.min == null || white.mode === null || black.mode === null) return { level: null, problem: null };
  if (black.mode < white.mode) {
    return {
      level: null,
      problem: "Над чёрным уровень меньше, чем над белым, а Gearbit считает наоборот. Сохраните запись замеров и допишите находку в docs/PROTOCOL-SUPERBOT.md.",
    };
  }
  if (black.min <= white.max) {
    return { level: null, problem: "Белое и чёрное дают одинаковые уровни. Опустите датчик ближе к полу (примерно на 1 см) и замерьте снова." };
  }
  return { level: Math.max(white.max + 1, Math.ceil((white.max + black.min) / 2)), problem: null };
}
