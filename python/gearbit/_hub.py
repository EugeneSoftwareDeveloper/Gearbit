"""Соединение с хабом Gearbit: JSON-RPC 2.0 через WebSocket.

Один поток-читатель принимает ответы и уведомления (телеметрию, safety.event),
вызовы из программы ждут свой ответ. Протокол описан в docs/dev/hub-api.md.
"""

from __future__ import annotations

import json
import threading
from typing import Any, Callable, Dict, Optional

from ._ws import WebSocket, WebSocketError


class GearbitError(Exception):
    """Хаб отказал или связи нет. Текст — по-русски, его можно показать ребёнку."""

    def __init__(self, message: str, code: Optional[int] = None) -> None:
        super().__init__(message)
        self.code = code


class ProgramStopped(BaseException):
    """Программу остановили: СТОП, страж, потеря связи с роботом.

    Наследник BaseException, как KeyboardInterrupt: `except Exception:` в программе его не поймает.
    """


class HubConnection:
    def __init__(self, url: str, name: str, run_id: Optional[str] = None, timeout: float = 5.0) -> None:
        try:
            self._ws = WebSocket.connect(url, timeout=timeout)
        except WebSocketError as e:
            raise GearbitError(
                f"Не получилось связаться с Gearbit ({url}). Запустите Gearbit и попробуйте ещё раз. Подробно: {e}"
            ) from None
        self._lock = threading.Lock()
        self._pending: Dict[int, list] = {}
        self._next_id = 1
        self._closed = threading.Event()
        self._listeners: Dict[str, list] = {}
        self.telemetry: Optional[dict] = None
        self.robot: Optional[dict] = None
        self.interrupted = threading.Event()
        self.interrupt_message = ""
        self._reader = threading.Thread(target=self._read_loop, name="gearbit-hub", daemon=True)
        self._reader.start()

        params: Dict[str, Any] = {"name": name}
        if run_id:
            params["runId"] = run_id
        hello = self.call("hub.hello", params)
        self.client_id = hello.get("clientId")
        self.robot = hello.get("robot")
        if self.robot and self.robot.get("state") == "connected":
            try:
                self.telemetry = self.call("robot.telemetry")
            except GearbitError:
                pass

    @property
    def closed(self) -> bool:
        return self._closed.is_set()

    def on(self, method: str, listener: Callable[[Any], None]) -> None:
        self._listeners.setdefault(method, []).append(listener)

    def call(self, method: str, params: Optional[dict] = None, timeout: float = 5.0) -> Any:
        if self._closed.is_set():
            raise GearbitError("Связь с Gearbit потеряна.")
        done = threading.Event()
        slot: list = [done, None, None]
        with self._lock:
            request_id = self._next_id
            self._next_id += 1
            self._pending[request_id] = slot
        message = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}}
        try:
            self._ws.send_text(json.dumps(message, ensure_ascii=False))
        except WebSocketError:
            with self._lock:
                self._pending.pop(request_id, None)
            raise GearbitError("Связь с Gearbit потеряна.") from None
        if not done.wait(timeout):
            with self._lock:
                self._pending.pop(request_id, None)
            raise GearbitError(f"Gearbit не ответил на команду {method}.")
        _, result, error = slot
        if error is not None:
            raise GearbitError(error.get("message") or "Ошибка хаба", error.get("code"))
        return result

    def close(self) -> None:
        if not self._closed.is_set():
            self._ws.close()
            self._closed.set()

    def _read_loop(self) -> None:
        try:
            while True:
                text = self._ws.recv()
                if text is None:
                    break
                try:
                    message = json.loads(text)
                except ValueError:
                    continue
                if not isinstance(message, dict):
                    continue
                if "id" in message and message.get("id") is not None and "method" not in message:
                    with self._lock:
                        slot = self._pending.pop(message["id"], None)
                    if slot is not None:
                        slot[1] = message.get("result")
                        slot[2] = message.get("error")
                        slot[0].set()
                elif "method" in message:
                    self._notify(message["method"], message.get("params"))
        except WebSocketError:
            pass
        finally:
            self._closed.set()
            with self._lock:
                pending = list(self._pending.values())
                self._pending.clear()
            for slot in pending:
                slot[2] = {"message": "Связь с Gearbit потеряна."}
                slot[0].set()
            if not self.interrupted.is_set():
                self.interrupt_message = "Связь с Gearbit потеряна."
                self.interrupted.set()

    def _notify(self, method: str, params: Any) -> None:
        if method == "robot.telemetry":
            self.telemetry = params
        elif method == "robot.info":
            self.robot = params
            if params is None:
                self.telemetry = None
        elif method == "robot.state":
            if self.robot is not None and isinstance(params, dict):
                self.robot = dict(self.robot, state=params.get("state"))
        elif method == "safety.event":
            # СТОП, страж, потеря связи: программа прекращается (как блоки в интерфейсе).
            self.interrupt_message = (params or {}).get("message") or "Программу остановили."
            self.interrupted.set()
        for listener in self._listeners.get(method, []):
            try:
                listener(params)
            except Exception:  # noqa: BLE001 — слушатель не должен ронять поток-читатель
                pass
