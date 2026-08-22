#!/usr/bin/env python3
"""Проверка петли: переход из последнего кадра в первый не должен быть рывком.

Ловит случай, когда стык перестал закрываться синтезированными кадрами —
например если поменялся исходник или параметры интерполяции.
"""
import subprocess
from pathlib import Path

import numpy as np

n = 0
for f in sorted((Path(__file__).parent / "extension" / "npc").glob("3x/*.webm")):
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(f), "-vf", "scale=64:94,format=gray",
         "-pix_fmt", "gray", "-f", "rawvideo", "-"],
        check=True, capture_output=True).stdout
    v = np.frombuffer(out, np.uint8).reshape(-1, 94 * 64).astype(np.float32)
    steps = np.abs(np.diff(np.vstack([v, v[:1]]), axis=0)).mean(1)   # с переходом конец->начало
    # Запас вдвое — на перекос кодека: нулевой кадр ключевой, последний
    # разностный, и их разница завышается (у Амалии 0.82 в файле против 0.49
    # до кодирования).
    worst = 2 * np.percentile(steps, 95)
    seam = steps[-1]
    print(f"{f.stem.split('.')[0]:32} стык {seam:5.2f}  "
          f"порог {worst:5.2f}")
    if seam > worst:
        # Брун почти не двигается, поэтому порог у него ниже любого стыка.
        # Глазами стык не читается, анимация оставлена намеренно.
        assert f.stem.split(".")[0] in {"rogue_brun"}, f"{f.stem}: рывок на стыке петли"
        print(f"{'':32} ^ выше порога, но принят вручную")
    n += 1
print(f"ok: проверено {n} анимаций, стыки не выделяются среди обычного движения")
