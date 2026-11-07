/**
 * Кадры SuperBot (протокол TUDAO) для замеров этапа 0: docs/STAGE0-CHECKLIST.md, docs/PROTOCOL-SUPERBOT.md.
 * Кадр состояния: FF FE 09 01 02 [M1] [M2] [M3] [L1] [L2] [L3] [L4] FD FC, мощность — знаковый байт.
 */

import { messages } from "../i18n";

const M = messages({
  ru: {
    stop: "Стоп",
    stopHint: "п. 7: все моторы в 0, свет выключен",
    auth: "Авторизация",
    authHint: "п. 3: хаб шлёт её сам при подключении",
    uid: "Запрос UID",
    uidHint: "п. 4: ждём ответ FF FE 08 … FD FC",
    m1Hint: "п. 6: какое колесо крутится и куда",
    m1BackHint: "п. 9: колесо крутится в другую сторону?",
    m2Hint: "п. 10: второе колесо",
    m3Hint: "п. 11: есть ли мотор на порту 3",
  },
  en: {
    stop: "Stop",
    stopHint: "item 7: all motors to 0, lights off",
    auth: "Authorization",
    authHint: "item 3: the hub sends it by itself when connecting",
    uid: "UID request",
    uidHint: "item 4: wait for the answer FF FE 08 … FD FC",
    m1Hint: "item 6: which wheel turns and which way",
    m1BackHint: "item 9: does the wheel turn the other way?",
    m2Hint: "item 10: the second wheel",
    m3Hint: "item 11: is there a motor on port 3",
  },
});

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
  { title: M.stop, hex: STOP_HEX, hint: M.stopHint },
  { title: M.auth, hex: AUTH_HEX, hint: M.authHint },
  { title: M.uid, hex: UID_HEX, hint: M.uidHint },
  { title: "M1 +10", hex: stateFrame([10, 0, 0]), hint: M.m1Hint },
  { title: "M1 −10", hex: stateFrame([-10, 0, 0]), hint: M.m1BackHint },
  { title: "M2 +10", hex: stateFrame([0, 10, 0]), hint: M.m2Hint },
  { title: "M3 +10", hex: stateFrame([0, 0, 10]), hint: M.m3Hint },
];
