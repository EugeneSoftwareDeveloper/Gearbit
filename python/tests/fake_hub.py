"""Поддельный хаб Gearbit для тестов: WebSocket-сервер на 127.0.0.1 со случайным портом."""

from __future__ import annotations

import base64
import hashlib
import json
import socket
import threading
from typing import Any, Callable, Dict, List, Optional

from gearbit._ws import OP_CLOSE, OP_PING, OP_TEXT, WebSocket, encode_frame

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

ROBOT = {
    "id": "emulator:superbot",
    "name": "Nordic_TUDAO (эмулятор)",
    "state": "connected",
    "components": [
        {"id": "M1", "kind": "motor", "aliases": ["left_wheel"]},
        {"id": "M2", "kind": "motor", "aliases": ["right_wheel"]},
        {"id": "D1", "kind": "distance", "aliases": ["front"]},
        {"id": "D2", "kind": "distance", "aliases": ["right"]},
        {"id": "L1", "kind": "light", "aliases": []},
        {"id": "L2", "kind": "light", "aliases": []},
    ],
}


class FakeHub:
    def __init__(self, robot: Optional[dict] = ROBOT) -> None:
        self.robot = robot
        self.telemetry: Dict[str, Any] = {"distances": {"D1": 6, "D2": 3}, "distancesCm": {}, "tilt": None, "battery": 80}
        self.calls: List[tuple] = []
        self.errors: Dict[str, dict] = {}
        self.handlers: Dict[str, Callable[[dict], Any]] = {}
        self._server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._server.bind(("127.0.0.1", 0))
        self._server.listen(1)
        self.port = self._server.getsockname()[1]
        self.url = f"ws://127.0.0.1:{self.port}/ws"
        self.client: Optional[socket.socket] = None
        self._send_lock = threading.Lock()
        self.connected = threading.Event()
        self.closed = threading.Event()
        threading.Thread(target=self._serve, daemon=True).start()

    def methods(self) -> List[str]:
        return [m for m, _ in self.calls]

    def notify(self, method: str, params: Any) -> None:
        self._send(json.dumps({"jsonrpc": "2.0", "method": method, "params": params}))

    def ping(self) -> None:
        with self._send_lock:
            assert self.client is not None
            self.client.sendall(encode_frame(OP_PING, b"hi", mask=False))

    def close(self) -> None:
        try:
            if self.client:
                self.client.close()
        finally:
            self._server.close()

    def _send(self, text: str) -> None:
        with self._send_lock:
            assert self.client is not None
            self.client.sendall(encode_frame(OP_TEXT, text.encode("utf-8"), mask=False))

    def _serve(self) -> None:
        try:
            conn, _ = self._server.accept()
        except OSError:
            return  # тест закончился, так и не подключившись
        self.client = conn
        request = b""
        while b"\r\n\r\n" not in request:
            request += conn.recv(4096)
        key = next(
            line.split(":", 1)[1].strip()
            for line in request.decode("latin-1").split("\r\n")
            if line.lower().startswith("sec-websocket-key:")
        )
        accept = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
        conn.sendall(
            (
                "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
            ).encode()
        )
        self.connected.set()
        reader = WebSocket(conn)  # тот же разбор кадров; клиентские кадры маскированы — reader это умеет
        while True:
            text = reader.recv()
            if text is None:
                break
            message = json.loads(text)
            method, params = message["method"], message.get("params") or {}
            self.calls.append((method, params))
            if "id" not in message:
                continue
            if method in self.errors:
                reply = {"jsonrpc": "2.0", "id": message["id"], "error": self.errors[method]}
            else:
                reply = {"jsonrpc": "2.0", "id": message["id"], "result": self._result(method, params)}
            self._send(json.dumps(reply, ensure_ascii=False))
        self.closed.set()

    def _result(self, method: str, params: dict) -> Any:
        if method in self.handlers:
            return self.handlers[method](params)
        if method == "hub.hello":
            return {"hub": "Gearbit", "clientId": "c1", "robot": self.robot, "control": {}}
        if method == "robot.telemetry":
            return self.telemetry
        return True
