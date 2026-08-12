#!/usr/bin/env python3
"""Проверка петли: на стыке и в точке разворота не должно быть рывка.

Петля «туда и обратно» разрыва не имеет по построению, но проверка ловит
случай, когда кадры перестали разворачиваться — например если в сборке
поменяли склейку и вернулся скачок.
"""
import subprocess
from pathlib import Path

import numpy as np

n = 0
for f in sorted((Path(__file__).parent / "extension" / "npc").glob("*.webm")):
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(f), "-vf", "scale=64:94,format=gray",
         "-pix_fmt", "gray", "-f", "rawvideo", "-"],
        check=True, capture_output=True).stdout
    v = np.frombuffer(out, np.uint8).reshape(-1, 94 * 64).astype(np.float32)
    steps = np.abs(np.diff(np.vstack([v, v[:1]]), axis=0)).mean(1)   # с переходом конец->начало
    med, seam, turn = np.median(steps), steps[-1], steps[len(v) // 2 - 1]
    print(f"{f.stem.split('.')[0]:32} стык {seam:5.2f}  разворот {turn:5.2f}  "
          f"медианное движение {med:5.2f}")
    assert seam <= 1.5 * med, f"{f.stem}: рывок на стыке петли"
    assert turn <= 1.5 * med, f"{f.stem}: рывок в точке разворота"
    n += 1
print(f"ok: проверено {n} анимаций, стыки не выделяются среди обычного движения")
