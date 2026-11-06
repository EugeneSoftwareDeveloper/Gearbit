/**
 * Кадры SuperBot (протокол TUDAO) для замеров этапа 0: docs/STAGE0-CHECKLIST.md, docs/PROTOCOL-SUPERBOT.md.
 * Кадр состояния: FF FE 09 01 02 [M1] [M2] [M3] [L1] [L2] [L3] [L4] FD FC, мощность — знаковый байт.
 */

export const AUTH_HEX = "55AA112064796F7A574F50663035326757565034";
export const UID_HEX = "FFFE0104FDFC";

const byte = (n: number) => (n & 0xff).toString(16).toUpperCase().padStart(2, "0");

/** Кадр состояния: моторы −128..127 (как есть, без пересчёта процентов), коды цвета 0..255. */
export function stateFrame(motors: readonly number[], lights: readonly number[] = [0, 0, 0, 0]): string {
  const m = [0, 1, 2].map((i) => byte(motors[i] ?? 0));
  const l = [0, 1, 2, 3].map((i) => byte(lights[i] ?? 0));
  return `FFFE090102${m.join("")}${l.join("")}FDFC`;
}

export const STOP_HEX = stateFrame([0, 0, 0]);

/** Знаковый байт мощности: 10 → «0A», −10 → «F6». */
export const powerByte = (n: number) => byte(n);

/** Разрешённый диапазон знакового байта. */
export const POWER_MIN = -128;
export const POWER_MAX = 127;

/** Готовые кадры из чек-листа (номер пункта — в подписи). */
export const PRESETS: { title: string; hex: string; hint: string }[] = [
  { title: "Стоп", hex: STOP_HEX, hint: "п. 7: все моторы в 0, свет выключен" },
  { title: "Авторизация", hex: AUTH_HEX, hint: "п. 3: хаб шлёт её сам при подключении" },
  { title: "Запрос UID", hex: UID_HEX, hint: "п. 4: ждём ответ FF FE 08 … FD FC" },
  { title: "M1 +10", hex: stateFrame([10, 0, 0]), hint: "п. 6: какое колесо крутится и куда" },
  { title: "M1 −10", hex: stateFrame([-10, 0, 0]), hint: "п. 9: колесо крутится в другую сторону?" },
  { title: "M2 +10", hex: stateFrame([0, 10, 0]), hint: "п. 10: второе колесо" },
  { title: "M3 +10", hex: stateFrame([0, 0, 10]), hint: "п. 11: есть ли мотор на порту 3" },
];
