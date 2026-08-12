#!/usr/bin/env python3
"""Видео NPC -> бесшовно зациклённая анимация (webp + gif) + rules.json расширения.

Видео сгенерированы как центральный кроп 9:16 из Upscaled/<name>.png, поэтому
кадры вкладываются обратно в апскейл (мягкая растушёвка по бокам) — итоговая
картинка совпадает по кадрированию и пропорциям с оригиналом из игры.
"""
import json
import re
import shutil
import subprocess
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).parent
SRC = ROOT / "Mist characters"
WORK = ROOT / "work"
EXT_NPC = ROOT / "extension" / "npc"
GIF = ROOT / "gif"

# Откуда Tampermonkey заберёт портреты при установке и обновлении скрипта.
# Дальше они живут у него локально, в игру за ними никто не ходит.
HOST = "https://cdn.jsdelivr.net/gh/netherguy4/mist-overhaul@main/extension/npc"

OUT_H = 534          # 2x от игровых 181x267
FPS = 24
MIN_LOOP = 96        # >= 4 c
XFADE = 10           # кадров растушёвки шва
FEATHER = 18         # px растушёвки боковых стыков с апскейлом

# имена файлов у генератора видео потерялись
ALIASES = {
    "Animate_image_into_idle_loop_202608120009": "bride_amalia_milton_8thmarch",
    "Animate_source_image_idle_loop_202608120008": "ifrit",
}


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, **kw)


def raw(args, w, h, ch):
    """Прогнать ffmpeg и вернуть кадры как (N, h, w, ch) uint8."""
    out = run(["ffmpeg", "-v", "error", *args, "-f", "rawvideo", "-"]).stdout
    return np.frombuffer(out, np.uint8).reshape(-1, h, w, ch)


def find_loop(gray):
    """(start, length) с минимальным разрывом на стыке при максимальной длине."""
    f = gray.reshape(len(gray), -1).astype(np.float32)
    d = np.abs(f[:, None, :] - f[None, :, :]).mean(2)   # N x N

    best = None
    n = len(f)
    for s in range(0, n - MIN_LOOP - XFADE):
        for L in range(MIN_LOOP, n - XFADE - s):
            cost = d[s, s + L] + d[s + 1, s + L + 1]
            if best is None or cost < best[0]:
                best = (cost, s, L)
    # среди почти таких же швов берём самую длинную петлю
    cap = best[0] * 1.10
    longest = max(
        ((d[s, s + L] + d[s + 1, s + L + 1], s, L)
         for s in range(0, n - MIN_LOOP - XFADE)
         for L in range(MIN_LOOP, n - XFADE - s)
         if d[s, s + L] + d[s + 1, s + L + 1] <= cap),
        key=lambda c: (c[2], -c[0]),
    )
    return longest, best[0]


def crossfade(frames, s, L):
    """Кадры петли: хвост перетекает в начало, шов пропадает."""
    out = frames[s:s + L].astype(np.float32).copy()
    a = (np.arange(XFADE, dtype=np.float32) / XFADE)[:, None, None, None]
    out[:XFADE] = (1 - a) * frames[s + L:s + L + XFADE] + a * out[:XFADE]
    return np.clip(out, 0, 255).astype(np.uint8)


def dims(path: Path):
    probe = run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                 "-show_entries", "stream=width,height", "-of", "csv=p=0", str(path)])
    return (int(x) for x in probe.stdout.decode().strip().split(","))


def fresh(name: str, src: Path):
    """Готовый webp новее исходника — пересобирать нечего (прогон видео ~2 мин)."""
    webp = EXT_NPC / f"{name}.webp"
    return webp.exists() and webp.stat().st_mtime > src.stat().st_mtime


