"""Робот для программ на Python: `from gearbit import robot, wait`.

Команды простые и синхронные: `robot.forward(50)` возвращается сразу, а робот едет,
пока другая команда не скажет иначе. `robot.forward(50, 2)` — проехать 2 секунды и остановиться.
Мощность — проценты от −100 до 100. Предел мощности для детей применяет хаб, а не программа.
"""

from __future__ import annotations

import atexit
import json
import os
import sys
import threading
import time
from typing import Dict, Optional, Tuple

from ._hub import GearbitError, HubConnection, ProgramStopped

DEFAULT_URL = "ws://localhost:5280/ws"

#: Уровень датчика (0 — вплотную, 6 — далеко), ниже которого впереди препятствие. Как в «Блоках».
OBSTACLE_LEVEL = 2
DISTANCE_MAX = 6

#: Уровень датчика, смотрящего в пол, с которого под ним чёрная линия, если сборка не откалибрована.
LINE_LEVEL = 3

SENSOR_PLACES = ("front", "front_right", "right", "back_right", "back", "back_left", "left", "front_left")
#: Места «смотрит в пол» — для езды по линии.
DOWN_PLACES = ("down_left", "down", "down_right")
_PLACE_WORDS = {
    "впереди": "front",
    "спереди": "front",
    "вперёд": "front",
    "справа": "right",
    "слева": "left",
    "сзади": "back",
    "позади": "back",
    "вниз": "down",
    "снизу": "down",
    "вниз слева": "down_left",
    "вниз справа": "down_right",
}
_PLACE_NAMES = {
    "front": "впереди",
    "right": "справа",
    "left": "слева",
    "back": "сзади",
    "down": "вниз",
    "down_left": "вниз слева",
    "down_right": "вниз справа",
}

COLORS = ("off", "red", "orange", "yellow", "green", "cyan", "blue", "purple", "white")
_COLOR_WORDS = {
    "выкл": "off",
    "выключить": "off",
    "нет": "off",
    "черный": "off",
    "чёрный": "off",
    "красный": "red",
    "оранжевый": "orange",
    "желтый": "yellow",
    "жёлтый": "yellow",
    "зеленый": "green",
    "зелёный": "green",
    "голубой": "cyan",
    "синий": "blue",
    "фиолетовый": "purple",
    "белый": "white",
}

# Строки для интерфейса Gearbit: хаб вырезает их из вывода и превращает в события.
_MARKER = "@@gearbit:"

# Телеметрия приходит 10 раз в секунду: опрашивать датчик чаще бесполезно,
# а короткая пауза не даёт циклу `while True` занять весь процессор.
_SENSOR_PAUSE = 0.01


def _inside_gearbit() -> bool:
    return bool(os.environ.get("GEARBIT_RUN_ID"))


