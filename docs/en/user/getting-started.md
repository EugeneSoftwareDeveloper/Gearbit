# Getting started

[Русский](../../user/getting-started.md) · **English**

## What you need

- A computer with **Windows 10 or 11** and **Bluetooth 4.0** or newer. A laptop's built-in Bluetooth or a USB adapter will do.
- A robot built from the kit, with a charged battery. If the robot isn't at hand yet, the emulator is enough.
- Optionally, an Xbox or PlayStation gamepad: over USB or Bluetooth.

## 1. Download and launch Gearbit

1. Open the [Releases](https://github.com/EugeneSoftwareDeveloper/Gearbit/releases/latest) page and download **Gearbit-…-win-x64.zip** under **Assets**.
2. Unzip the whole archive into any folder, for example Documents. Gearbit won't start from inside the zip.
3. Open **Gearbit.exe** in the unzipped folder. No need to install .NET: it's already inside.

> Windows may show "Windows protected your PC": Gearbit has no digital signature. Click **More info**, then **Run anyway**. You only need to do this on the first launch.

A window with the remote control appears. On the first launch Windows may ask for permission to use Bluetooth: allow it.

> If the window says "Microsoft Edge WebView2 is needed", click **Install WebView2**: it is a free Microsoft component, installed once. Windows 11 already has it. Until it is installed, you can click **Open in browser** and the remote opens in a regular browser.

Gearbit picks the language by itself from the Windows language: Russian for Russian, Ukrainian, Belarusian and Kazakh Windows, English for all others. To change the language, open the settings (⚙ at the top right): **Language · Язык**.

## 2. Try the emulator

1. Click **Connect** in the middle of the screen or the **No robot** badge at the top.
2. Pick **Nordic_TUDAO** — "Virtual car on the screen" — and click **Connect**.
3. A room with a car appears. Drive with **W A S D** or the arrow keys.

The colored rays are distance sensors. Green: far. Yellow: closer. Red: an obstacle is near. Draw a new obstacle with the mouse: hold the button and drag. A double click on an obstacle removes it.

## 3. Connect a real robot

1. **Close the Apitor app on the phone** or turn off Bluetooth on the phone. The robot connects to only one device.
2. Turn the robot on. The LED on the controller blinks: the robot is waiting for a connection.
3. In Gearbit, click the robot badge at the top. The search starts and takes about 4 seconds.
4. Pick the robot that was found. Its name usually starts with **Nordic_TUDAO**.
5. In the **Build** field, pick what you built, for example **Car**. The build decides which motors are the wheels and where the sensors look.
6. Click **Connect**. When the dot on the badge turns green, the robot is ready.

The motors always stop on connection: the robot will not drive off by itself.

## 4. The first ride

- **W** or ↑ — forward, **S** or ↓ — backward.
- **A / D** — turn. Together with W you get a smooth arc, without W — a turn on the spot.
- **Q / E** — a quick spin on the spot.
- **Space** or **Esc** — STOP.

The robot moves only while the key is held. The **Speed** slider sets how fast. Use 40–50 % for the first rides.

## What's next

- [Remote control](remote-control.md): everything the remote can do.
- [Blocks](blocks.md): the first program, after which the robot drives on its own.
- [Python](python.md): when blocks are not enough.
- [C#](csharp.md): the language Gearbit itself is written in.
- [Safety](safety.md): read it before working with a child.
- [Lessons with a child](lessons.md): a program by age from 6.
- [Questions and problems](faq.md): if something didn't work.
