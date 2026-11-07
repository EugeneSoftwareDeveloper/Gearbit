# Measurements: checking the robot

[Русский](../../user/measurements.md) · **English**

This page is for grown-ups. Many SuperBot settings come from public sources and are not checked on a real robot: which motor is the left one, what power the robot understands, how many centimeters each sensor step means. The **measurement helper** checks this in half an hour, right in Gearbit, without a phone or nRF Connect.

## Before you start

1. **Put the robot on a stand**, for example a box, so the wheels spin in the air. There is no power limit during measurements: the wheels may spin fast.
2. Connect the robot in Gearbit as usual.
3. In the top bar click the protocol log button (☰), and in the log — **Measurements**.

The helper turns on **measurement mode** when it sends the first frame, and asks for confirmation first. While the mode is on:

- frames go to the robot as they are, byte for byte;
- the remote, the keyboard and block programs don't work, the **Remote** shows the yellow "Protocol measurements are running" bar;
- **STOP and Space always work**;
- if no frames are sent for 15 seconds, Gearbit stops the motors by itself;
- closing the helper window or Gearbit ends the measurements and stops the motors.

## Tabs

**Recording.** Turn it on first: **Start recording**. Everything the computer and the robot said to each other is saved, along with your notes ("M1 — left wheel, spins backward") and the results of the other tabs. At the end, **Stop and save…** gives you a `….capture.json` file. You can send it to the developer or put it in the project's `docs/captures` folder. The robot's unique ID doesn't get into the file.

**Frames.** Ready buttons for the [checklist](../STAGE0-CHECKLIST.md) items: stop, authorization, ID request, each motor at +10 and −10. Hover to see which item it is. Below is a frame builder: the power of each motor (−128…127) and the light color codes. Further down is a field for any frame in hex. At the bottom you see what went to the robot (→) and what came back (←), and how many seconds passed since the last frame: this is how you check whether the robot stops by itself.

**Power.** Pick a motor and values, for example `5, 10, 20, 50, 100`. The motor gets them one by one, a few seconds each. Mark in the table how the wheel spins: "stands still", "slow", "faster", "the same". Where the wheel stops speeding up is the robot's real limit. On our robot the wheel stands still at 1, barely spins at 2 and doesn't get faster after 10. **Copy the results** gives text for the checklist.

**Sensors.** The robot stands still, the motors don't turn on. Put a box or a book 1 cm in front of the sensor (measure with a ruler) and click **Measure**. Repeat for 2, 3, 4, 5… cm and with no obstacle. The sensor sees only close: on our robot, already from 10 cm the level is the same as with no obstacle. The helper marks such rows "does not see" and says from which distance the sensor stops noticing the obstacle. The helper computes the "step → centimeters" table and shows a ready settings snippet — you can copy it and send it.

**Line threshold** (on the same tab, below). For [line following](line-following.md): point the sensor at the floor about 1 cm above a white sheet — **Measure** next to **White paper**, then over black tape — **Measure** next to **Black line**. The helper writes from which level the sensor sees black and adds `"lineLevel"` to the ready settings snippet.

## Already checked

- **Motor direction of the Car.** Forward and backward, left and right were swapped. Fixed: the "mirrored" motor is now M1.

## What's next

Send the developer the recording file or the results. Checked values go into the robot description, and Gearbit starts using them: the right power, centimeters for the sensors, correct light colors.
