# Measurement recordings

[Русский](README.md) · **English**

Session recordings from the Gearbit measurement helper go here (protocol log → «Замеры» → «Запись»). They are used to refine the protocol ([PROTOCOL-SUPERBOT.md](../en/PROTOCOL-SUPERBOT.md)), to update `devices/*.json` and `profiles/*.json`, and real frames become "golden" test data.

## File name

`YYYY-MM-DD-HHMM.capture.json` — Gearbit suggests it this way (recording start time, UTC). You can add what robot or firmware it is: `2026-11-06-1530-superbot-v2.capture.json`.

## Format (`gearbit-capture`, version 1)

```json
{
  "format": "gearbit-capture",
  "version": 1,
  "startedAt": "2026-11-06T15:30:12.345Z",
  "durationMs": 184000,
  "robot": { "name": "Nordic_TUDAO", "deviceId": "tudao-superbot", "profileId": "superbot-car", "firmware": "v2" },
  "truncated": false,
  "frames": [
    { "at": 1520, "t": 98231, "dir": "out", "hex": "FFFE0901020A000000000000FDFC", "note": "вручную" },
    { "at": 1590, "t": 98301, "dir": "in", "hex": "FFFE0E…FDFC" }
  ],
  "marks": [
    { "at": 1400, "text": "Режим замеров включён" },
    { "at": 9000, "text": "Тест мощности: результаты", "data": { "motor": "M1", "steps": [] } }
  ],
  "events": [
    { "at": 20000, "type": "safety.event", "data": { "reason": "stop", "message": "…" } }
  ]
}
```

Notes and marks are written by Gearbit in Russian: «вручную» — "manually", «Режим замеров включён» — "measurement mode on", «Тест мощности: результаты» — "power test: results".

| Field | Meaning |
|---|---|
| `at` | Milliseconds since the recording started (the interface clock). Frames, notes and events line up into one timeline by it. |
| `t` | Milliseconds since the hub started (from `robot.trace`). |
| `dir` | `out` — computer → robot, `in` — robot → computer. |
| `note` | The hub's label: «авторизация» (authorization), «вручную» (manually) and so on. |
| `marks` | A person's notes and the results of the «Мощность» (Power) and «Датчики» (Sensors) wizards (`data`). |
| `events` | `safety.event` and `robot.state` during the recording. |
| `truncated` | `true` if there were more than 200,000 frames and the tail wasn't recorded. |

**The robot's UID doesn't get into the recording**: the files live in a public repository.

## What to do with a recording

1. Put the file here and commit it.
2. Move the findings into `PROTOCOL-SUPERBOT.md` (and its English copy) with a link to the file, and into `devices/*.json` / `profiles/*.json`. `verified: true` — only for what is really visible in the recording.
