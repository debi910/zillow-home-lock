"""Generates the synthetic demo photos (no real homes are pictured).

Each demo home gets "original" photos (as if from its earlier listing) and
"copied" versions that are cropped, recolored, recompressed and stamped, the
way scammers disguise stolen photos. Rendering is procedural: a sky with
clouds, a lit house with siding, roof shingles, windows, shadows and
landscaping, and a few interior rooms with soft window light.
"""
import math
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageChops

OUT = Path(__file__).resolve().parent.parent / "demo" / "photos"
W, H = 1200, 800


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c)


def noise(img, amount, seed):
    rnd = random.Random(seed)
    n = Image.effect_noise((W // 2, H // 2), 40).resize((W, H)).convert("RGB")
    return Image.blend(img, ImageChops.multiply(img, ImageEnhance.Brightness(n).enhance(1.9)), amount)


def sky(d, rnd, golden):
    top = (66, 133, 214) if not golden else (92, 122, 190)
    bottom = (196, 222, 246) if not golden else (250, 206, 160)
    for y in range(H):
        d.line([(0, y), (W, y)], fill=lerp(top, bottom, (y / H) ** 0.8))


def clouds(img, rnd):
    layer = Image.new("L", (W, H), 0)
    ld = ImageDraw.Draw(layer)
    for _ in range(rnd.randint(3, 6)):
        cx, cy = rnd.randint(0, W), rnd.randint(30, 260)
        for _ in range(rnd.randint(5, 9)):
            r = rnd.randint(30, 80)
            ox, oy = rnd.randint(-120, 120), rnd.randint(-20, 25)
            ld.ellipse([cx + ox - r * 1.6, cy + oy - r, cx + ox + r * 1.6, cy + oy + r], fill=rnd.randint(150, 230))
    layer = layer.filter(ImageFilter.GaussianBlur(18))
    return Image.composite(Image.new("RGB", (W, H), (255, 255, 255)), img, layer)


def tree(d, x, base, h, rnd, dark=False):
    trunk = (92, 66, 46)
    d.rectangle([x - 9, base - h * 0.45, x + 9, base], fill=trunk)
    greens = [(52, 104, 52), (66, 124, 60), (82, 140, 70), (44, 92, 48)]
    for _ in range(14):
        r = rnd.randint(int(h * 0.18), int(h * 0.3))
        ox = rnd.randint(-int(h * 0.3), int(h * 0.3))
        oy = rnd.randint(-int(h * 0.95), -int(h * 0.45))
        c = rnd.choice(greens)
        d.ellipse([x + ox - r, base + oy - r, x + ox + r, base + oy + r], fill=shade(c, 0.8 if dark else 1))


def bush(d, x, y, w, rnd):
    for _ in range(8):
        r = rnd.randint(18, 34)
        ox = rnd.randint(0, w)
        d.ellipse([x + ox - r, y - r * 1.2, x + ox + r, y + r * 0.4], fill=rnd.choice([(58, 112, 54), (74, 130, 62), (48, 98, 50)]))


def window(d, x, y, w, h, trim, night=False):
    d.rectangle([x - 6, y - 6, x + w + 6, y + h + 6], fill=trim)
    glass_top, glass_bot = (150, 186, 214), (84, 118, 150)
    for i in range(h):
        d.line([(x, y + i), (x + w, y + i)], fill=lerp(glass_top, glass_bot, i / h))
    d.polygon([(x + 6, y + h - 6), (x + w * 0.45, y + 6), (x + w * 0.6, y + 6), (x + 16, y + h - 6)], fill=(190, 214, 232))
    d.line([(x + w / 2, y), (x + w / 2, y + h)], fill=trim, width=4)
    d.line([(x, y + h / 2), (x + w, y + h / 2)], fill=trim, width=4)
    d.rectangle([x - 10, y + h + 6, x + w + 10, y + h + 14], fill=shade(trim, 0.85))


def exterior(seed, body, roof, trim, style="gable", golden=False):
    rnd = random.Random(seed)
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    sky(d, rnd, golden)
    img = clouds(img, rnd)
    d = ImageDraw.Draw(img)
    horizon = 560
    for i in range(3):  # distant tree line
        for x in range(-40, W + 40, 50):
            r = rnd.randint(30, 60)
            d.ellipse([x - r, horizon - 40 - r - i * 10, x + r, horizon - 40 + r], fill=shade((80, 120, 80), 0.75 + i * 0.05))
    for y in range(horizon - 30, H):  # lawn
        t = (y - horizon + 30) / (H - horizon + 30)
        d.line([(0, y), (W, y)], fill=lerp((96, 150, 72), (64, 118, 52), t))
    x0 = rnd.randint(250, 330)
    w = rnd.randint(560, 640)
    top = 300
    base = horizon + 40
    # body with lap siding
    d.rectangle([x0, top, x0 + w, base], fill=body)
    for y in range(top + 8, base, 14):
        d.line([(x0, y), (x0 + w, y)], fill=shade(body, 0.9), width=2)
    d.rectangle([x0 + w - 70, top, x0 + w, base], fill=shade(body, 0.82))  # side in shade
    # roof
    if style == "gable":
        peak = rnd.randint(150, 185)
        poly = [(x0 - 40, top + 8), (x0 + w / 2, peak), (x0 + w + 40, top + 8)]
    else:  # hip
        poly = [(x0 - 40, top + 8), (x0 + 110, rnd.randint(185, 205)), (x0 + w - 110, rnd.randint(185, 205)), (x0 + w + 40, top + 8)]
    roof_layer = Image.new("RGB", (W, H), roof)
    rd = ImageDraw.Draw(roof_layer)
    for y in range(0, H, 12):
        rd.line([(0, y), (W, y)], fill=shade(roof, 0.82), width=2)
    for y in range(0, H, 24):
        for x in range(rnd.randint(0, 30), W, 34):
            rd.line([(x, y), (x, y + 12)], fill=shade(roof, 0.86), width=1)
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon(poly, fill=255)
    img.paste(roof_layer, (0, 0), mask)
    d = ImageDraw.Draw(img)
    d.rectangle([x0 - 44, top + 4, x0 + w + 44, top + 18], fill=trim)
    # porch shadow under eave
    d.rectangle([x0, top + 18, x0 + w, top + 34], fill=shade(body, 0.75))
    # windows and door
    n = rnd.randint(2, 3)
    door_x = x0 + w * rnd.choice([0.42, 0.5, 0.58]) - 40
    for i in range(n + 1):
        wx = x0 + 50 + i * (w - 180) / n
        if abs(wx + 50 - (door_x + 40)) < 110:
            continue
        window(d, wx, top + 80, 100, 120, trim)
    d.rectangle([door_x - 8, top + 92, door_x + 88, base], fill=trim)
    d.rectangle([door_x, top + 100, door_x + 80, base], fill=shade(roof, 1.3) if sum(roof) < 300 else (70, 60, 56))
    d.ellipse([door_x + 62, top + 170, door_x + 70, top + 178], fill=(214, 180, 90))
    # steps and walkway
    d.rectangle([door_x - 20, base, door_x + 100, base + 12], fill=(186, 180, 172))
    d.polygon([(door_x - 10, base + 12), (door_x + 90, base + 12), (door_x + 170, H), (door_x - 90, H)], fill=(204, 196, 184))
    # landscaping
    bush(d, x0 - 10, base + 6, 160, rnd)
    bush(d, x0 + w - 170, base + 6, 160, rnd)
    tree(d, rnd.randint(80, 180), base + 30, rnd.randint(300, 380), rnd)
    tree(d, rnd.randint(W - 160, W - 60), base + 50, rnd.randint(320, 400), rnd, dark=True)
    # cast shadow on lawn
    shadow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shadow).polygon([(x0, base), (x0 + w, base), (x0 + w + 160, base + 70), (x0 + 120, base + 70)], fill=70)
    img = Image.composite(Image.new("RGB", (W, H), (30, 50, 30)), img, shadow.filter(ImageFilter.GaussianBlur(14)))
    img = noise(img, 0.08, seed)
    return img.filter(ImageFilter.GaussianBlur(0.6))


def interior(seed, wall, floor, accent, room):
    rnd = random.Random(seed)
    img = Image.new("RGB", (W, H), wall)
    d = ImageDraw.Draw(img)
    horizon = rnd.randint(500, 560)
    for y in range(horizon):
        d.line([(0, y), (W, y)], fill=lerp(shade(wall, 1.05), shade(wall, 0.92), y / horizon))
    side = rnd.randint(140, 300)
    left = rnd.random() < 0.5
    sh = shade(wall, 0.8)
    if left:
        d.polygon([(0, 0), (side, 70), (side, horizon), (0, H)], fill=sh)
    else:
        d.polygon([(W, 0), (W - side, 70), (W - side, horizon), (W, H)], fill=sh)
    for y in range(horizon, H):
        d.line([(0, y), (W, y)], fill=lerp(shade(floor, 1.05), shade(floor, 0.85), (y - horizon) / (H - horizon)))
    for i in range(-300, W + 300, rnd.randint(60, 90)):
        d.line([(i, horizon), (i + (i - W / 2) * 0.6, H)], fill=shade(floor, 0.88), width=2)
    d.rectangle([0, horizon - 8, W, horizon], fill=(244, 244, 240))
    if room == "kitchen":
        top = rnd.randint(90, 130)
        for cx in range(rnd.randint(320, 420), W - 80, 120):
            d.rectangle([cx, top, cx + 112, top + 150], fill=accent)
            d.rectangle([cx + 6, top + 6, cx + 106, top + 144], outline=shade(accent, 0.85), width=3)
            d.rectangle([cx, horizon - 190, cx + 112, horizon - 8], fill=accent)
            d.rectangle([cx + 6, horizon - 184, cx + 106, horizon - 14], outline=shade(accent, 0.85), width=3)
            d.rectangle([cx + 48, horizon - 160, cx + 64, horizon - 154], fill=(200, 200, 205))
        for y in range(top + 160, horizon - 200, 22):  # tile backsplash
            for x in range(320, W, 44):
                d.rectangle([x, y, x + 40, y + 18], fill=(236, 236, 232), outline=(214, 214, 210))
        d.rectangle([300, horizon - 210, W, horizon - 190], fill=(60, 62, 66))
        isl = rnd.randint(260, 420)
        d.rectangle([isl, horizon + 40, isl + 480, horizon + 200], fill=shade(accent, 0.9))
        d.rectangle([isl - 20, horizon + 20, isl + 500, horizon + 42], fill=(232, 232, 228))
        for px in (isl + 120, isl + 360):
            d.line([(px, 0), (px, 140)], fill=(40, 40, 40), width=3)
            d.polygon([(px - 40, 190), (px + 40, 190), (px + 20, 140), (px - 20, 140)], fill=(30, 30, 34))
    elif room == "bedroom":
        bx = rnd.randint(260, 520)
        d.rounded_rectangle([bx, horizon - 280, bx + 460, horizon - 70], radius=14, fill=shade(accent, 0.7))
        d.rounded_rectangle([bx - 30, horizon - 110, bx + 490, horizon + 120], radius=20, fill=(248, 247, 243))
        d.rounded_rectangle([bx - 30, horizon - 10, bx + 490, horizon + 120], radius=16, fill=accent)
        for px in (bx + 30, bx + 250):
            d.rounded_rectangle([px, horizon - 160, px + 180, horizon - 90], radius=22, fill=(240, 238, 232))
        for lx in (bx - 170, bx + 540):
            d.rectangle([lx, horizon - 70, lx + 120, horizon + 30], fill=(170, 130, 96))
            d.polygon([(lx + 20, horizon - 190), (lx + 100, horizon - 190), (lx + 85, horizon - 120), (lx + 35, horizon - 120)], fill=(250, 236, 196))
            d.rectangle([lx + 56, horizon - 120, lx + 64, horizon - 70], fill=(80, 80, 80))
        ax = bx + 120
        d.rectangle([ax, 90, ax + 220, 230], fill=(rnd.randint(60, 200), rnd.randint(80, 200), rnd.randint(80, 200)), outline=(40, 40, 40), width=8)
    else:  # living room
        wx = rnd.randint(380, 640)
        ww = rnd.randint(320, 440)
        d.rectangle([wx - 14, 70, wx + ww + 14, 380], fill=(250, 250, 248))
        for i in range(296):
            d.line([(wx, 78 + i), (wx + ww, 78 + i)], fill=lerp((172, 210, 240), (222, 236, 246), i / 296))
        tree(d, wx + ww * 0.3, 380, 260, rnd)
        d.line([(wx + ww / 2, 78), (wx + ww / 2, 374)], fill=(250, 250, 248), width=10)
        sx = rnd.randint(140, 360)
        d.rounded_rectangle([sx, horizon - 120, sx + 520, horizon + 90], radius=28, fill=accent)
        d.rounded_rectangle([sx + 30, horizon - 180, sx + 490, horizon - 60], radius=26, fill=shade(accent, 1.12))
        for cx in (sx + 60, sx + 380):
            d.rounded_rectangle([cx, horizon - 150, cx + 90, horizon - 70], radius=18, fill=(236, 220, 190))
        rug = [(sx - 60, horizon + 110), (sx + 600, horizon + 110), (sx + 700, H - 30), (sx - 160, H - 30)]
        d.polygon(rug, fill=(222, 214, 200))
        d.rounded_rectangle([sx + 140, horizon + 140, sx + 400, horizon + 200], radius=10, fill=(120, 86, 60))
        px = rnd.choice([80, W - 200])
        d.rectangle([px + 30, horizon - 30, px + 110, horizon + 60], fill=(214, 206, 196))
        for _ in range(9):
            r = rnd.randint(30, 50)
            d.ellipse([px + 70 - r + rnd.randint(-50, 50), horizon - 120 - r + rnd.randint(-80, 40), px + 70 + r + rnd.randint(-50, 50), horizon - 120 + r], fill=rnd.choice([(52, 110, 56), (70, 130, 64)]))
    # window light falloff
    light = Image.new("L", (W, H))
    ld = ImageDraw.Draw(light)
    cx = rnd.randint(200, W - 200)
    for r in range(1100, 0, -40):
        ld.ellipse([cx - r, -r // 2, cx + r, r], fill=int(110 * (1 - r / 1100)))
    img = Image.composite(Image.new("RGB", (W, H), (255, 248, 232)), img, light)
    img = noise(img, 0.06, seed)
    return img.filter(ImageFilter.GaussianBlur(0.7))


def disguise(img, seed):
    """What scammers do to stolen photos: crop, recolor, re-compress, stamp."""
    rnd = random.Random(seed)
    cx, cy = int(W * rnd.uniform(0.03, 0.07)), int(H * rnd.uniform(0.03, 0.07))
    out = img.crop((cx, cy, W - cx // 2, H - cy // 2)).resize((W, H))
    out = ImageEnhance.Brightness(out).enhance(rnd.uniform(1.08, 1.16))
    out = ImageEnhance.Color(out).enhance(rnd.uniform(1.2, 1.35))
    d = ImageDraw.Draw(out)
    d.rounded_rectangle([W - 360, H - 78, W - 24, H - 24], radius=8, fill=(255, 255, 255))
    d.text((W - 340, H - 60), "AVAILABLE NOW  TEXT TO APPLY", fill=(200, 0, 0))
    return out


# name: (exterior specs, interior specs, copied?)
HOMES = {
    "maple": ([(1, (238, 228, 206), (96, 58, 48), (252, 252, 250), "gable"), (2, (238, 228, 206), (96, 58, 48), (252, 252, 250), "gable", True)],
              [(3, (240, 236, 228), (168, 128, 88), (232, 232, 226), "kitchen"), (4, (228, 236, 232), (156, 118, 86), (150, 84, 70), "bedroom")]),
    "oak": ([(11, (150, 172, 188), (58, 60, 68), (246, 246, 244), "hip"), (12, (150, 172, 188), (58, 60, 68), (246, 246, 244), "hip", True)],
            [(13, (246, 242, 234), (128, 94, 62), (96, 124, 104), "living"), (14, (232, 232, 240), (138, 104, 72), (116, 92, 140), "bedroom")]),
    "cedar": ([(21, (204, 160, 122), (74, 50, 42), (242, 238, 228), "gable"), (22, (204, 160, 122), (74, 50, 42), (242, 238, 228), "gable", True)],
              [(23, (242, 238, 230), (176, 136, 96), (62, 98, 112), "living"), (24, (236, 232, 218), (146, 108, 78), (36, 54, 70), "kitchen")]),
    "elm": ([(31, (244, 244, 240), (62, 66, 72), (40, 44, 50), "gable"), (32, (244, 244, 240), (62, 66, 72), (40, 44, 50), "gable", True)],
            [(33, (246, 246, 244), (190, 160, 120), (210, 210, 206), "kitchen"), (34, (238, 238, 234), (170, 136, 100), (176, 150, 120), "living")]),
    "pecan": ([(41, (176, 196, 160), (88, 72, 60), (250, 248, 240), "hip"), (42, (176, 196, 160), (88, 72, 60), (250, 248, 240), "hip", True)],
              [(43, (240, 234, 222), (150, 112, 80), (70, 90, 70), "bedroom"), (44, (244, 240, 232), (160, 120, 84), (188, 120, 80), "living")]),
    "willow": ([(51, (214, 186, 150), (110, 80, 60), (250, 244, 232), "gable"), (52, (214, 186, 150), (110, 80, 60), (250, 244, 232), "gable", True)],
               [(53, (236, 240, 244), (150, 140, 130), (40, 70, 110), "living"), (54, (240, 236, 230), (182, 146, 106), (96, 96, 100), "kitchen")]),
}

OUT.mkdir(parents=True, exist_ok=True)
for old in OUT.glob("*.jpg"):
    old.unlink()
for name, (exts, ints) in HOMES.items():
    photos = [exterior(s, b, r, t, style, *(golden)) for (s, b, r, t, style, *golden) in exts]
    photos += [interior(s, w, f, a, room) for (s, w, f, a, room) in ints]
    for i, p in enumerate(photos, 1):
        p.save(OUT / f"{name}-original-{i}.jpg", quality=86, optimize=True, progressive=True)
        if name in ("maple", "cedar"):
            disguise(p, seed=100 + i).save(OUT / f"{name}-copied-{i}.jpg", quality=70, optimize=True)
print("wrote", len(list(OUT.glob("*.jpg"))), "photos to", OUT)
