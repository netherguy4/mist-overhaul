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
#
# В скрипт идут только пути: хостов несколько (см. HOSTS в юзерскрипте), и он
# перебирает их сам, потому что из РФ доступны не все.

# Игровая рамка портрета — 181x267 CSS-пикселей. Отдаём три размера и выбираем
# по devicePixelRatio: на обычном экране 3x пришлось бы ужимать втрое, и фильтр
# браузера превращал мелкие детали в кашу. Каждый клиент качает только свой.
TIERS = {"2x": 534, "3x": 800}
FPS = 24
MIN_LOOP = 72        # кадров, минимум 3 с — короче петля читается как дёрганье
BRIDGE = 3           # синтезированных кадров, которыми закрывается стык петли
BAR = 10             # яркость, ниже которой строка кадра считается чёрным полем

def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, **kw)


def raw(args, w, h, ch, input=None):
    """Прогнать ffmpeg и вернуть кадры как (N, h, w, ch) uint8."""
    out = run(["ffmpeg", "-v", "error", *args, "-f", "rawvideo", "-"], input=input).stdout
    return np.frombuffer(out, np.uint8).reshape(-1, h, w, ch)


def dims(path: Path):
    probe = run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                 "-show_entries", "stream=width,height", "-of", "csv=p=0", str(path)])
    return (int(x) for x in probe.stdout.decode().strip().split(","))


def content_box(video: Path, vw: int, vh: int):
    """Границы картинки внутри кадра: генератор кладёт её в 9:16 с чёрными полями."""
    g = raw(["-i", str(video), "-vf", "format=gray", "-frames:v", "1", "-pix_fmt", "gray"],
            vw, vh, 1)[0, :, :, 0].astype(np.float32)
    # по самому яркому пикселю строки, а не по среднему: у тёмного портрета
    # средняя яркость первых строк ниже порога, и срезалась бы сама картинка
    rows, cols = g.max(1), g.max(0)
    top = int(np.argmax(rows > BAR)); bot = vh - int(np.argmax(rows[::-1] > BAR))
    left = int(np.argmax(cols > BAR)); right = vw - int(np.argmax(cols[::-1] > BAR))
    # поля меньше процента считаем шумом, а не полями
    if top + (vh - bot) < vh * 0.01: top, bot = 0, vh
    if left + (vw - right) < vw * 0.01: left, right = 0, vw
    return left, top, right - left, bot - top


def built(name: str, tier: str = "3x"):
    """Готовый файл персонажа в нужном размере, если он уже собран."""
    return next((EXT_NPC / tier).glob(f"{name}.*.web[mp]"), None)


def fresh(name: str, src: Path):
    """Готовый webp новее исходника — пересобирать нечего (прогон видео ~2 мин)."""
    webp = built(name)
    return webp is not None and webp.stat().st_mtime > src.stat().st_mtime


def finalize(name: str, tmp: Path, ext: str, tier: str):
    """Переименовать в <имя>.<хеш содержимого>.<ext>, старые версии убрать."""
    digest = hashlib.sha256(tmp.read_bytes()).hexdigest()[:8]
    final = EXT_NPC / tier / f"{name}.{digest}.{ext}"
    for old in (EXT_NPC / tier).glob(f"{name}.*.web[mp]"):
        if old != final and old != tmp:
            old.unlink()
    tmp.replace(final)
    return final


