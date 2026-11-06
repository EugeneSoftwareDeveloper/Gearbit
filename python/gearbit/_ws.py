"""Минимальный клиент WebSocket (RFC 6455) на стандартной библиотеке.

Хабу Gearbit нужен только текст: JSON-RPC по одному объекту в кадре. Поэтому здесь нет
сжатия, расширений и TLS (хаб слушает только localhost). Зато пакет работает в любом
Python 3.9+ без pip.
"""

from __future__ import annotations

import base64
import hashlib
import os
import socket
import struct
import threading
from typing import Optional
from urllib.parse import urlsplit

_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

OP_CONT = 0x0
OP_TEXT = 0x1
OP_BINARY = 0x2
OP_CLOSE = 0x8
OP_PING = 0x9
OP_PONG = 0xA

MAX_MESSAGE = 4 * 1024 * 1024


class WebSocketError(Exception):
    """Ошибка соединения или протокола WebSocket."""


def _mask(data: bytes, key: bytes) -> bytes:
    """XOR с 4-байтовым ключом: так клиент обязан «маскировать» свои кадры."""
    if not data:
        return data
    repeated = (key * (len(data) // 4 + 1))[: len(data)]
    return (int.from_bytes(data, "big") ^ int.from_bytes(repeated, "big")).to_bytes(len(data), "big")


def encode_frame(opcode: int, payload: bytes, mask: bool = True, fin: bool = True) -> bytes:
    """Собрать кадр. Клиент всегда маскирует (mask=True), сервер — никогда."""
    head = bytearray([(0x80 if fin else 0) | opcode])
    length = len(payload)
    bit = 0x80 if mask else 0
    if length < 126:
        head.append(bit | length)
    elif length < 1 << 16:
        head.append(bit | 126)
        head += struct.pack("!H", length)
    else:
        head.append(bit | 127)
        head += struct.pack("!Q", length)
    if mask:
        key = os.urandom(4)
        return bytes(head) + key + _mask(payload, key)
    return bytes(head) + payload


class WebSocket:
    """Соединение: send_text() из любого потока, recv() — из одного потока-читателя."""

    def __init__(self, sock: socket.socket) -> None:
        self._sock = sock
        self._send_lock = threading.Lock()
        self._closed = False

    @classmethod
    def connect(cls, url: str, timeout: float = 5.0, headers: Optional[dict] = None) -> "WebSocket":
        parts = urlsplit(url)
        if parts.scheme != "ws":
            raise WebSocketError(f"Поддерживается только адрес ws://, а не {url}")
        host = parts.hostname or "localhost"
        port = parts.port or 80
        path = parts.path or "/"
        if parts.query:
            path += "?" + parts.query

        try:
            sock = socket.create_connection((host, port), timeout=timeout)
        except OSError as e:
            raise WebSocketError(f"Не удалось подключиться к {host}:{port}: {e}") from e

        key = base64.b64encode(os.urandom(16)).decode("ascii")
        lines = [
            f"GET {path} HTTP/1.1",
            f"Host: {host}:{port}",
            "Upgrade: websocket",
            "Connection: Upgrade",
            f"Sec-WebSocket-Key: {key}",
            "Sec-WebSocket-Version: 13",
            "User-Agent: gearbit-python",
        ]
        lines += [f"{k}: {v}" for k, v in (headers or {}).items()]
        try:
            sock.sendall(("\r\n".join(lines) + "\r\n\r\n").encode("ascii"))
            response = b""
            while b"\r\n\r\n" not in response:
                chunk = sock.recv(4096)
                if not chunk:
                    raise WebSocketError("Сервер закрыл соединение во время рукопожатия")
                response += chunk
                if len(response) > 16384:
                    raise WebSocketError("Слишком длинный ответ сервера")
        except OSError as e:
            sock.close()
            raise WebSocketError(f"Ошибка рукопожатия WebSocket: {e}") from e

        head, _, rest = response.partition(b"\r\n\r\n")
        status, *header_lines = head.decode("latin-1").split("\r\n")
        if " 101 " not in status + " ":
            sock.close()
            raise WebSocketError(f"Сервер не открыл WebSocket: {status}")
        received = {}
        for line in header_lines:
            name, _, value = line.partition(":")
            received[name.strip().lower()] = value.strip()
        expected = base64.b64encode(hashlib.sha1((key + _GUID).encode("ascii")).digest()).decode("ascii")
        if received.get("sec-websocket-accept") != expected:
            sock.close()
            raise WebSocketError("Сервер ответил неверным ключом WebSocket")

        sock.settimeout(None)
        ws = cls(sock)
        ws._pending = rest  # байты, пришедшие сразу за заголовками
        return ws

    _pending = b""

    def _recv_exact(self, n: int) -> bytes:
        data = self._pending[:n]
        self._pending = self._pending[n:]
        while len(data) < n:
            chunk = self._sock.recv(max(n - len(data), 4096))
            if not chunk:
                raise WebSocketError("Соединение закрыто")
            data += chunk
        if len(data) > n:
            self._pending = data[n:] + self._pending
            data = data[:n]
        return data

    def _read_frame(self) -> "tuple[bool, int, bytes]":
        b1, b2 = self._recv_exact(2)
        fin = bool(b1 & 0x80)
        opcode = b1 & 0x0F
        masked = bool(b2 & 0x80)
        length = b2 & 0x7F
        if length == 126:
            (length,) = struct.unpack("!H", self._recv_exact(2))
        elif length == 127:
            (length,) = struct.unpack("!Q", self._recv_exact(8))
        if length > MAX_MESSAGE:
            raise WebSocketError("Слишком большое сообщение")
        key = self._recv_exact(4) if masked else b""
        payload = self._recv_exact(length) if length else b""
        if masked:
            payload = _mask(payload, key)
        return fin, opcode, payload

    def _send_frame(self, opcode: int, payload: bytes) -> None:
        frame = encode_frame(opcode, payload)
        with self._send_lock:
            if self._closed:
                raise WebSocketError("Соединение закрыто")
            try:
                self._sock.sendall(frame)
            except OSError as e:
                raise WebSocketError(f"Не удалось отправить: {e}") from e

    def send_text(self, text: str) -> None:
        self._send_frame(OP_TEXT, text.encode("utf-8"))

    def recv(self) -> Optional[str]:
        """Следующее текстовое сообщение или None, если соединение закрыли."""
        parts: list = []
        size = 0
        while True:
            try:
                fin, opcode, payload = self._read_frame()
            except (OSError, WebSocketError):
                self._closed = True
                return None
            if opcode == OP_PING:
                try:
                    self._send_frame(OP_PONG, payload)
                except WebSocketError:
                    return None
                continue
            if opcode == OP_PONG:
                continue
            if opcode == OP_CLOSE:
                try:
                    self._send_frame(OP_CLOSE, payload[:2])
                except WebSocketError:
                    pass
                self._closed = True
                return None
            if opcode in (OP_TEXT, OP_BINARY, OP_CONT):
                parts.append(payload)
                size += len(payload)
                if size > MAX_MESSAGE:
                    raise WebSocketError("Слишком большое сообщение")
                if fin:
                    return b"".join(parts).decode("utf-8", errors="replace")

    def close(self) -> None:
        try:
            self._send_frame(OP_CLOSE, struct.pack("!H", 1000))
        except WebSocketError:
            pass
        with self._send_lock:
            self._closed = True
        try:
            self._sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        self._sock.close()
