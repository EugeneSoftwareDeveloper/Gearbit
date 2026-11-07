"""Тексты для ребёнка на двух языках: русском и английском.

Язык задаёт Gearbit: переменная GEARBIT_LANG (ru, en) — язык вкладки, которая запустила программу.
Без неё (программа запущена вне Gearbit) язык берётся из настроек системы.
Новый текст добавляйте сразу в RU и EN с теми же {параметрами}: это проверяет тест test_texts.
"""

from __future__ import annotations

import locale
import os
from typing import Dict

RU: Dict[str, str] = {
    # Соединение с хабом
    "cannot_connect": "Не получилось связаться с Gearbit ({url}). Запустите Gearbit и попробуйте ещё раз. Подробно: {detail}",
    "connection_lost": "Связь с Gearbit потеряна.",
    "no_answer": "Gearbit не ответил на команду {method}.",
    "hub_error": "Ошибка хаба",
    "stopped": "Программу остановили.",
    # WebSocket (подробности к cannot_connect)
    "ws_only_ws": "Поддерживается только адрес ws://, а не {url}",
    "ws_connect_failed": "Не удалось подключиться к {host}:{port}: {detail}",
    "ws_closed_handshake": "Сервер закрыл соединение во время рукопожатия",
    "ws_long_answer": "Слишком длинный ответ сервера",
    "ws_handshake_failed": "Ошибка рукопожатия WebSocket: {detail}",
    "ws_not_opened": "Сервер не открыл WebSocket: {status}",
    "ws_bad_key": "Сервер ответил неверным ключом WebSocket",
    "ws_closed": "Соединение закрыто",
    "ws_too_big": "Слишком большое сообщение",
    "ws_send_failed": "Не удалось отправить: {detail}",
    # Робот
    "default_program": "программа",
    "no_robot": "Робот не подключён. Нажмите «Нет робота» вверху Gearbit и выберите робота или эмулятор.",
    "power": "Мощность",
    "power_left": "Мощность левого колеса",
    "power_right": "Мощность правого колеса",
    "throttle": "Газ",
    "turn": "Поворот",
    "not_number": "{what} — это число от -100 до 100, а не «{value}».",
    "not_seconds": "Время — это число секунд, а не «{value}».",
    "unknown_color": "Не знаю цвет «{color}». Можно: {colors}.",
    "no_light": "У этого робота нет огонька «{light}». Есть: {lights}.",
    "no_lights": "нет огоньков",
    "no_sensor": "У этой сборки нет датчика «{place}». Проверьте, куда он поставлен, в карточке «Датчики» на вкладке «Пульт».",
    "no_down_sensor": (
        "Ни один датчик не смотрит в пол. Поставьте датчик «Вниз» в карточке «Датчики» "
        "на вкладке «Пульт» или напишите, какой датчик спросить: robot.on_line(\"down_left\")."
    ),
    "unknown_tilt": "Не знаю, куда это — «{direction}». Напишите \"forward\", \"backward\", \"left\", \"right\" или \"any\".",
    "no_gyro": "У этого робота нет гироскопа: наклон знают только роботы с новой прошивкой.",
    "robot_says": "Робот: {text}",
    "finished_moving": (
        "Программа закончилась, и робот остановился. "
        "Чтобы ехать дольше, добавьте wait(секунды) или цикл while True."
    ),
    # Запуск программы
    "error_in_line": "Ошибка в строке {line}",
    "error": "Ошибка",
    "program_stopped": "Программа остановлена: {reason}",
    "program_stopped_plain": "Программа остановлена.",
    "runner_usage": "Использование: python -m gearbit._runner программа.py",
    # Ошибки Python
    "syntax_tab": "Отступы смешаны: где-то пробелы, где-то табуляция. Сделайте отступы только пробелами.",
    "syntax_indent_expected": "После строки с двоеточием «:» нужны строки со сдвигом вправо (4 пробела).",
    "syntax_indent_unexpected": "Лишний отступ: эта строка сдвинута вправо, а не должна.",
    "syntax_indent_mismatch": "Отступы не совпадают. Строки внутри if, for, while и def сдвигаются вправо одинаково — обычно на 4 пробела.",
    "syntax_colon": "В конце строки с if, elif, else, for, while или def нужно двоеточие «:».",
    "syntax_never_closed": "Скобка открыта, но не закрыта: проверьте ( ) и [ ].",
    "syntax_unmatched": "Лишняя или не та закрывающая скобка.",
    "syntax_unterminated": "Текст не закрыт: не хватает кавычки в конце.",
    "syntax_compare": "Чтобы сравнить, пишите ==. Один знак = запоминает значение в переменной.",
    "syntax_comma": "Кажется, пропущена запятая между значениями.",
    "syntax_invalid_char": "В строке есть странный символ — возможно, русская буква или «умная» кавычка вместо обычной.",
    "syntax_decimal": "Имя переменной не может начинаться с цифры, а в числах дробная часть пишется через точку: 0.5.",
    "syntax_print": "print пишется со скобками: print(\"привет\").",
    "syntax_other": "Python не понял эту строку. Проверьте скобки, кавычки, двоеточия и знаки.",
    "name_import": "Python не знает «{name}». Добавьте первой строкой: from gearbit import robot, wait",
    "name_robot_command": "«{name}» — команда робота. Пишите с точкой: robot.{name}(…)",
    "name_unknown": "Python не знает имя «{name}». Может быть, опечатка, или переменная ещё не задана выше.",
    "attr_guess": " Может быть, robot.{name}?",
    "attr_robot": "У робота нет команды «{name}».{guess} Все команды — в карточке «Команды» справа от программы.",
    "attr_other": "У этого значения нет «{name}».",
    "zero_division": "На ноль делить нельзя.",
    "recursion": "Функция вызывает сама себя без конца.",
    "index": "В списке нет элемента с таким номером. Номера начинаются с 0.",
    "key": "В словаре нет ключа {key}.",
    "eof": "Программа ждёт ввода с клавиатуры (input), а здесь его нет. Задайте значение прямо в программе.",
    "module": "Нет модуля «{name}». Для робота нужен только gearbit.",
    "type_missing": "В команде не хватает значения: {text}",
    "type_extra": "В команде лишние значения: {text}",
    "type_concat": "Нельзя складывать текст и число. Число превращается в текст так: str(5).",
    "type_other": "Не те значения: {text}",
    "value": "Неподходящее значение: {text}",
    "memory": "Программе не хватило памяти.",
}

