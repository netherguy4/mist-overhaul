#!/usr/bin/env python3
"""Проверка петли: разрыв на стыке не должен выделяться среди обычных переходов."""
import subprocess
import sys
from pathlib import Path

import numpy as np

for f in sorted((Path(__file__).parent / "extension" / "npc").glob("*.webp")):
    # ffmpeg не умеет декодировать animated webp, magick умеет
    out = subprocess.run(
        ["magick", str(f), "-coalesce", "-colorspace", "Gray",
         "-resize", "64x94!", "-depth", "8", "gray:-"],
        check=True, capture_output=True).stdout
    v = np.frombuffer(out, np.uint8).reshape(-1, 94 * 64).astype(np.float32)
    if len(v) < 2:
        continue                      # статичная заглушка, петли нет
    steps = np.abs(np.diff(v, axis=0)).mean(1)
    seam = np.abs(v[0] - v[-1]).mean()
    ratio = seam / steps.mean()
    print(f"{f.stem:34} шов {seam:5.2f}  средний переход {steps.mean():5.2f}  "
          f"худший {steps.max():5.2f}  x{ratio:.2f}")
    # до кодирования шов выходит ниже среднего перехода; в готовом webp он слегка
    # завышен, потому что нулевой кадр — ключевой, а остальные разностные.
    # порог по абсолютной величине нужен для почти статичных анимаций,
    # где средний переход сам по себе меньше шума кодека
    assert seam <= max(1.0, 2 * steps.mean()), f"{f.stem}: стык видно, петля не сошлась"
print("ok: стык у всех петель не выделяется среди обычных переходов")