def build(video: Path, still: Path, name: str):
    if fresh(name, video):
        print(f"== {name}: уже собран")
        return name
    print(f"\n== {name}")
    sw, sh = dims(still)

    out_w = round(sw * OUT_H / sh) // 2 * 2
    vid_w = round(sh * 720 / 1280 * OUT_H / sh) // 2 * 2   # ширина кропа 9:16 в выходном масштабе
    x0 = (out_w - vid_w) // 2

    gray = raw(["-i", str(video), "-vf", "scale=64:114,format=gray", "-pix_fmt", "gray"],
               64, 114, 1)
    (cost, s, L), best = find_loop(gray)
    print(f"   петля: кадры {s}..{s + L} ({L} кадров, {L / FPS:.2f} c), "
          f"шов {cost:.2f} (лучший возможный {best:.2f})")

    frames = raw(["-i", str(video), "-vf", f"scale={vid_w}:{OUT_H}", "-pix_fmt", "rgb24"],
                 vid_w, OUT_H, 3)
    loop = crossfade(frames, s, L)

    base = raw(["-i", str(still), "-vf", f"scale={out_w}:{OUT_H}", "-pix_fmt", "rgb24"],
               out_w, OUT_H, 3)[0]

    # растушёвка стыка видео с апскейлом по боковым краям
    alpha = np.ones(vid_w, np.float32)
    ramp = np.linspace(0, 1, FEATHER, endpoint=False, dtype=np.float32)
    alpha[:FEATHER], alpha[-FEATHER:] = ramp, ramp[::-1]
    alpha = alpha[None, None, :, None]

    canvas = np.repeat(base[None], L, 0).astype(np.float32)
    region = canvas[:, :, x0:x0 + vid_w]
    canvas[:, :, x0:x0 + vid_w] = alpha * loop + (1 - alpha) * region
    canvas = np.clip(canvas, 0, 255).astype(np.uint8)

    WORK.mkdir(exist_ok=True)
    mkv = WORK / f"{name}.mkv"
    run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{out_w}x{OUT_H}", "-r", str(FPS), "-i", "-",
         "-c:v", "ffv1", str(mkv)], input=canvas.tobytes())

    EXT_NPC.mkdir(parents=True, exist_ok=True)
    webp = EXT_NPC / f"{name}.webp"
    # картинки лежат у игрока локально, экономить нечего: 95 — колено кривой
    # качества (40.4 dB против 36.0 на 82), выше растёт только вес
    run(["ffmpeg", "-v", "error", "-y", "-i", str(mkv), "-loop", "0",
         "-c:v", "libwebp_anim", "-pix_fmt", "yuv420p", "-preset", "picture",
         "-q:v", "95", "-compression_level", "6", str(webp)])

    GIF.mkdir(exist_ok=True)
    gif = GIF / f"{name}.gif"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(mkv), "-filter_complex",
         "[0:v]split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];"
         "[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle",
         "-loop", "0", str(gif)])

    print(f"   {out_w}x{OUT_H}  webp {webp.stat().st_size / 1e6:.2f} MB   "
          f"gif {gif.stat().st_size / 1e6:.2f} MB")
    return name


def build_still(still: Path, original: Path, name: str):
    """Заглушка для персонажа без видео: тот же апскейл, но в пропорциях игры."""
    if fresh(name, still):
        print(f"== {name}: уже собран")
        return name
    ow, oh = dims(original)
    out_w = round(OUT_H * ow / oh) // 2 * 2
    webp = EXT_NPC / f"{name}.webp"
    EXT_NPC.mkdir(parents=True, exist_ok=True)
    # один кадр весит копейки, поэтому без потерь вовсе
    run(["ffmpeg", "-v", "error", "-y", "-i", str(still),
         "-vf", f"scale={out_w}:{OUT_H}", "-lossless", "1", str(webp)])
    print(f"== {name}: статика {out_w}x{OUT_H}, {webp.stat().st_size / 1e3:.0f} KB")
    return name


def main():
    videos = {ALIASES.get(v.stem, v.stem): v for v in (SRC / "Video").glob("*.mp4")}
    names = []
    for original in sorted((SRC / "Original").glob("*.jpg")):
        name = original.stem
        still = next((SRC / "Upscaled").glob(f"{name}.*"), None)
        if still is None:
            print(f"!! нет апскейла для {name}, пропуск")
            continue
        names.append(build(videos[name], still, name) if name in videos
                     else build_still(still, original, name))

    rules = [{
        "id": i,
        "priority": 1,
        "action": {"type": "redirect",
                   "redirect": {"extensionPath": f"/npc/{n}.webp"}},
        "condition": {"urlFilter": f"||i.mist-game.ru/npc/{n}.jpg",
                      "resourceTypes": ["image"]},
    } for i, n in enumerate(sorted(names), 1)]
    (ROOT / "extension" / "rules.json").write_text(
        json.dumps(rules, indent=2, ensure_ascii=False) + "\n")
    write_userscript(sorted(names))
    print(f"\nrules.json + юзерскрипт: {len(rules)} персонажей")
    shutil.rmtree(WORK, ignore_errors=True)


def write_userscript(names):
    """Проставить в юзерскрипте список @resource и версию.

    Tampermonkey перекачивает картинки только при смене версии скрипта, поэтому
    версия — время самого свежего портрета: монотонно растёт и сразу видно,
    насколько свежая установка.
    """
    path = ROOT / "mist-overhaul.user.js"
    newest = max((EXT_NPC / f"{n}.webp").stat().st_mtime for n in names)
    version = time.strftime("%Y.%m.%d.%H%M", time.localtime(newest))

    block = "\n".join(f"// @resource     {n} {HOST}/{n}.webp" for n in names)
    text = re.sub(r"^// @version.*$", f"// @version      {version}",
                  path.read_text(), count=1, flags=re.M)
    text = re.sub(r"^// --- портреты.*?(?=^// ==/UserScript==)",
                  f"// --- портреты, дальше до конца блока правит build.py, "
                  f"руками не трогать ---\n{block}\n",
                  text, count=1, flags=re.M | re.S)
    path.write_text(text)
    print(f"юзерскрипт: версия {version}, {len(names)} @resource")


if __name__ == "__main__":
    main()