EN: Dict[str, str] = {
    "cannot_connect": "Could not reach Gearbit ({url}). Start Gearbit and try again. Details: {detail}",
    "connection_lost": "Lost connection to Gearbit.",
    "no_answer": "Gearbit did not answer the command {method}.",
    "hub_error": "Hub error",
    "stopped": "The program was stopped.",
    "ws_only_ws": "Only ws:// addresses are supported, not {url}",
    "ws_connect_failed": "Could not connect to {host}:{port}: {detail}",
    "ws_closed_handshake": "The server closed the connection during the handshake",
    "ws_long_answer": "The server answer is too long",
    "ws_handshake_failed": "WebSocket handshake error: {detail}",
    "ws_not_opened": "The server did not open a WebSocket: {status}",
    "ws_bad_key": "The server answered with a wrong WebSocket key",
    "ws_closed": "The connection is closed",
    "ws_too_big": "The message is too big",
    "ws_send_failed": "Could not send: {detail}",
    "default_program": "program",
    "no_robot": "No robot connected. Press «No robot» at the top of Gearbit and choose a robot or the emulator.",
    "power": "Power",
    "power_left": "Left wheel power",
    "power_right": "Right wheel power",
    "throttle": "Throttle",
    "turn": "Turn",
    "not_number": "{what} is a number from -100 to 100, not «{value}».",
    "not_seconds": "Time is a number of seconds, not «{value}».",
    "unknown_color": "I don't know the color «{color}». You can use: {colors}.",
    "no_light": "This robot has no light «{light}». There are: {lights}.",
    "no_lights": "no lights",
    "no_sensor": "This model has no «{place}» sensor. Check where it is placed in the «Sensors» card on the «Remote» tab.",
    "no_down_sensor": (
        "No sensor looks at the floor. Set a sensor to «Down» in the «Sensors» card "
        "on the «Remote» tab, or write which sensor to ask: robot.on_line(\"down_left\")."
    ),
    "unknown_tilt": "I don't know which way «{direction}» is. Write \"forward\", \"backward\", \"left\", \"right\" or \"any\".",
    "no_gyro": "This robot has no gyroscope: only robots with new firmware know their tilt.",
    "robot_says": "Robot: {text}",
    "finished_moving": (
        "The program ended, and the robot stopped. "
        "To drive longer, add wait(seconds) or a while True loop."
    ),
    "error_in_line": "Error in line {line}",
    "error": "Error",
    "program_stopped": "The program was stopped: {reason}",
    "program_stopped_plain": "The program was stopped.",
    "runner_usage": "Usage: python -m gearbit._runner program.py",
    "syntax_tab": "Mixed indents: spaces in some places, tabs in others. Use only spaces for indents.",
    "syntax_indent_expected": "After a line with a colon «:» the next lines must be shifted right (4 spaces).",
    "syntax_indent_unexpected": "Extra indent: this line is shifted right, but it should not be.",
    "syntax_indent_mismatch": "Indents do not match. Lines inside if, for, while and def are shifted right the same way — usually by 4 spaces.",
    "syntax_colon": "A line with if, elif, else, for, while or def needs a colon «:» at the end.",
    "syntax_never_closed": "A bracket is opened but not closed: check ( ) and [ ].",
    "syntax_unmatched": "An extra or wrong closing bracket.",
    "syntax_unterminated": "The text is not closed: a quote is missing at the end.",
    "syntax_compare": "To compare, write ==. A single = stores a value in a variable.",
    "syntax_comma": "It looks like a comma between values is missing.",
    "syntax_invalid_char": "The line has a strange character — maybe a non-English letter or a «smart» quote instead of a plain one.",
    "syntax_decimal": "A variable name cannot start with a digit, and decimal numbers use a dot: 0.5.",
    "syntax_print": "print needs brackets: print(\"hello\").",
    "syntax_other": "Python did not understand this line. Check the brackets, quotes, colons and signs.",
    "name_import": "Python does not know «{name}». Add this as the first line: from gearbit import robot, wait",
    "name_robot_command": "«{name}» is a robot command. Write it with a dot: robot.{name}(…)",
    "name_unknown": "Python does not know the name «{name}». Maybe it is a typo, or the variable is not set above yet.",
    "attr_guess": " Maybe robot.{name}?",
    "attr_robot": "The robot has no command «{name}».{guess} All commands are in the «Commands» card to the right of the program.",
    "attr_other": "This value has no «{name}».",
    "zero_division": "You cannot divide by zero.",
    "recursion": "The function calls itself without end.",
    "index": "The list has no item with this number. Numbers start at 0.",
    "key": "The dictionary has no key {key}.",
    "eof": "The program waits for keyboard input (input), but there is none here. Set the value right in the program.",
    "module": "There is no module «{name}». The robot needs only gearbit.",
    "type_missing": "The command is missing a value: {text}",
    "type_extra": "The command has extra values: {text}",
    "type_concat": "You cannot add text and a number. Turn a number into text like this: str(5).",
    "type_other": "Wrong values: {text}",
    "value": "Unsuitable value: {text}",
    "memory": "The program ran out of memory.",
}

