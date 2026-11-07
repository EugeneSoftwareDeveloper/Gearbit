"""Тексты на двух языках: полнота перевода, выбор языка, английские ошибки."""

from __future__ import annotations

import os
import string
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from gearbit._errors import explain  # noqa: E402
from gearbit._texts import EN, RU, detect_lang, lang, set_lang, t  # noqa: E402


def fields(text: str) -> set:
    return {name for _, name, _, _ in string.Formatter().parse(text) if name}


class TextsTests(unittest.TestCase):
    def setUp(self):
        self.saved = lang()

    def tearDown(self):
        set_lang(self.saved)

    def test_every_text_is_translated_with_the_same_params(self):
        self.assertEqual(set(RU), set(EN))
        for key in RU:
            with self.subTest(key=key):
                self.assertEqual(fields(RU[key]), fields(EN[key]))
                self.assertTrue(EN[key].strip())

    def test_language_comes_from_gearbit_lang_then_system(self):
        with mock.patch.dict(os.environ, {"GEARBIT_LANG": "en"}):
            self.assertEqual(detect_lang(), "en")
        with mock.patch.dict(os.environ, {"GEARBIT_LANG": "ru-RU"}):
            self.assertEqual(detect_lang(), "ru")
        clean = {k: v for k, v in os.environ.items() if k not in ("GEARBIT_LANG", "LC_ALL", "LC_MESSAGES", "LANG")}
        with mock.patch.dict(os.environ, {**clean, "LANG": "uk_UA.UTF-8"}, clear=True):
            self.assertEqual(detect_lang(), "ru")
        with mock.patch.dict(os.environ, {**clean, "LANG": "de_DE.UTF-8"}, clear=True):
            self.assertEqual(detect_lang(), "en")

    def test_set_lang_accepts_locale_names(self):
        set_lang("en-US")
        self.assertEqual(lang(), "en")
        set_lang("Russian_Russia")
        self.assertEqual(lang(), "ru")

    def test_messages_follow_the_language(self):
        set_lang("en")
        self.assertEqual(t("error_in_line", line=3), "Error in line 3")
        self.assertIn("divide by zero", explain(ZeroDivisionError("division by zero")))
        set_lang("ru")
        self.assertEqual(t("error_in_line", line=3), "Ошибка в строке 3")


if __name__ == "__main__":
    unittest.main()