def bridge(frames, i: int, j: int, w: int, h: int):
    """Кадры перехода из конца петли в начало, синтезированные по движению.

    Не кроссфейд: ffmpeg строит промежуточные кадры оптическим потоком, поэтому
    двоения нет — картинка честно доезжает из одной позы в другую.
    """
    ctx = np.concatenate([frames[j - 4:j], frames[i:i + 4]]).astype(np.uint8)
    out = run(["ffmpeg", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
               "-s", f"{w}x{h}", "-r", str(FPS), "-i", "-",
               "-vf", f"minterpolate=fps={FPS * (BRIDGE + 1)}:mi_mode=mci:"
                      "mc_mode=aobmc:me_mode=bidir:vsbmc=1",
               "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], input=ctx.tobytes()).stdout
    g = np.frombuffer(out, np.uint8).reshape(-1, h, w, 3)
    start = 3 * (BRIDGE + 1) + 1
    return g[start:start + BRIDGE]


def build(video: Path, still: Path, original: Path, name: str):
    # апскейл тоже исходник: если видео не зациклилось, персонаж собирается из него
    if fresh(name, video) and fresh(name, still):
        print(f"== {name}: уже собран")
        return name
    print(f"\n== {name}")
    ow, oh = dims(original)
    vw, vh = dims(video)
    # петля считается в самом крупном размере, остальные ужимаются из неё
    OUT_H = TIERS["3x"]
    out_w = round(OUT_H * ow / oh) // 2 * 2

    cx, cy, cw, ch = content_box(video, vw, vh)
    crop = f"crop={cw}:{ch}:{cx}:{cy}," if (cw, ch) != (vw, vh) else ""
    if crop:
        print(f"   чёрные поля срезаны: {vw}x{vh} -> {cw}x{ch}")
    vw, vh = cw, ch

    # Кроп 9:16 не анимируем вовсе. Добрать недостающие бока нечем: куски
    # статичного апскейла дают заметный стык, растяжка краёв — смаз, обрезка по
    # вертикали срезает голову. Годится только видео, уже снятое в пропорциях
    # игры; остальные ждут перегенерации и пока показываются статикой.
    if abs(vw / vh - ow / oh) >= 0.02:
        print(f"   кроп {vw}x{vh} вместо пропорций игры -> статика, нужна перегенерация")
        return None
    vid_w = out_w

    frames = raw(["-i", str(video), "-vf", f"{crop}scale={vid_w}:{OUT_H}", "-pix_fmt", "rgb24"],
                 vid_w, OUT_H, 3)

    # Ищем кусок, который смыкается сам: последний кадр должен стыковаться с
    # первым не хуже, чем соседние кадры между собой. Ни кроссфейда, ни
    # разворота — и то и другое даёт видимый артефакт: кроссфейд усредняет
    # движение и анимация подвисает, разворот пускает движение задом наперёд.
    # Не нашлось — персонаж остаётся статикой, это честнее рывка.
    # именно усреднением, а не прореживанием: каждый восьмой пиксель на
    # искрящейся картинке даёт шум, который завышает порог и пропускает рывок
    small = raw(["-i", str(video), "-vf", f"{crop}scale=64:94,format=gray", "-pix_fmt", "gray"],
                64, 94, 1).reshape(len(frames), -1).astype(np.float32)
    steps = np.abs(np.diff(small, axis=0)).mean(1)
    thr = float(np.percentile(steps, 95))
    d = np.abs(small[:, None, :] - small[None, :, :]).mean(2)

    n = len(small)
    pairs = [(d[i, j], i, j) for i in range(4, n - MIN_LOOP)
             for j in range(i + MIN_LOOP, n - 3)]
    _, i, j = min(pairs)
    loop = frames[i:j]

    # Стык закрываем синтезированными кадрами, если он выпирает. Кроссфейд тут
    # не годится — он усредняет движение и анимация подвисает; разворот пускает
    # движение задом наперёд. Оптический поток честно доводит позу до начальной.
    if d[i, j] > thr:
        loop = np.concatenate([loop, bridge(frames, i, j, vid_w, OUT_H)])
        sm = raw(["-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{vid_w}x{OUT_H}",
                  "-i", "-", "-vf", "scale=64:94,format=gray", "-pix_fmt", "gray"],
                 64, 94, 1, input=np.concatenate([loop, loop[:1]]).astype(np.uint8).tobytes())
        sm = sm.reshape(-1, 64 * 94).astype(np.float32)
        worst = float(np.abs(np.diff(sm, axis=0)).mean(1)[-BRIDGE - 1:].max())
        if worst > thr:
            print(f"   стык {d[i, j]:.2f} не закрывается даже синтезом "
                  f"({worst:.2f} при пороге {thr:.2f}) -> статика")
            return None
        print(f"   кусок {i}..{j}, стык {d[i, j]:.2f} закрыт {BRIDGE} синтезированными "
              f"кадрами (осталось {worst:.2f} при пороге {thr:.2f})")
    else:
        print(f"   смыкающийся кусок {i}..{j}, стык {d[i, j]:.2f} при пороге {thr:.2f}")

    L = len(loop)
    print(f"   петля {L} кадров ({L / FPS:.2f} c)")

    data = loop.astype(np.uint8).tobytes()
    sizes = []
    for tier, h in TIERS.items():
        w = round(h * ow / oh) // 2 * 2
        (EXT_NPC / tier).mkdir(parents=True, exist_ok=True)
        out = EXT_NPC / tier / f"{name}.tmp"
        # VP9, а не animated webp: тот жмёт покадровой разницей, без компенсации
        # движения, и на том же качестве весит в 2.5 раза больше (10.2 против
        # 4.0 МБ у Амалии при равном PSNR). Плюс декодируется аппаратно.
        run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
             "-s", f"{out_w}x{OUT_H}", "-r", str(FPS), "-i", "-",
             "-vf", f"scale={w}:{h}", "-sws_flags", "lanczos",
             "-c:v", "libvpx-vp9", "-crf", "24", "-b:v", "0", "-row-mt", "1",
             "-pix_fmt", "yuv420p", "-an", "-f", "webm", str(out)], input=data)
        out = finalize(name, out, "webm", tier)
        sizes.append(f"{tier} {w}x{h} {out.stat().st_size / 1e6:.2f}M")
    print(f"   {', '.join(sizes)}")
    return name


