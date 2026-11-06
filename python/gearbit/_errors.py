"""Понятные ошибки по-русски: «В строке 5 нет двоеточия» вместо трассировки Python."""

from __future__ import annotations

import difflib
import traceback
from types import TracebackType
from typing import Optional, Tuple

from ._hub import GearbitError

# Команды робота, которые дети пишут без «robot.».
_ROBOT_COMMANDS = {
    "forward", "backward", "turn_left", "turn_right", "tank", "drive", "stop", "motor",
    "light", "lights_off", "distance", "distance_cm", "obstacle", "tilt", "battery", "say",
}


def _syntax_hint(e: SyntaxError) -> str:
    msg = (e.msg or "").lower()
    if isinstance(e, TabError):
        return "Отступы смешаны: где-то пробелы, где-то табуляция. Сделайте отступы только пробелами."
    if isinstance(e, IndentationError):
        if "expected an indented block" in msg:
            return "После строки с двоеточием «:» нужны строки со сдвигом вправо (4 пробела)."
        if "unexpected indent" in msg:
            return "Лишний отступ: эта строка сдвинута вправо, а не должна."
        return "Отступы не совпадают. Строки внутри if, for, while и def сдвигаются вправо одинаково — обычно на 4 пробела."
    if "expected ':'" in msg:
        return "В конце строки с if, elif, else, for, while или def нужно двоеточие «:»."
    if "was never closed" in msg:
        return "Скобка открыта, но не закрыта: проверьте ( ) и [ ]."
    if "unmatched" in msg or "does not match" in msg:
        return "Лишняя или не та закрывающая скобка."
    if "unterminated string" in msg or "eol while scanning" in msg or "unterminated triple-quoted" in msg:
        return "Текст не закрыт: не хватает кавычки в конце."
    if "maybe you meant '==' or ':='" in msg or "cannot assign to" in msg:
        return "Чтобы сравнить, пишите ==. Один знак = запоминает значение в переменной."
    if "perhaps you forgot a comma" in msg:
        return "Кажется, пропущена запятая между значениями."
    if "invalid character" in msg:
        return "В строке есть странный символ — возможно, русская буква или «умная» кавычка вместо обычной."
    if "invalid decimal literal" in msg:
        return "Имя переменной не может начинаться с цифры, а в числах дробная часть пишется через точку: 0.5."
    if "missing parentheses in call to 'print'" in msg:
        return "print пишется со скобками: print(\"привет\")."
    return "Python не понял эту строку. Проверьте скобки, кавычки, двоеточия и знаки."


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
            return f"Python не знает «{name}». Добавьте первой строкой: from gearbit import robot, wait"
        if name in _ROBOT_COMMANDS:
            return f"«{name}» — команда робота. Пишите с точкой: robot.{name}(…)"
        return f"Python не знает имя «{name}». Может быть, опечатка, или переменная ещё не задана выше."
    if isinstance(e, AttributeError):
        name = getattr(e, "name", None)
        text = str(e)
        if not name and "has no attribute '" in text:
            name = text.rsplit("has no attribute '", 1)[1].rstrip("'")  # Python 3.9: у ошибки нет .name
        if (type(getattr(e, "obj", None)).__name__ == "Robot" or text.startswith("'Robot' object")) and name:
            similar = difflib.get_close_matches(name, sorted(_ROBOT_COMMANDS), n=1, cutoff=0.6)
            guess = f" Может быть, robot.{similar[0]}?" if similar else ""
            return f"У робота нет команды «{name}».{guess} Все команды — в карточке «Команды» справа от программы."
        return f"У этого значения нет «{name or str(e)}»."
    if isinstance(e, ZeroDivisionError):
        return "На ноль делить нельзя."
    if isinstance(e, RecursionError):
        return "Функция вызывает сама себя без конца."
    if isinstance(e, IndexError):
        return "В списке нет элемента с таким номером. Номера начинаются с 0."
    if isinstance(e, KeyError):
        return f"В словаре нет ключа {e}."
    if isinstance(e, EOFError):
        return "Программа ждёт ввода с клавиатуры (input), а здесь его нет. Задайте значение прямо в программе."
    if isinstance(e, ModuleNotFoundError):
        return f"Нет модуля «{e.name}». Для робота нужен только gearbit."
    if isinstance(e, TypeError):
        text = str(e)
        if "missing" in text and "required positional argument" in text:
            return f"В команде не хватает значения: {text}"
        if "takes" in text and "given" in text:
            return f"В команде лишние значения: {text}"
        if "unsupported operand" in text or "can only concatenate" in text or "must be str" in text:
            return "Нельзя складывать текст и число. Число превращается в текст так: str(5)."
        return f"Не те значения: {text}"
    if isinstance(e, ValueError):
        return f"Неподходящее значение: {e}"
    if isinstance(e, MemoryError):
        return "Программе не хватило памяти."
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
