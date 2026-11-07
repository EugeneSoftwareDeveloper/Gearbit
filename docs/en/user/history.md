# Program history

[Русский](../../user/history.md) · **English**

Gearbit keeps earlier versions of the program by itself, the way code editors for programmers do. Clicked **New program** instead of **Save**, opened an example over your own program, deleted something — the version can be brought back.

History is available on the **Blocks**, **Python** and **C#** tabs, each tab has its own.

## When Gearbit saves a version

- before **New program**, an example and **Open** — what was on the screen;
- on **Run**;
- every 5 minutes while you change the program;
- when the Gearbit window is minimized or closed;
- when Gearbit opens, if an unsaved program was left on the screen.

Only your own, changed program is saved. An empty field, an unchanged example or a file you just opened don't go into the history: they are easy to open again anyway. If the program hasn't changed, there will be no second identical version.

## How to bring a version back

1. Click **History** (the clock button to the right of **Save**).
2. On the left — versions by day: the time, when and why it was saved, the program name.
3. Click a version. Its text appears on the right; for blocks — how many blocks, scripts and variables it has.
4. Click **Restore this version**.

The program that was on the screen is saved to the history before that too: you can bring it back as well.

## Where the history is stored

In the `%LOCALAPPDATA%\Gearbit\History` folder, separately for `blocks`, `python` and `csharp`. Each version is a plain JSON file. Gearbit keeps up to 200 versions per tab. Versions older than 30 days are deleted, but the last 20 always stay, even old ones.

History doesn't replace files. Save a program you're proud of with **Save** to your own folder: that way you can move it to another computer or show it to friends.

> History lives on the computer where Gearbit runs. If the window has lost the connection to the hub, the **History** window says so, and the program draft stays on the screen anyway.
