"""Понятные ошибки для ребёнка: «В строке 5 нет двоеточия» вместо трассировки Python. Тексты — в _texts.py."""

from __future__ import annotations

import difflib
import traceback
from types import TracebackType
from typing import Optional, Tuple

from ._hub import GearbitError
from ._texts import t

# Команды робота, которые дети пишут без «robot.».
_ROBOT_COMMANDS = {
    "forward", "backward", "turn_left", "turn_right", "tank", "drive", "stop", "motor",
    "light", "lights_off", "distance", "distance_cm", "obstacle", "on_line", "tilt", "tilted", "battery", "say",
}


def _syntax_hint(e: SyntaxError) -> str:
    msg = (e.msg or "").lower()
    if isinstance(e, TabError):
        return t("syntax_tab")
    if isinstance(e, IndentationError):
        if "expected an indented block" in msg:
            return t("syntax_indent_expected")
        if "unexpected indent" in msg:
            return t("syntax_indent_unexpected")
        return t("syntax_indent_mismatch")
    if "expected ':'" in msg:
        return t("syntax_colon")
    if "was never closed" in msg:
        return t("syntax_never_closed")
    if "unmatched" in msg or "does not match" in msg:
        return t("syntax_unmatched")
    if "unterminated string" in msg or "eol while scanning" in msg or "unterminated triple-quoted" in msg:
        return t("syntax_unterminated")
    if "maybe you meant '==' or ':='" in msg or "cannot assign to" in msg:
        return t("syntax_compare")
    if "perhaps you forgot a comma" in msg:
        return t("syntax_comma")
    if "invalid character" in msg:
        return t("syntax_invalid_char")
    if "invalid decimal literal" in msg:
        return t("syntax_decimal")
    if "missing parentheses in call to 'print'" in msg:
        return t("syntax_print")
    return t("syntax_other")


def explain(e: BaseException) -> str:
    """Короткое объяснение ошибки для ребёнка."""
    if isinstance(e, GearbitError):
        return str(e)
    if isinstance(e, SyntaxError):
        return _syntax_hint(e)
    if isinstance(e, NameError):
        name = getattr(e, "name", None)
        if not name:
            text = str(e)
            name = text.split("'")[1] if "'" in text else text
        if name in ("robot", "wait"):
            return t("name_import", name=name)
        if name in _ROBOT_COMMANDS:
            return t("name_robot_command", name=name)
        return t("name_unknown", name=name)
    if isinstance(e, AttributeError):
        name = getattr(e, "name", None)
        text = str(e)
        if not name and "has no attribute '" in text:
            name = text.rsplit("has no attribute '", 1)[1].rstrip("'")  # Python 3.9: у ошибки нет .name
        if (type(getattr(e, "obj", None)).__name__ == "Robot" or text.startswith("'Robot' object")) and name:
            similar = difflib.get_close_matches(name, sorted(_ROBOT_COMMANDS), n=1, cutoff=0.6)
            guess = t("attr_guess", name=similar[0]) if similar else ""
            return t("attr_robot", name=name, guess=guess)
        return t("attr_other", name=name or str(e))
    if isinstance(e, ZeroDivisionError):
        return t("zero_division")
    if isinstance(e, RecursionError):
        return t("recursion")
    if isinstance(e, IndexError):
        return t("index")
    if isinstance(e, KeyError):
        return t("key", key=e)
    if isinstance(e, EOFError):
        return t("eof")
    if isinstance(e, ModuleNotFoundError):
        return t("module", name=e.name)
    if isinstance(e, TypeError):
        text = str(e)
        if "missing" in text and "required positional argument" in text:
            return t("type_missing", text=text)
        if "takes" in text and "given" in text:
            return t("type_extra", text=text)
        if "unsupported operand" in text or "can only concatenate" in text or "must be str" in text:
            return t("type_concat")
        return t("type_other", text=text)
    if isinstance(e, ValueError):
        return t("value", text=e)
    if isinstance(e, MemoryError):
        return t("memory")
    return f"{type(e).__name__}: {e}"


def location(e: BaseException, filename: str) -> Tuple[Optional[int], Optional[int]]:
    """Строка и столбец в программе пользователя (не внутри gearbit)."""
    if isinstance(e, SyntaxError) and e.filename == filename:
        return e.lineno, e.offset
    line = None
    tb: Optional[TracebackType] = e.__traceback__
    for frame, lineno in traceback.walk_tb(tb):
        if frame.f_code.co_filename == filename:
            line = lineno
    return line, None