def build_still(still: Path, original: Path, name: str):
    """Заглушка для персонажа без видео: тот же апскейл, но в пропорциях игры."""
    if fresh(name, still):
        print(f"== {name}: уже собран")
        return name
    ow, oh = dims(original)
    # апскейл может лежать в 9:16 с чёрными полями — тем же кадром, что уходит
    # генератору видео. Поля срезаем, иначе портрет выйдет сплющенным.
    sw, sh = dims(still)
    cx, cy, cw, ch = content_box(still, sw, sh)
    crop = f"crop={cw}:{ch}:{cx}:{cy}," if (cw, ch) != (sw, sh) else ""
    sizes = []
    for tier, h in TIERS.items():
        w = round(h * ow / oh) // 2 * 2
        (EXT_NPC / tier).mkdir(parents=True, exist_ok=True)
        webp = EXT_NPC / tier / f"{name}.tmp"
        # один кадр весит копейки, поэтому без потерь вовсе
        run(["ffmpeg", "-v", "error", "-y", "-i", str(still),
             "-vf", f"{crop}scale={w}:{h}", "-sws_flags", "lanczos",
             "-lossless", "1", "-f", "webp", str(webp)])
        webp = finalize(name, webp, "webp", tier)
        sizes.append(f"{tier} {webp.stat().st_size / 1e3:.0f}K")
    print(f"== {name}: статика {', '.join(sizes)}")
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
        done = build(videos[name], still, original, name) if name in videos else None
        names.append(done or build_still(still, original, name))

    rules = [{
        "id": i,
        "priority": 1,
        "action": {"type": "redirect",
                   "redirect": {"extensionPath": f"/npc/3x/{built(n).name}"}},
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

    def entry(n):
        by_tier = ", ".join(f'"{t}": "{t}/{built(n, t).name}"' for t in TIERS)
        return f"    {n}: {{{by_tier}}}"
    urls = ",\n".join(entry(n) for n in names)

    text = re.sub(r"^// @version.*$", f"// @version      {version}",
                  path.read_text(), count=1, flags=re.M)
    text = re.sub(r"^(  // --- ссылки на портреты.*?---\n).*?(?=^  // --- конец блока)",
                  lambda m: f"{m.group(1)}  const URLS = {{\n{urls},\n  }};\n",
                  text, count=1, flags=re.M | re.S)
    path.write_text(text)
    print(f"юзерскрипт: версия {version}, {len(names)} ссылок")


if __name__ == "__main__":
    main()
