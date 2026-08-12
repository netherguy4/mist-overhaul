#!/usr/bin/env python3
"""Видео NPC -> бесшовно зациклённая анимация VP9 + ссылки для юзерскрипта.

Генератор отдаёт 9:16 двумя способами. Если портрет целиком, а сверху и снизу
чёрные поля, они срезаются — получается кадрирование оригинала. Если это
центральный кроп, кадры вкладываются обратно в апскейл с растушёвкой по бокам;
такой вариант хуже: генератор перерисовывает детали, и середина заметно
расходится с нетронутыми краями.
"""
import hashlib
import json
import re
import subprocess
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).parent
SRC = ROOT / "Mist characters"
EXT_NPC = ROOT / "extension" / "npc"

REPO = "netherguy4/mist-overhaul"

# Откуда Tampermonkey заберёт портреты при установке и обновлении скрипта.
# Дальше они живут у него локально, в игру за ними никто не ходит.
#
# В имени файла лежит хеш его содержимого, поэтому адрес самоинвалидируется:
# поменялась картинка — поменялось имя, и мимо любого кеша приходит новая.
# Не поменялась — адрес прежний, и качать нечего. Ветка тут безопасна: под
# одним и тем же адресом никогда не окажется другое содержимое.
HOST = f"https://cdn.jsdelivr.net/gh/{REPO}@main/extension/npc"

OUT_H = 534          # 2x от игровых 181x267
FPS = 24
FEATHER = 18         # px растушёвки боковых стыков с апскейлом
BAR = 10             # яркость, ниже которой строка кадра считается чёрным полем

def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, **kw)


def raw(args, w, h, ch):
    """Прогнать ffmpeg и вернуть кадры как (N, h, w, ch) uint8."""
    out = run(["ffmpeg", "-v", "error", *args, "-f", "rawvideo", "-"]).stdout
    return np.frombuffer(out, np.uint8).reshape(-1, h, w, ch)


def dims(path: Path):
    probe = run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                 "-show_entries", "stream=width,height", "-of", "csv=p=0", str(path)])
    return (int(x) for x in probe.stdout.decode().strip().split(","))


def content_box(video: Path, vw: int, vh: int):
    """Границы картинки внутри кадра: генератор кладёт её в 9:16 с чёрными полями."""
    g = raw(["-i", str(video), "-vf", "format=gray", "-frames:v", "1", "-pix_fmt", "gray"],
            vw, vh, 1)[0, :, :, 0].astype(np.float32)
    rows, cols = g.mean(1), g.mean(0)
    top = int(np.argmax(rows > BAR)); bot = vh - int(np.argmax(rows[::-1] > BAR))
    left = int(np.argmax(cols > BAR)); right = vw - int(np.argmax(cols[::-1] > BAR))
    # поля меньше процента считаем шумом, а не полями
    if top + (vh - bot) < vh * 0.01: top, bot = 0, vh
    if left + (vw - right) < vw * 0.01: left, right = 0, vw
    return left, top, right - left, bot - top


def built(name: str):
    """Готовый файл персонажа: <имя>.<хеш>.webm|webp, если он уже собран."""
    return next(EXT_NPC.glob(f"{name}.*.web[mp]"), None)


def fresh(name: str, src: Path):
    """Готовый webp новее исходника — пересобирать нечего (прогон видео ~2 мин)."""
    webp = built(name)
    return webp is not None and webp.stat().st_mtime > src.stat().st_mtime


def finalize(name: str, tmp: Path, ext: str):
    """Переименовать в <имя>.<хеш содержимого>.<ext>, старые версии убрать."""
    digest = hashlib.sha256(tmp.read_bytes()).hexdigest()[:8]
    final = EXT_NPC / f"{name}.{digest}.{ext}"
    for old in EXT_NPC.glob(f"{name}.*.web[mp]"):
        if old != final and old != tmp:
            old.unlink()
    tmp.replace(final)
    return final


