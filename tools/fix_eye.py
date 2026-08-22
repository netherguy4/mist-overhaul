"""Вклеить светящийся глаз из хорошего кадра в кадры, где генератор нарисовал зрачок.

Разовая правка Трауна (22.08.2026), кадры 94–125. Кадры сначала разложить:
  ffmpeg -i ролик.mp4 -vf crop=720:1064:0:108 /tmp/tr/f%03d.png
"""
import numpy as np, subprocess
from pathlib import Path

SRC = Path("/tmp/tr"); OUT = Path("/tmp/tr_fixed"); OUT.mkdir(exist_ok=True)
W, H = 720, 1064
N = 192
BAD = range(94, 126)
X, Y, EW, EH = 382, 232, 52, 30        # весь разрез правого (по зрителю) глаза
FEATHER = 2
CTX = 12                               # узкое кольцо век вокруг глаза: по нему ведём сдвиг
SHIFT = 10

def read(i):
    o = subprocess.run(["ffmpeg","-v","error","-i",str(SRC/f"f{i:03d}.png"),"-pix_fmt","rgb24","-f","rawvideo","-"],capture_output=True,check=True).stdout
    return np.frombuffer(o,np.uint8).reshape(H,W,3).astype(np.float32)

def write(i, a):
    subprocess.run(["ffmpeg","-v","error","-y","-f","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-i","-",str(OUT/f"f{i:03d}.png")],input=a.clip(0,255).astype(np.uint8).tobytes(),check=True)

frames = {i: read(i) for i in range(1, N + 1)}

GLOW = 140                             # ярче — свечение; кожа вокруг в опоре не нужна

def blur(m, r):
    k = 2*r + 1
    pd = np.pad(m.astype(np.float32), r, mode="edge")
    out = np.zeros(m.shape, np.float32)
    for dy in range(k):
        for dx in range(k):
            out += pd[dy:dy+m.shape[0], dx:dx+m.shape[1]]
    return out / (k*k)

def glow_mask(patch):
    """Маска самого свечения: эллипс тянул за собой кожу опорного кадра, и на
    его границе рвались морщины — у целевого кадра они стоят по-своему."""
    bright = patch.mean(2) > GLOW
    grown = blur(bright, 1) > 0                     # на пиксель шире — край пятна
    return np.clip(blur(grown, FEATHER) * 1.0, 0, 1)[..., None]

def ring(f, dx=0, dy=0):
    """Узкое кольцо век вокруг глаза — глаз внутри обнулён, бровь не захвачена."""
    c = f[Y-CTX+dy:Y+EH+CTX+dy, X-CTX+dx:X+EW+CTX+dx].mean(2).copy()
    c[CTX:CTX+EH, CTX:CTX+EW] = 0
    return c

def track(ref_ring, f):
    """Сдвиг кольца с точностью до долей px: парабола по SSD вокруг минимума."""
    r = SHIFT
    ssd = np.array([[((ring(f, dx, dy) - ref_ring)**2).mean()
                     for dx in range(-r, r+1)] for dy in range(-r, r+1)])
    iy, ix = np.unravel_index(ssd.argmin(), ssd.shape)
    def refine(v):     # вершина параболы по трём точкам вокруг минимума
        a, b, c = v
        den = a - 2*b + c
        return 0.0 if den <= 0 else 0.5 * (a - c) / den
    fx = refine(ssd[iy, max(ix-1,0):ix+2]) if 0 < ix < 2*r else 0.0
    fy = refine(ssd[max(iy-1,0):iy+2, ix]) if 0 < iy < 2*r else 0.0
    return np.array([ix - r + fx, iy - r + fy])

# Свечение должно ехать со своей глазницей: мимика несимметричная, и правый
# глаз относительно левого уходит до 5 px — привязка к левому давала двойное
# веко. Опорных кадра два — последний целый перед участком и первый после:
# вход и выход тогда без шва по построению, а между двумя заплатками в
# середине участка плавный кроссфейд. Одна опора из 126-го «влетала»: её
# свечение крупнее, чем в 93-м.
REFS = (BAD.start - 1, BAD.stop)
FADE = (BAD.start + 10, BAD.stop - 10)
print("опорные кадры", REFS, "кроссфейд", FADE)

