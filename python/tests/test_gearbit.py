"""Тесты пакета gearbit: WebSocket, команды робота, остановка, понятные ошибки."""

from __future__ import annotations

import io
import os
import sys
import tempfile
import time
import unittest
from contextlib import redirect_stderr
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fake_hub import FakeHub  # noqa: E402

from gearbit import GearbitError, ProgramStopped, Robot, wait  # noqa: E402
import gearbit._robot as robot_module  # noqa: E402
from gearbit._errors import explain  # noqa: E402
from gearbit._runner import run  # noqa: E402
from gearbit._ws import OP_TEXT, WebSocket, _mask, encode_frame  # noqa: E402


def until(predicate, timeout=2.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if predicate():
            return True
        time.sleep(0.01)
    return False


class FrameTests(unittest.TestCase):
    def test_mask_is_reversible(self):
        data = "Привет, робот!".encode("utf-8") * 50
        key = b"\x01\x02\x03\x04"
        self.assertEqual(_mask(_mask(data, key), key), data)

    def test_frame_lengths(self):
        for size in (0, 125, 126, 70000):
            frame = encode_frame(OP_TEXT, b"x" * size, mask=False)
            self.assertEqual(frame[0], 0x81)
            if size < 126:
                self.assertEqual(frame[1], size)
            elif size < 65536:
                self.assertEqual(frame[1], 126)
            else:
                self.assertEqual(frame[1], 127)


class RobotTests(unittest.TestCase):
    def setUp(self):
        self.hub = FakeHub()
        os.environ.pop("GEARBIT_SENSOR_PLACES", None)
        os.environ.pop("GEARBIT_RUN_ID", None)
        self.robot = Robot(url=self.hub.url, name="тест")

    def tearDown(self):
        if self.robot._hub:
            self.robot._hub.close()
        self.hub.close()

    def test_hello_and_drive_commands_are_marked_as_program(self):
        self.robot.forward(50)
        self.robot.forward(50)  # повтор той же команды не отправляется
        self.robot.turn_left(30)
        self.robot.stop()
        self.assertEqual(self.hub.calls[0], ("hub.hello", {"name": "тест"}))
        drive = [(m, p) for m, p in self.hub.calls if m.startswith("drive.")]
        self.assertEqual(
            drive,
            [
                ("drive.tank", {"left": 50, "right": 50, "source": "program"}),
                ("drive.tank", {"left": -30, "right": 30, "source": "program"}),
                ("drive.stop", {"source": "program"}),
            ],
        )

    def test_power_is_clamped_and_checked(self):
        self.robot.forward(250)
        self.assertIn(("drive.tank", {"left": 100, "right": 100, "source": "program"}), self.hub.calls)
        with self.assertRaises(GearbitError):
            self.robot.forward("быстро")

    def test_timed_move_stops(self):
        self.robot.backward(40, 0.1)
        self.assertEqual(self.hub.methods()[-2:], ["drive.tank", "drive.stop"])

    def test_sensors_by_place_and_port(self):
        self.robot._connection()
        self.assertEqual(self.robot.distance("front"), 6)
        self.assertEqual(self.robot.distance("справа"), 3)
        self.assertEqual(self.robot.distance("D2"), 3)
        self.assertFalse(self.robot.obstacle("front"))
        self.hub.notify("robot.telemetry", {"distances": {"D1": 1, "D2": 3}})
        self.assertTrue(until(lambda: self.robot.obstacle("front")))
        with self.assertRaises(GearbitError):
            self.robot.distance("back")

    def test_sensor_places_from_gearbit(self):
        os.environ["GEARBIT_SENSOR_PLACES"] = '{"D1": "none", "D2": "front"}'
        try:
            self.assertEqual(self.robot.distance("front"), 3)
            with self.assertRaises(GearbitError):
                self.robot.distance("right")
        finally:
            del os.environ["GEARBIT_SENSOR_PLACES"]

    def test_on_line_uses_sensor_looking_down(self):
        with self.assertRaises(GearbitError) as ctx:
            self.robot.on_line()  # ни один датчик не смотрит в пол
        self.assertIn("Вниз", str(ctx.exception))

        os.environ["GEARBIT_SENSOR_PLACES"] = '{"D1": "down_left", "D2": "down_right"}'
        try:
            self.hub.notify("robot.telemetry", {"distances": {"D1": 6, "D2": 0}})
            self.assertTrue(until(lambda: self.robot.on_line()))   # первый датчик «вниз» — D1
            self.assertTrue(self.robot.on_line("down_left"))
            self.assertFalse(self.robot.on_line("вниз справа"))
            self.assertEqual(self.robot.distance("down_right"), 0)
            # Порог из калибровки сборки (lineLevel): уровень 3 ещё белое, если порог 4.
            self.hub.notify("robot.telemetry", {"distances": {"D1": 3, "D2": 3}})
            self.assertTrue(until(lambda: self.robot.on_line("D2")))
            next(c for c in self.robot._info()["components"] if c["id"] == "D1")["lineLevel"] = 4
            self.assertFalse(self.robot.on_line("D1"))
        finally:
            del os.environ["GEARBIT_SENSOR_PLACES"]

    def test_tilted_by_direction(self):
        self.assertFalse(self.robot.tilted())  # данных о наклоне нет — «нет»
        self.hub.notify("robot.telemetry", {"distances": {}, "tilt": {"x": 0, "y": 20, "acceleration": 10}})
        self.assertTrue(until(lambda: self.robot.tilted("forward")))
        self.assertTrue(self.robot.tilted("вперёд"))
        self.assertTrue(self.robot.tilted())
        self.assertFalse(self.robot.tilted("backward"))
        self.assertFalse(self.robot.tilted("влево"))
        with self.assertRaises(GearbitError) as ctx:
            self.robot.tilted("вверх")
        self.assertIn("Не знаю, куда", str(ctx.exception))
        # Прошивка известна, а гироскопа в ней нет.
        self.robot._info()["firmware"] = "v1"
        with self.assertRaises(GearbitError) as ctx:
            self.robot.tilted()
        self.assertIn("гироскопа", str(ctx.exception))

    def test_lights_all_and_russian_colors(self):
        self.robot.light("all", "красный")
        self.robot.light("L1", "red")  # уже красный — не отправляется
        colors = [p for m, p in self.hub.calls if m == "light.setColor"]
        self.assertEqual([c["id"] for c in colors], ["L1", "L2"])
        self.assertTrue(all(c["color"] == "red" for c in colors))
        with self.assertRaises(GearbitError):
            self.robot.light("L1", "серобуромалиновый")

    def test_hub_error_becomes_gearbit_error(self):
        self.hub.errors["drive.tank"] = {"code": -32002, "message": "Роботом сейчас управляет пульт «Пульт»."}
        with self.assertRaises(GearbitError) as ctx:
            self.robot.forward(50)
        self.assertIn("управляет пульт", str(ctx.exception))

    def test_safety_event_interrupts_program(self):
        self.robot.forward(50)
        self.hub.notify("safety.event", {"reason": "stop", "message": "Остановлено кнопкой СТОП"})
        original = robot_module.robot
        robot_module.robot = self.robot  # wait() смотрит на общий объект robot модуля
        try:
            with self.assertRaises(ProgramStopped):
                wait(2)
        finally:
            robot_module.robot = original
        with self.assertRaises(ProgramStopped):
            self.robot.forward(20)
        with self.assertRaises(ProgramStopped):
            self.robot.forward(50)  # та же команда, что уже работает: в хаб не уходит, но остановку замечает

    def test_ping_is_answered(self):
        self.robot._connection()
        self.hub.ping()
        self.assertEqual(self.robot.battery(), 80)

    def test_exit_stops_own_motors_and_releases_control(self):
        self.robot.forward(50)
        self.robot.motor("M3", 30)
        out = io.StringIO()
        sys_stdout = sys.stdout
        sys.stdout = out
        try:
            self.robot._at_exit()
        finally:
            sys.stdout = sys_stdout
        self.assertEqual(self.hub.methods()[-3:], ["drive.stop", "motor.setPower", "control.release"])
        self.assertIn("робот остановился", out.getvalue())
        self.assertTrue(self.hub.closed.wait(2))

    def test_no_hub_gives_clear_message(self):
        lonely = Robot(url="ws://127.0.0.1:1/ws")
        with self.assertRaises(GearbitError) as ctx:
            lonely.forward(10)
        self.assertIn("Запустите Gearbit", str(ctx.exception))


class FriendlyErrorTests(unittest.TestCase):
    def run_program(self, source: str):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "program.py")
            Path(path).write_text(source, encoding="utf-8")
            err = io.StringIO()
            os.environ["GEARBIT_RUN_ID"] = "test"
            try:
                with redirect_stderr(err):
                    code = run(path)
            finally:
                del os.environ["GEARBIT_RUN_ID"]
            return code, err.getvalue()

    def test_missing_colon(self):
        code, err = self.run_program("x = 1\nif x > 0\n    print(x)\n")
        self.assertEqual(code, 1)
        self.assertIn("Ошибка в строке 2", err)
        self.assertIn("двоеточие", err)
        self.assertIn('@@gearbit:{"type": "error", "line": 2', err)

    def test_unknown_name(self):
        code, err = self.run_program("print('ok')\nforward(50)\n")
        self.assertEqual(code, 1)
        self.assertIn("Ошибка в строке 2", err)
        self.assertIn("robot.forward", err)

    def test_missing_import(self):
        self.assertIn("from gearbit import robot", explain(NameError("name 'robot' is not defined", name="robot")))

    def test_unknown_robot_command_suggests_similar(self):
        from gearbit import Robot

        try:
            Robot().forwrd(50)  # type: ignore[attr-defined]
        except AttributeError as e:
            hint = explain(e)
        self.assertIn("нет команды «forwrd»", hint)
        self.assertIn("robot.forward?", hint)

    def test_zero_division_line(self):
        code, err = self.run_program("a = 5\n\nb = a / 0\n")
        self.assertEqual(code, 1)
        self.assertIn("Ошибка в строке 3: На ноль делить нельзя.", err)

    def test_success(self):
        code, err = self.run_program("total = sum(range(5))\n")
        self.assertEqual((code, err), (0, ""))


if __name__ == "__main__":
    unittest.main()
