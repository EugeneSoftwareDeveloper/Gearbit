"""Gearbit для Python: управление роботом из программы.

    from gearbit import robot, wait

    robot.forward(50)
    wait(1)
    robot.stop()

Программа подключается к Gearbit (http://localhost:5280) сама при первой команде.
Все команды и их описание: docs/user/python.md.
"""

from ._hub import GearbitError, ProgramStopped
from ._robot import COLORS, OBSTACLE_LEVEL, Robot, robot, wait

__all__ = ["COLORS", "OBSTACLE_LEVEL", "GearbitError", "ProgramStopped", "Robot", "robot", "wait"]
__version__ = "0.1.0"