def smooth3(v):
    pad = np.pad(v, ((1, 1), (0, 0)), mode="edge")
    return (pad[:-2] + pad[1:-1] + pad[2:]) / 3

shifts = {}
for r in REFS:
    rr = ring(frames[r])
    raw = np.array([track(rr, frames[i]) for i in BAD])
    shifts[r] = smooth3(raw)
    print(f"опора {r}: остаток замеров от сглаженного, px:", np.abs(raw - shifts[r]).max(axis=0).round(2))

def lanczos(tt, a=3):
    """Lanczos-3: билинейное на полпикселя сплющивало пик свечения на 20 %, бикубик — на 8."""
    tt = np.asarray(tt, np.float64)
    out = np.sinc(tt) * np.sinc(tt / a)
    return np.where(np.abs(tt) < a, out, 0)

def sample(img, x0, y0, w, h):
    """Фрагмент img размером w×h с дробного левого верхнего угла (Lanczos-3)."""
    ix, iy = int(np.floor(x0)), int(np.floor(y0))
    fx, fy = x0 - ix, y0 - iy
    T = 6
    a = img[iy-2:iy+h+4, ix-2:ix+w+4]
    kx = lanczos(np.arange(-2, 4) - fx); kx /= kx.sum()
    ky = lanczos(np.arange(-2, 4) - fy); ky /= ky.sum()
    out = np.zeros((h, w, 3), np.float32)
    for j in range(T):
        row = np.zeros((h, w, 3), np.float32)
        for k in range(T):
            row += kx[k] * a[j:j+h, k:k+w]
        out += ky[j] * row
    return out

def glow_c(patch):
    wt = np.clip(patch.mean(2) - GLOW, 0, None)
    yy, xx = np.mgrid[:EH, :EW]
    return np.array([(xx*wt).sum()/wt.sum(), (yy*wt).sum()/wt.sum()])

# центры свечения в опорах — при кроссфейде их сводим в одну точку, иначе
# два пятна, смещённых на пару px, в сумме дают пятно пошире (горб массы)
C = {r: glow_c(frames[r][Y:Y+EH, X:X+EW]) for r in REFS}

for i in range(1, N+1):
    f = frames[i].copy()
    if i in BAD:
        w = np.clip((i - FADE[0]) / (FADE[1] - FADE[0]), 0, 1)
        w = w * w * (3 - 2 * w)                          # smoothstep
        sa = shifts[REFS[0]][i - BAD.start]; sb = shifts[REFS[1]][i - BAD.start]
        # положение пятна в кадре: позиция опоры + её сдвиг; между опорами интерполируем
        pos = (C[REFS[0]] + sa) * (1 - w) + (C[REFS[1]] + sb) * w
        ix, iy = int(round(pos[0] - EW/2)), int(round(pos[1] - EH/2))
        # каждую опору сэмплируем так, чтобы её центр свечения лёг ровно в pos
        pa = sample(frames[REFS[0]], X + C[REFS[0]][0] - (pos[0] - ix), Y + C[REFS[0]][1] - (pos[1] - iy), EW, EH)
        pb = sample(frames[REFS[1]], X + C[REFS[1]][0] - (pos[0] - ix), Y + C[REFS[1]][1] - (pos[1] - iy), EW, EH)
        patch = pa * (1 - w) + pb * w
        m = glow_mask(patch)
        sl = (slice(Y+iy, Y+EH+iy), slice(X+ix, X+EW+ix))
        tgt = f[sl]
        # в пятне — свечение опоры; по его растушёванному краю — более светлое
        # из двух, чтобы кромка зрачка не выглядывала из-под пятна
        f[sl] = np.where(m >= 1, patch, tgt * (1 - m) + np.maximum(tgt, patch) * m)
        print(f"кадр {i}: w={w:.2f} сдвиг {ix:+d},{iy:+d}")
    write(i, f)
