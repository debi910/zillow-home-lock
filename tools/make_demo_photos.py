"""Generates the synthetic demo photos (no real homes are pictured).

Each demo home gets "original" photos (as if from its earlier sale listing)
and, for the scam scenario, "copied" versions that are cropped, recolored and
watermarked the way scammers disguise stolen photos.
"""
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "demo" / "photos"
W, H = 960, 640


def sky(draw, top, bottom):
    for y in range(H):
        t = y / H
        draw.line([(0, y), (W, y)], fill=tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3)))


def exterior(seed, body, roof, trim):
    rnd = random.Random(seed)
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    sky(d, (120, 170, 230), (205, 225, 245))
    d.rectangle([0, 430, W, H], fill=(86, 140, 70))
    d.polygon([(400, H), (560, H), (520, 470), (470, 470)], fill=(190, 180, 165))
    x0 = rnd.randint(180, 260)
    w = rnd.randint(440, 520)
    d.rectangle([x0, 250, x0 + w, 470], fill=body)
    d.polygon([(x0 - 30, 255), (x0 + w // 2, rnd.randint(110, 150)), (x0 + w + 30, 255)], fill=roof)
    for i in range(rnd.randint(2, 4)):
        wx = x0 + 40 + i * (w - 80) // 3
        d.rectangle([wx, 300, wx + 70, 370], fill=(170, 200, 225), outline=trim, width=6)
    d.rectangle([x0 + w // 2 - 35, 360, x0 + w // 2 + 35, 470], fill=trim)
    for _ in range(rnd.randint(2, 4)):
        tx = rnd.choice([rnd.randint(20, x0 - 60), rnd.randint(x0 + w + 40, W - 40)])
        d.rectangle([tx - 8, 360, tx + 8, 450], fill=(90, 60, 40))
        r = rnd.randint(50, 80)
        d.ellipse([tx - r, 360 - 2 * r + 20, tx + r, 380], fill=(40 + rnd.randint(0, 30), 110, 50))
    return img.filter(ImageFilter.GaussianBlur(1.2))


def interior(seed, wall, floor, accent):
    rnd = random.Random(seed)
    img = Image.new("RGB", (W, H), wall)
    d = ImageDraw.Draw(img)
    horizon = rnd.randint(380, 470)
    # side wall in shadow, at a random depth
    side = rnd.randint(120, 320)
    left = rnd.random() < 0.5
    shade = tuple(max(0, c - 45) for c in wall)
    if left:
        d.polygon([(0, 0), (side, 60), (side, horizon), (0, H)], fill=shade)
    else:
        d.polygon([(W, 0), (W - side, 60), (W - side, horizon), (W, H)], fill=shade)
    d.polygon([(0, horizon), (W, horizon), (W, H), (0, H)], fill=floor)
    for i in range(-200, W + 200, rnd.randint(45, 90)):
        d.line([(i, horizon), (i + rnd.randint(-160, 160), H)], fill=tuple(max(0, c - 22) for c in floor), width=2)
    room = seed % 3
    if room == 0:  # kitchen: cabinet grid and counter
        top = rnd.randint(60, 120)
        for cx in range(rnd.randint(150, 350), W - 60, 110):
            d.rectangle([cx, top, cx + 100, top + 120], fill=accent, outline=(40, 40, 40), width=3)
            d.rectangle([cx, horizon - 150, cx + 100, horizon], fill=accent, outline=(40, 40, 40), width=3)
        d.rectangle([0, horizon - 165, W, horizon - 145], fill=(70, 70, 75))
    elif room == 1:  # bedroom: bed, headboard, lamp
        bx = rnd.randint(150, 450)
        d.rectangle([bx, horizon - 210, bx + 380, horizon - 80], fill=tuple(max(0, c - 40) for c in accent))
        d.rounded_rectangle([bx - 20, horizon - 90, bx + 400, horizon + 60], radius=18, fill=(245, 245, 240))
        d.rectangle([bx - 20, horizon - 10, bx + 400, horizon + 60], fill=accent)
        lx = bx - 120 if bx > 200 else bx + 470
        d.polygon([(lx, horizon - 200), (lx + 70, horizon - 200), (lx + 55, horizon - 150), (lx + 15, horizon - 150)], fill=(250, 230, 170))
        d.rectangle([lx + 30, horizon - 150, lx + 40, horizon - 40], fill=(60, 60, 60))
    else:  # living room: window, sofa, framed art
        wx = rnd.randint(80, 520)
        d.rectangle([wx, 80, wx + rnd.randint(220, 340), 300], fill=(200, 225, 245), outline=(250, 250, 250), width=12)
        sx = rnd.randint(60, 500)
        d.rounded_rectangle([sx, horizon - 70, sx + 360, horizon + 50], radius=24, fill=accent)
        d.rounded_rectangle([sx + 20, horizon - 110, sx + 340, horizon - 50], radius=20, fill=tuple(min(255, c + 25) for c in accent))
        ax = rnd.randint(40, W - 240)
        d.rectangle([ax, 110, ax + 180, 230], fill=(rnd.randint(40, 220), rnd.randint(40, 220), rnd.randint(40, 220)), outline=(30, 30, 30), width=6)
    # uneven lighting, like a real photo
    light = Image.new("L", (W, H))
    ld = ImageDraw.Draw(light)
    cx = rnd.randint(0, W)
    for r in range(900, 0, -30):
        ld.ellipse([cx - r, -r // 2, cx + r, r], fill=int(255 * (1 - r / 900) * 0.5))
    img = Image.composite(Image.new("RGB", (W, H), (255, 250, 235)), img, light.point(lambda v: v // 3))
    return img.filter(ImageFilter.GaussianBlur(1.0))


def disguise(img, seed):
    """What scammers do to stolen photos: crop, recolor, re-compress, stamp."""
    rnd = random.Random(seed)
    cx, cy = int(W * rnd.uniform(0.03, 0.07)), int(H * rnd.uniform(0.03, 0.07))
    out = img.crop((cx, cy, W - cx // 2, H - cy // 2)).resize((W, H))
    out = ImageEnhance.Brightness(out).enhance(rnd.uniform(1.08, 1.18))
    out = ImageEnhance.Color(out).enhance(rnd.uniform(1.15, 1.3))
    d = ImageDraw.Draw(out)
    d.rectangle([W - 300, H - 60, W - 20, H - 20], fill=(255, 255, 255))
    d.text((W - 285, H - 50), "AVAILABLE NOW - CALL", fill=(200, 0, 0))
    return out


HOMES = {
    # scam scenario: photos lifted from the home's earlier sale listing
    "maple": dict(ext=[(1, (236, 226, 205), (110, 60, 50), (250, 250, 250)),
                       (2, (236, 226, 205), (110, 60, 50), (250, 250, 250))],
                  int=[(3, (238, 232, 220), (160, 120, 80), (70, 90, 130)),
                       (4, (225, 235, 230), (150, 115, 85), (150, 70, 60))]),
    # legitimate scenario: owner-taken photos, never listed before
    "oak": dict(ext=[(11, (170, 190, 205), (60, 60, 70), (245, 245, 245)),
                     (12, (170, 190, 205), (60, 60, 70), (245, 245, 245))],
                int=[(16, (245, 240, 230), (120, 90, 60), (90, 120, 90)),
                     (17, (230, 230, 240), (130, 100, 70), (120, 80, 120))]),
    # locked-home scenario
    "cedar": dict(ext=[(21, (205, 160, 120), (80, 50, 40), (240, 235, 225)),
                       (22, (205, 160, 120), (80, 50, 40), (240, 235, 225))],
                  int=[(26, (240, 235, 225), (170, 130, 90), (60, 100, 110)),
                       (28, (235, 230, 215), (140, 105, 75), (110, 90, 60))]),
}

OUT.mkdir(parents=True, exist_ok=True)
for name, spec in HOMES.items():
    photos = [exterior(*e) for e in spec["ext"]] + [interior(*i) for i in spec["int"]]
    for i, p in enumerate(photos, 1):
        p.save(OUT / f"{name}-original-{i}.jpg", quality=88)
        disguise(p, seed=100 + i).save(OUT / f"{name}-copied-{i}.jpg", quality=72)
print("wrote", len(list(OUT.glob("*.jpg"))), "photos to", OUT)