LANGUAGES = {"ru": RU, "en": EN}

# Языки, для которых интерфейс Gearbit тоже выбирает русский (как detectLang в интерфейсе).
_RUSSIAN_FAMILY = ("ru", "uk", "be", "kk", "russian", "ukrainian", "belarusian", "kazakh")


def _normalize(value: str) -> str:
    """«en-US», «ru_RU.UTF-8», «Russian_Russia» → «ru» или «en»."""
    code = value.strip().lower().replace("-", "_").split(".")[0].split("_")[0]
    return "ru" if code in _RUSSIAN_FAMILY else "en"


def detect_lang() -> str:
    """GEARBIT_LANG, иначе язык системы. Ничего не известно — русский, как хаб без lang."""
    explicit = os.environ.get("GEARBIT_LANG", "").strip()
    if explicit:
        return _normalize(explicit)
    for name in ("LC_ALL", "LC_MESSAGES", "LANG"):
        value = os.environ.get(name, "").strip()
        if value and value not in ("C", "POSIX"):
            return _normalize(value)
    try:
        system = locale.getlocale()[0]
    except ValueError:
        system = None
    return _normalize(system) if system else "ru"


_lang = detect_lang()


def lang() -> str:
    """Текущий язык сообщений: «ru» или «en»."""
    return _lang


def set_lang(value: str) -> None:
    """Сменить язык сообщений (для тестов и программ вне Gearbit)."""
    global _lang
    _lang = _normalize(value)


def t(key: str, **params: object) -> str:
    """Текст по ключу на текущем языке; {параметры} подставляются."""
    text = LANGUAGES[_lang][key]
    return text.format(**params) if params else text
