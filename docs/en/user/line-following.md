# Line following

[Русский](../../user/line-following.md) · **English**

The robot drives by itself along a black line on a white floor: in a circle, a figure eight, along any track you draw. For this the sensor looks not forward but **down, at the floor**.

> On our robot the sensor about 1 cm above the floor shows 0 over a white sheet and 3–4 over black tape. The threshold for sensor D1 is already in the **Car** settings — 2. If your sensor is higher, it's a different sensor or a different line, measure the threshold (the "Line threshold" section below) — it takes a minute.

## What you need

- **A track.** A sheet of white drawing paper or a light floor and black electrical tape 1.5–2 cm wide. Smooth turns, no sharp corners: start with an oval, like a stadium.
- **Sensors looking down.** The SuperBot kit has two (IR) sensors. Mount them at the front of the robot so they look at the floor, about 1 cm above it. To drive with two sensors, put them on the sides so the line fits between them: the left one slightly left of the line, the right one slightly right.
- Soft light: bright sun and shiny tape confuse the sensor.

## Setup in Gearbit

1. Connect the robot (or the emulator).
2. On the **Remote** tab, in the **Sensors** card, click the sensor's name and pick a place in the **Looks at the floor: line** group:
   - two sensors — **Down left** and **Down right**;
   - one sensor — **Down**.
3. Put the robot on the track. The card shows **Black** over the tape and **White** over the paper. If it doesn't change, lower the sensor or see "Line threshold".

## The program

Ready-made examples are in all three modes: the **Examples** button → **Follow the line** (two sensors) and **Along the line edge** (one sensor).

**Blocks.** The **Sensing** category has the **sensor [down left] sees the black line?** block. It answers yes or no, so it fits into "if … else" and "wait until". The idea of **Follow the line**:

- the left sensor sees black — the line went left, drive: left wheel 0, right 40;
- the right one sees black — the other way round: left 40, right 0;
- neither sees it — the line is between the sensors, drive straight.

**Python:**

```python
from gearbit import robot, wait

while True:
    left = robot.on_line("down_left")
    right = robot.on_line("down_right")
    if left and not right:
        robot.tank(0, 40)
    elif right and not left:
        robot.tank(40, 0)
    else:
        robot.forward(40)
    wait(0.02)
```

**C#:** the same, only `robot.OnLine("down_left")`, `robot.Tank(0, 40)`, `robot.Forward(40)`, `Wait(0.02);`.

The sensor name can be in Russian: `"вниз слева"`, `"вниз справа"`, `"вниз"`. Without a name — `robot.on_line()` — the first sensor looking down is used.

## Practice in the emulator

Under the emulator room click **Line**: instead of the room a white sheet with a black stadium appears, and the car is placed on the track. Set the sensors to **Down left** and **Down right**, open the **Follow the line** example and run it. The small squares in front of the car show what each sensor sees: black — the line, white — the paper. **Room** brings back the usual room with obstacles.

## Line threshold

The threshold is the level from which Gearbit considers the floor under the sensor black. The default is 3 (the middle of the 0…6 scale); for sensor D1 of the **Car** it's 2 (measured). To find the exact threshold for your build:

1. Protocol log (☰ in the header) → **Measurements** → the **Sensors** tab → the **Line threshold** section.
2. Pick the sensor, hold it 1 cm above the white paper — **Measure** next to **White paper**.
3. Move the paper so the tape is under the sensor — **Measure** next to **Black line**.
4. The helper shows the threshold and a ready line `"lineLevel": N` for the build profile. How to save it is described in [Measurements](measurements.md).

## If it doesn't work

| What you see | What to do |
|---|---|
| The robot flies off the track on a turn | Lower the speed (40 → 30) or make the turn smoother. |
| The robot spins on the spot | The sensors are swapped: swap **Down left** and **Down right**. |
| The same reading over white and over black | Lower the sensor, right to the floor. Check that the tape is matte. |
| Always **Black** | The floor is too dark or the sensor looks into empty space. You need a white sheet. |
| "This build has no «down» sensor" | In the **Sensors** card, set the sensor's place to **Down** or pick another sensor in the block. |