def _emit(event: dict) -> None:
    sys.stdout.write(_MARKER + json.dumps(event, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _power(value: object, what: str = "Мощность") -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise GearbitError(f"{what} — это число от -100 до 100, а не «{value}».")
    return int(round(max(-100.0, min(100.0, float(value)))))


def _seconds(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise GearbitError(f"Время — это число секунд, а не «{value}».")
    return max(0.0, float(value))


class Robot:
    """Подключённый к Gearbit робот. Обычно не создаётся вручную: используйте `gearbit.robot`."""

    def __init__(self, url: Optional[str] = None, name: Optional[str] = None) -> None:
        self._url = url
        self._name = name
        self._hub: Optional[HubConnection] = None
        self._connect_lock = threading.Lock()
        self._drive = (0, 0)
        self._motors: Dict[str, int] = {}
        self._lights: Dict[str, str] = {}
        self._finished = False

    # ---------- Соединение ----------

    def _connection(self) -> HubConnection:
        if self._hub is None:
            with self._connect_lock:
                if self._hub is None:
                    url = self._url or os.environ.get("GEARBIT_URL") or DEFAULT_URL
                    script = os.path.basename(sys.argv[0]) if sys.argv and sys.argv[0] else "программа"
                    name = self._name or os.environ.get("GEARBIT_NAME") or f"Python: {script}"
                    self._hub = HubConnection(url, name, os.environ.get("GEARBIT_RUN_ID"))
                    atexit.register(self._at_exit)
        return self._hub

    def _check(self) -> HubConnection:
        hub = self._connection()
        if hub.interrupted.is_set():
            raise ProgramStopped(hub.interrupt_message or "Программу остановили.")
        return hub

    def _command(self, method: str, params: dict) -> None:
        hub = self._check()
        try:
            hub.call(method, dict(params, source="program"))
        except GearbitError:
            if hub.interrupted.is_set():
                raise ProgramStopped(hub.interrupt_message or "Программу остановили.") from None
            raise

    @property
    def connected(self) -> bool:
        """Подключён ли робот к Gearbit прямо сейчас."""
        info = self._connection().robot
        return bool(info) and info.get("state") == "connected"

    def _info(self) -> dict:
        info = self._check().robot
        if not info or info.get("state") != "connected":
            raise GearbitError("Робот не подключён. Нажмите «Нет робота» вверху Gearbit и выберите робота или эмулятор.")
        return info

    # ---------- Движение ----------

    def forward(self, power: float = 50, seconds: Optional[float] = None) -> None:
        """Ехать вперёд. Если указать секунды — проехать столько и остановиться."""
        p = _power(power)
        self.tank(p, p, seconds)

    def backward(self, power: float = 50, seconds: Optional[float] = None) -> None:
        """Ехать назад."""
        p = _power(power)
        self.tank(-p, -p, seconds)

    def turn_left(self, power: float = 50, seconds: Optional[float] = None) -> None:
        """Поворачиваться налево на месте: колёса крутятся в разные стороны."""
        p = _power(power)
        self.tank(-p, p, seconds)

    def turn_right(self, power: float = 50, seconds: Optional[float] = None) -> None:
        """Поворачиваться направо на месте."""
        p = _power(power)
        self.tank(p, -p, seconds)

    def tank(self, left: float, right: float, seconds: Optional[float] = None) -> None:
        """Мощность левого и правого колеса по отдельности, как у танка."""
        pair = (_power(left, "Мощность левого колеса"), _power(right, "Мощность правого колеса"))
        self._check()  # повтор той же команды в хаб не уходит, но остановку программы заметить должен
        if pair == (0, 0):
            self._stop_drive()
        elif pair != self._drive:
            self._command("drive.tank", {"left": pair[0], "right": pair[1]})
            self._drive = pair
        if seconds is not None:
            wait(seconds)
            self._stop_drive()

    def drive(self, throttle: float, turn: float, seconds: Optional[float] = None) -> None:
        """Газ и руль, как стик геймпада: turn > 0 — направо, turn < 0 — налево."""
        t = _power(throttle, "Газ")
        r = _power(turn, "Поворот")
        self._check()
        if t == 0 and r == 0:
            self._stop_drive()
        else:
            self._command("drive.arcade", {"throttle": t, "turn": r})
            self._drive = (None, None)  # точные мощности колёс считает хаб
        if seconds is not None:
            wait(seconds)
            self._stop_drive()

    def stop(self) -> None:
        """Остановить колёса и моторы, которые включала программа."""
        self._check()
        self._stop_drive()
        for motor_id, power in list(self._motors.items()):
            if power != 0:
                self._command("motor.setPower", {"id": motor_id, "power": 0})
                self._motors[motor_id] = 0

    def _stop_drive(self) -> None:
        if self._drive != (0, 0):
            self._command("drive.stop", {})
            self._drive = (0, 0)

    def motor(self, motor: str, power: float, seconds: Optional[float] = None) -> None:
        """Мощность одного мотора: robot.motor("M1", 50)."""
        p = _power(power)
        self._check()
        if self._motors.get(motor) != p:
            self._command("motor.setPower", {"id": str(motor), "power": p})
            self._motors[motor] = p
        if seconds is not None:
            wait(seconds)
            self.motor(motor, 0)

    # ---------- Свет ----------

    def light(self, light: str = "all", color: str = "white") -> None:
        """Включить огонёк: robot.light("L1", "red") или все сразу: robot.light("all", "green")."""
        info = self._info()
        target = _COLOR_WORDS.get(str(color).strip().lower(), str(color).strip().lower())
        if target not in COLORS:
            raise GearbitError(f"Не знаю цвет «{color}». Можно: {', '.join(COLORS)}.")
        lights = [c for c in info.get("components", []) if c.get("kind") == "light"]
        if light == "all":
            ids = [c["id"] for c in lights]
        else:
            found = [c["id"] for c in lights if c["id"] == light or light in (c.get("aliases") or [])]
            if not found:
                raise GearbitError(f"У этого робота нет огонька «{light}». Есть: {', '.join(c['id'] for c in lights) or 'нет огоньков'}.")
            ids = found[:1]
        for light_id in ids:
            if self._lights.get(light_id) != target:
                self._command("light.setColor", {"id": light_id, "color": target})
                self._lights[light_id] = target

    def lights_off(self) -> None:
        """Выключить все огоньки."""
        self.light("all", "off")

    # ---------- Датчики ----------

    def _sensors(self) -> list:
        """Датчики расстояния, стоящие на роботе: [(описание, место или None)]."""
        places = _sensor_places()
        result = []
        for c in self._info().get("components", []):
            if c.get("kind") != "distance":
                continue
            place = places.get(c["id"])
            if place is None:
                place = next((a for a in c.get("aliases") or [] if a in SENSOR_PLACES or a in DOWN_PLACES), None)
            if place != "none":
                result.append((c, place))
        return result

    def _find_sensor(self, sensor: str) -> dict:
        key = _PLACE_WORDS.get(str(sensor).strip().lower(), str(sensor).strip())
        for c, place in self._sensors():
            if c["id"] == key or place == key:
                return c
        raise GearbitError(
            f"У этой сборки нет датчика «{_PLACE_NAMES.get(key, key)}». "
            "Проверьте, куда он поставлен, в карточке «Датчики» на вкладке «Пульт»."
        )

    def _sensor(self, sensor: str) -> str:
        return self._find_sensor(sensor)["id"]

    def _level(self, sensor_id: str) -> int:
        time.sleep(_SENSOR_PAUSE)
        telemetry = self._check().telemetry or {}
        value = (telemetry.get("distances") or {}).get(sensor_id)
        return DISTANCE_MAX if value is None else int(value)

    def distance(self, sensor: str = "front") -> int:
        """Уровень датчика расстояния: 0 — препятствие вплотную, 6 — далеко или ничего нет."""
        return self._level(self._sensor(sensor))

    def distance_cm(self, sensor: str = "front") -> Optional[float]:
        """Расстояние в сантиметрах, если датчик откалиброван (иначе None)."""
        sensor_id = self._sensor(sensor)
        time.sleep(_SENSOR_PAUSE)
        telemetry = self._check().telemetry or {}
        return (telemetry.get("distancesCm") or {}).get(sensor_id)

    def obstacle(self, sensor: str = "front") -> bool:
        """Есть ли препятствие близко (уровень меньше 2)."""
        return self.distance(sensor) < OBSTACLE_LEVEL

    def on_line(self, sensor: Optional[str] = None) -> bool:
        """Видит ли датчик, смотрящий в пол, чёрную линию. Без имени — первый датчик, поставленный «вниз»."""
        if sensor is None:
            component = next((c for c, place in self._sensors() if place in DOWN_PLACES), None)
            if component is None:
                raise GearbitError(
                    "Ни один датчик не смотрит в пол. Поставьте датчик «Вниз» в карточке «Датчики» "
                    "на вкладке «Пульт» или напишите, какой датчик спросить: robot.on_line(\"down_left\")."
                )
        else:
            component = self._find_sensor(sensor)
        threshold = component.get("lineLevel")
        return self._level(component["id"]) >= (LINE_LEVEL if threshold is None else int(threshold))

    def tilt(self) -> Tuple[int, int]:
        """Наклон робота (x, y). Если гироскопа нет — (0, 0)."""
        self._info()
        time.sleep(_SENSOR_PAUSE)
        tilt = (self._check().telemetry or {}).get("tilt") or {}
        return int(tilt.get("x") or 0), int(tilt.get("y") or 0)

    def battery(self) -> int:
        """Заряд батареи, как его сообщает робот."""
        self._info()
        return int((self._check().telemetry or {}).get("battery") or 0)

    # ---------- Разное ----------

    def say(self, text: object) -> None:
        """Показать надпись в облачке над роботом (в Gearbit) или напечатать её."""
        message = str(text)
        if _inside_gearbit():
            _emit({"type": "say", "text": message})
        elif message:  # пустая надпись в Gearbit убирает облачко, а в консоли печатать нечего
            print(f"Робот: {message}", flush=True)

    def _at_exit(self) -> None:
        """Программа закончилась: свои моторы — в 0, управление — свободно."""
        hub = self._hub
        if hub is None or hub.closed or self._finished:
            return
        self._finished = True
        moving = self._drive != (0, 0) or any(p != 0 for p in self._motors.values())
        try:
            if not hub.interrupted.is_set():
                if self._drive != (0, 0):
                    hub.call("drive.stop", {"source": "program"}, timeout=2)
                for motor_id, power in self._motors.items():
                    if power != 0:
                        hub.call("motor.setPower", {"id": motor_id, "power": 0, "source": "program"}, timeout=2)
                hub.call("control.release", {}, timeout=2)
                if moving:
                    print(
                        "Программа закончилась, и робот остановился. "
                        "Чтобы ехать дольше, добавьте wait(секунды) или цикл while True.",
                        flush=True,
                    )
        except GearbitError:
            pass
        finally:
            hub.close()


def _sensor_places() -> Dict[str, str]:
    """Куда пользователь поставил датчики (карточка «Датчики»). Gearbit передаёт это при запуске."""
    raw = os.environ.get("GEARBIT_SENSOR_PLACES")
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except ValueError:
        return {}
    return {str(k): str(v) for k, v in value.items()} if isinstance(value, dict) else {}


robot = Robot()


def wait(seconds: float) -> None:
    """Подождать столько секунд. Робот при этом продолжает делать то, что ему сказали."""
    end = time.monotonic() + _seconds(seconds)
    hub = robot._hub
    while True:
        if hub is not None and hub.interrupted.is_set():
            raise ProgramStopped(hub.interrupt_message or "Программу остановили.")
        left = end - time.monotonic()
        if left <= 0:
            return
        if hub is not None:
            hub.interrupted.wait(min(left, 0.05))
        else:
            time.sleep(min(left, 0.05))
            hub = robot._hub
