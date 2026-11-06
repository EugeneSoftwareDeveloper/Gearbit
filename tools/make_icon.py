"""Рисует иконку Gearbit (шестерёнка с лицом робота) в .ico и .png.

Тот же рисунок, что web/studio-ui/public/favicon.svg. Нужен Pillow:
    python -m pip install pillow
    python tools/make_icon.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BIG = 1024  # рисуем крупно и уменьшаем — так края гладкие
SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))  # type: ignore[return-value]


def draw(size: int = BIG) -> Image.Image:
    k = size / 32  # координаты как в favicon.svg (32×32)
    # Фон: скруглённый квадрат с диагональным градиентом.
    gradient = Image.new("RGB", (size, size))
    start, end = (0x2F, 0x7C, 0xF6), (0x7C, 0x5C, 0xF6)
    px = gradient.load()
    for y in range(size):
        for x in range(size):
            px[x, y] = lerp(start, end, (x + y) / (2 * size))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=9 * k, fill=255)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img.paste(gradient, (0, 0), mask)

    d = ImageDraw.Draw(img)
    white = (255, 255, 255, 255)
    cx = cy = 16 * k

    # Обод шестерёнки.
    r, w = 6.5 * k, 2 * k
    d.ellipse((cx - r - w / 2, cy - r - w / 2, cx + r + w / 2, cy + r + w / 2), outline=white, width=round(w))

    # Восемь зубцов.
    half = 1.6 * k
    for i in range(8):
        a = math.radians(i * 45)
        ux, uy = math.cos(a), math.sin(a)
        vx, vy = -uy, ux
        r1, r2 = 6.5 * k, 9.6 * k
        pts = [
            (cx + ux * r1 + vx * half, cy + uy * r1 + vy * half),
            (cx + ux * r2 + vx * half, cy + uy * r2 + vy * half),
            (cx + ux * r2 - vx * half, cy + uy * r2 - vy * half),
            (cx + ux * r1 - vx * half, cy + uy * r1 - vy * half),
        ]
        d.polygon(pts, fill=white)

    # Глаза и улыбка.
    for ex in (13.7, 18.3):
        er = 1.2 * k
        d.ellipse((ex * k - er, 15.2 * k - er, ex * k + er, 15.2 * k + er), fill=white)
    # Дуга по квадратичной кривой, как в SVG: M14.2 18 q1.8 1.7 3.6 0.
    p0, p1, p2 = (14.2, 18.0), (16.0, 19.7), (17.8, 18.0)
    # Толстая линия — это «штампы» кругов вдоль кривой: края и концы получаются гладкими.
    for i in range(301):
        t = i / 300
        x = ((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t**2 * p2[0]) * k
        y = ((1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t**2 * p2[1]) * k
        d.ellipse((x - k, y - k, x + k, y + k), fill=white)
    return img


def main() -> int:
    big = draw()
    ico = ROOT / "src" / "Gearbit.App" / "Assets" / "gearbit.ico"
    png = ROOT / "docs" / "images" / "logo.png"
    ico.parent.mkdir(parents=True, exist_ok=True)
    png.parent.mkdir(parents=True, exist_ok=True)
    big.resize((256, 256), Image.Resampling.LANCZOS).save(ico, sizes=[(s, s) for s in SIZES])
    big.resize((256, 256), Image.Resampling.LANCZOS).save(png)
    print(f"{ico.relative_to(ROOT)}\n{png.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
