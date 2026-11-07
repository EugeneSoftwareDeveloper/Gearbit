# Questions and problems

[Русский](../../user/faq.md) · **English**

The headings below quote Gearbit's messages as the English interface shows them.

## The robot is not found

- **Close the Apitor app on the phone** or turn Bluetooth off there. The robot connects to only one device.
- Check that **Bluetooth is on in Windows**: Settings → Bluetooth & devices. If the search window shows a Bluetooth warning, it tells you what's wrong.
- Turn the robot off and on again and click **Search again**.
- Bring the robot closer: within 5 meters and without walls between it and the computer.
- In Windows you **don't need** to add the robot to "Bluetooth devices" in advance: Gearbit connects to it by itself.

## "Unknown device" is found

If the robot's name differs from the usual one, Gearbit may not recognize it. Pick this device, set the model in the **Robot model** field and connect. If everything works, tell the developer the device name: it will be added to the list.

## The robot connected but drives the wrong way

- **It drives backward instead of forward, and turns are reversed:** this happened with the **Car** build before the version with the fix — update Gearbit. If it's still reversed, your model has the motors mounted differently; [measurements](measurements.md) will help.
- **It drives backward instead of forward or spins on the spot:** the build has the left and right motors or the direction mixed up. Check that the right build is selected in the connection dialog. If the build is your own, its description is edited in `profiles/*.json`, see the [developer guide](../dev/adding-a-robot.md).
- **It turns the wrong way:** the same, swap the left and right wheels in the build.

## Sensor readings are strange

First check that the sensors are actually mounted on the robot and plugged in. If your model has no sensors, choose **Not on the robot** for each one in the **Sensors** card. If a sensor is not where the label says (for example, it's at the back), pick the right place: click the sensor's name.

The sensor scale (0–6) and the color codes are taken from public sources for now and are not checked on every robot. If 0 means "far" rather than "close", or the LED color doesn't match the button, tell the developer: the fix goes into the robot description file.

## The robot doesn't follow the line

In the **Sensors** card, check that the sensors have a place from the **Looks at the floor: line** group, and that it says **Black** over the tape and **White** over the paper. If the label doesn't change, lower the sensor closer to the floor and measure the threshold. The rest is in [Line following](line-following.md#if-it-doesnt-work).

## "This robot has no gyroscope"

Only robots with the new firmware know the tilt (telemetry frames of 19 bytes). With the old firmware the "tilted?" and "when tilted" blocks and the `tilted` / `Tilted` commands can't work. You can update the firmware in the Apitor phone app if it offers to.

## "Protocol measurements are running"

Someone opened the measurement helper. While it's open, the remote and programs are off. Click **Finish measurements** on the yellow bar or close the helper window. More in [Measurements](measurements.md).

## "The robot is now controlled by another remote"

A second Gearbit window or a browser tab with the remote is open, or a program is running. Click **Take control** or close the extra window.

## "No connection to the Gearbit hub"

The remote is open in a browser, but Gearbit itself is closed. Start Gearbit.exe: the remote reconnects by itself.

## "Port 5280 is used by another program"

The port Gearbit needs is taken by another program. Start Gearbit on another port: `Gearbit.exe --Hub:Port=5300`.

## "Python not found"

Gearbit runs Python programs with the Python installed on the computer. Install Python 3 from [python.org](https://www.python.org/downloads/) and tick **Add python.exe to PATH** during installation. Then restart Gearbit: a program that is already running doesn't see changes to `PATH`. If Python is in an unusual place, give its path at startup: `Gearbit.exe --Hub:PythonPath="C:\Python313\python.exe"`. More in [Python](python.md).

## A Python or C# program doesn't move the robot

Look at **Output**. "The robot is not connected" — connect the robot or the emulator. "This model has no … sensor" — check in the **Sensors** card on the **Remote** tab where the sensor is placed. If the output is empty and the robot stands still, the program has no motion commands or they come after an endless `while True:` loop (in C# — `while (true)`).

## "The C# program launcher is not found"

C# programs are run by `Gearbit.ScriptHost.exe` from the `csharp` folder next to Gearbit.exe. If an antivirus removed the folder or it wasn't copied, reinstall Gearbit. You don't need to install the .NET SDK or Visual Studio separately.

## "Microsoft Edge WebView2 is needed"

The Gearbit window shows the interface through WebView2: a free Microsoft component, already present in Windows 11. Click **Install WebView2** or meanwhile use **Open in browser**.

## The gamepad is not visible

Press any button on the gamepad: the browser engine sees a gamepad only after the first press. Check that Windows sees the gamepad: Settings → Bluetooth & devices.

## The program is gone

Open **History** (the clock button on the **Blocks**, **Python** or **C#** tab). Gearbit saves the program before **New program**, an example and opening a file, when you run it and every 5 minutes of work. Pick a version and click **Restore this version**. More in [Program history](history.md).

## Where settings are stored

Everything is on this computer, in the `%LOCALAPPDATA%\Gearbit` folder:

- `settings.json` — language, looks, speed, sensor places, the last tab and build ([what is remembered](remote-control.md#what-gearbit-remembers));
- `window.json` — where the Gearbit.exe window is and its size;
- `History` — [program history](history.md);
- `WebView2` — the window data, including program drafts.

The power limit is set anew on every connection (the build suggests the default). If you delete the folder, Gearbit starts with the default settings.
