# gearbit for Python

[Русский](README.md) · **English**

A package for programs that control a robot through Gearbit. No dependencies, Python 3.9 or newer is required.

```python
from gearbit import robot, wait

robot.forward(50)          # drive forward at 50 % power
wait(1)                    # wait a second
robot.turn_left(40, 0.5)   # turn left for half a second
robot.stop()
```

## Where to run

- **In Gearbit**, the Python tab: write, click «Запустить» (Run). No need to install the package.
- **In VS Code, IDLE or a console**: Gearbit must be running, the robot (or the emulator) connected.

```bash
pip install -e python/
python my_program.py
```

The program connects to `ws://localhost:5280/ws`. Another address is set with the `GEARBIT_URL` environment variable.

## Commands

The full list with examples — [docs/en/user/python.md](../docs/en/user/python.md).

## Safety

- The power limit for children is applied by Gearbit, not by the program.
- STOP in Gearbit, connection loss and the watchdog stop the robot, and the program ends with the message «Программа остановлена» (Program stopped).
- When the program ends, it turns its motors off itself.

## Tests

```bash
cd python
python -m unittest discover -s tests
```
