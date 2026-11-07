"""Запуск программы из Gearbit: python -m gearbit._runner program.py

Выполняет программу и, если она упала, пишет понятную ошибку с номером строки.
Gearbit (хаб) читает строки «@@gearbit:{…}» и подсвечивает строку в редакторе.
Коды выхода: 0 — закончилась, 1 — ошибка, 2 — остановлена (СТОП).
"""

from __future__ import annotations

import builtins
import json
import os
import sys
from typing import List

from ._errors import explain, location
from ._hub import ProgramStopped
from ._texts import t

MARKER = "@@gearbit:"


def _report(event: dict) -> None:
    if os.environ.get("GEARBIT_RUN_ID"):
        sys.stderr.write(MARKER + json.dumps(event, ensure_ascii=False) + "\n")
        sys.stderr.flush()


def _fail(e: BaseException, path: str, source_lines: List[str]) -> int:
    message = explain(e)
    line, column = location(e, path)
    where = t("error_in_line", line=line) if line else t("error")
    sys.stderr.write(f"{where}: {message}\n")
    if line and 0 < line <= len(source_lines):
        sys.stderr.write(f"    {source_lines[line - 1].strip()}\n")
    original = f"{type(e).__name__}: {e}".strip()
    if message != str(e) and not message.startswith(original):
        sys.stderr.write(f"(Python: {original})\n")
    sys.stderr.flush()
    _report({"type": "error", "line": line, "column": column, "message": message})
    return 1


def run(path: str) -> int:
    with open(path, encoding="utf-8-sig") as f:
        source = f.read()
    lines = source.splitlines()
    sys.argv = [path]
    sys.path.insert(0, os.path.dirname(os.path.abspath(path)))
    namespace = {"__name__": "__main__", "__file__": path, "__builtins__": builtins}

    try:
        code = compile(source, path, "exec")
    except SyntaxError as e:
        return _fail(e, path, lines)

    try:
        exec(code, namespace)  # noqa: S102 — это и есть запуск программы пользователя
    except ProgramStopped as e:
        sys.stderr.write(t("program_stopped", reason=e) + "\n")
        _report({"type": "stopped", "message": str(e)})
        return 2
    except KeyboardInterrupt:
        sys.stderr.write(t("program_stopped_plain") + "\n")
        return 2
    except SystemExit as e:
        return e.code if isinstance(e.code, int) else 0
    except BaseException as e:  # noqa: BLE001 — любая ошибка программы ребёнка
        return _fail(e, path, lines)
    return 0


def main() -> None:
    if len(sys.argv) < 2:
        sys.stderr.write(t("runner_usage") + "\n")
        sys.exit(64)
    # Вывод через канал (pipe) по умолчанию буферизуется: Gearbit показывает его сразу.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", line_buffering=True)  # type: ignore[attr-defined]
        except (AttributeError, ValueError):
            pass
    sys.exit(run(sys.argv[1]))


if __name__ == "__main__":
    main()
