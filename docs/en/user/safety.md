# Safety

[Русский](../../user/safety.md) · **English**

The robot is small, but the motors are strong: the car can fall off a table, pinch fingers in the gears or run over a cable. Gearbit has safeguards, but rules are still needed.

## What the app does

- **The robot moves only while the button is held.** Release the key, button or stick — the remote stops the motors right away.
- **Dead man's switch.** If the remote freezes, the tab is closed or you switch to another window, Gearbit stops the robot by itself: within 0.6 seconds at most.
- **STOP always works:** Space, Esc, the big red button or B / Start on the gamepad. It works even when a program or another remote controls the robot.
- **The motors stop on connection.** The robot will not drive off with an old command.
- **Power limit.** 60 % by default for the «Машинка» (Car) build. Change it in the settings (⚙).
- **A Blocks, Python or C# program ended or was stopped — the motors stop.** The same happens when you switch to another tab, minimize the window or lose the connection to the robot. Python and C# programs run separately from the window, and STOP ends them at once, even if the program is stuck in an endless loop.
- **Gearbit closed — the robot stopped and disconnected.**
- **Connection lost** (the robot went too far, the battery died): a message appears, the dot on the badge turns red.

## Rules for working with a child

1. **Drive on the floor,** not on a table. If it has to be a table, it needs a rim along the edge.
2. **Keep fingers and hair away from the wheels and gears** while the robot is on.
3. **Run a new program in the emulator first,** then on the robot. Mistakes in the emulator break nothing.
4. **Before starting a program, a grown-up keeps a hand near Space** or the STOP button.
5. **Clear cables, cups and fragile things out of the way.** Distance sensors may miss thin chair legs and transparent objects.
6. **Battery:** charge under supervision, only with the original cable. Don't use a warm or swollen battery.
7. **Raising the power limit** above what the build suggests is better done together with a grown-up.

## If the robot doesn't stop

1. Press **Space** or the **STOP** button.
2. Didn't help — **turn the robot off with the power button** on the controller.
3. Tell the developer about the problem and attach the protocol log (☰).