def build(video: Path, still: Path, original: Path, name: str):
    if fresh(name, video):
        print(f"== {name}: уже собран")
        return name
    print(f"\n== {name}")
    ow, oh = dims(original)
    vw, vh = dims(video)
    out_w = round(OUT_H * ow / oh) // 2 * 2

    cx, cy, cw, ch = content_box(video, vw, vh)
    crop = f"crop={cw}:{ch}:{cx}:{cy}," if (cw, ch) != (vw, vh) else ""
    if crop:
        print(f"   чёрные поля срезаны: {vw}x{vh} -> {cw}x{ch}")
    vw, vh = cw, ch

    # Видео, снятое сразу в пропорциях игры, вкладывать в апскейл не нужно:
    # именно склейка перерисованной генератором середины с нетронутыми краями
    # и даёт заметный стык. Старые видео — кроп 9:16, для них склейка остаётся.
    native = abs(vw / vh - ow / oh) < 0.02
    vid_w = out_w if native else round(0.5625 * OUT_H) // 2 * 2
    x0 = (out_w - vid_w) // 2

    frames = raw(["-i", str(video), "-vf", f"{crop}scale={vid_w}:{OUT_H}", "-pix_fmt", "rgb24"],
                 vid_w, OUT_H, 3)

    # Замкнулся ли клип сам: последний кадр должен стыковаться с первым не хуже,
    # чем соседние кадры между собой.
    small = frames[:, ::8, ::8].reshape(len(frames), -1).astype(np.float32)
    wrap = float(np.abs(small[0] - small[-1]).mean())
    med = float(np.median(np.abs(np.diff(small, axis=0)).mean(1)))

    if wrap <= 1.5 * med:
        loop = frames
        print(f"   клип замыкается сам (стык {wrap:.2f} при движении {med:.2f})")
    else:
        # Петля «туда и обратно»: стыка нет по построению. Кроссфейд между
        # похожими кадрами не годится — он усредняет движение, и анимация на
        # треть секунды подвисает, что читается как рывок. Разворот удваивает
        # длину, но весит почти столько же: VP9 жмёт зеркальную половину не
        # хуже прямой (2.15 МБ против 1.94).
        loop = np.concatenate([frames, frames[-2:0:-1]])   # без дублей на концах
        print(f"   клип не замыкается (стык {wrap:.2f} при движении {med:.2f}) "
              f"-> петля туда-обратно")
    L = len(loop)
    print(f"   петля {L} кадров ({L / FPS:.2f} c)")

    if native:
        canvas = loop
    else:
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
        print(f"   видео 9:16 -> вложено в апскейл, стык растушёван {FEATHER} px")

    EXT_NPC.mkdir(parents=True, exist_ok=True)
    out = EXT_NPC / f"{name}.tmp"
    # VP9, а не animated webp: тот жмёт покадровой разницей, без компенсации
    # движения, и на том же качестве весит в 2.5 раза больше (10.2 против 4.0 МБ
    # у Амалии при 44.4 против 44.4 dB). Плюс видео декодируется аппаратно.
    run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{out_w}x{OUT_H}", "-r", str(FPS), "-i", "-",
         "-c:v", "libvpx-vp9", "-crf", "24", "-b:v", "0", "-row-mt", "1",
         "-pix_fmt", "yuv420p", "-an", "-f", "webm", str(out)],
        input=canvas.tobytes())
    out = finalize(name, out, "webm")

    print(f"   {out_w}x{OUT_H}  webm {out.stat().st_size / 1e6:.2f} MB")
    return name


def build_still(still: Path, original: Path, name: str):
    """Заглушка для персонажа без видео: тот же апскейл, но в пропорциях игры."""
    if fresh(name, still):
        print(f"== {name}: уже собран")
        return name
    ow, oh = dims(original)
    out_w = round(OUT_H * ow / oh) // 2 * 2
    webp = EXT_NPC / f"{name}.tmp"
    EXT_NPC.mkdir(parents=True, exist_ok=True)
    # один кадр весит копейки, поэтому без потерь вовсе
    run(["ffmpeg", "-v", "error", "-y", "-i", str(still),
         "-vf", f"scale={out_w}:{OUT_H}", "-lossless", "1", "-f", "webp", str(webp)])
    webp = finalize(name, webp, "webp")
    print(f"== {name}: статика {out_w}x{OUT_H}, {webp.stat().st_size / 1e3:.0f} KB")
    return name


def main():
    # needs-regen/ намеренно мимо glob: там видео с артефактами генератора,
    # персонажи из него получают статичный апскейл, пока не будет чистого дубля
    videos = {v.stem: v for v in (SRC / "Video").glob("*.mp4")}
    names = []
    for original in sorted((SRC / "Original").glob("*.jpg")):
        name = original.stem
        still = next((SRC / "Upscaled").glob(f"{name}.*"), None)
        if still is None:
            print(f"!! нет апскейла для {name}, пропуск")
            continue
        names.append(build(videos[name], still, original, name) if name in videos
                     else build_still(still, original, name))

    rules = [{
        "id": i,
        "priority": 1,
        "action": {"type": "redirect",
                   "redirect": {"extensionPath": f"/npc/{built(n).name}"}},
        "condition": {"urlFilter": f"||i.mist-game.ru/npc/{n}.jpg",
                      "resourceTypes": ["image"]},
    } for i, n in enumerate(sorted(names), 1)]
    (ROOT / "extension" / "rules.json").write_text(
        json.dumps(rules, indent=2, ensure_ascii=False) + "\n")
    write_userscript(sorted(names))
    print(f"\nrules.json: {len(rules)} персонажей")


def write_userscript(names):
    """Проставить в юзерскрипте ссылки на портреты и версию.

    Версия — время сборки: растёт всегда, поэтому Tampermonkey замечает
    обновление даже когда поменялся только код. Картинки к версии скрипта не
    привязаны, у них своя инвалидация — хеш в имени файла.
    """
    path = ROOT / "mist-overhaul.user.js"
    version = time.strftime("%Y.%m.%d.%H%M")

    urls = ",\n".join(f'    {n}: "{HOST}/{built(n).name}"' for n in names)
    text = re.sub(r"^// @version.*$", f"// @version      {version}",
                  path.read_text(), count=1, flags=re.M)
    text = re.sub(r"^(  // --- ссылки на портреты.*?---\n).*?(?=^  // --- конец блока)",
                  lambda m: f"{m.group(1)}  const URLS = {{\n{urls},\n  }};\n",
                  text, count=1, flags=re.M | re.S)
    path.write_text(text)
    print(f"юзерскрипт: версия {version}, {len(names)} ссылок")


if __name__ == "__main__":
    main()
