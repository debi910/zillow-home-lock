# Background plate with a browser window frame for the app scenes.
from PIL import Image, ImageDraw, ImageFilter, ImageFont
W, H = 1920, 1080
X, Y, AW, AH, BAR, R = 160, 22, 1600, 900, 36, 18
bg = Image.new("RGB", (W, H))
top, bot = (238, 244, 253), (222, 231, 246)
d = ImageDraw.Draw(bg)
for y in range(H):
    t = y / H
    d.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
sh = Image.new("L", (W, H), 0)
ImageDraw.Draw(sh).rounded_rectangle([X, Y + 18, X + AW, Y + BAR + AH + 18], R, fill=110)
sh = sh.filter(ImageFilter.GaussianBlur(28))
bg.paste(Image.new("RGB", (W, H), (20, 30, 55)), (0, 0), sh)
d = ImageDraw.Draw(bg)
d.rounded_rectangle([X, Y, X + AW, Y + BAR + AH], R, fill=(246, 247, 249))
d.line([(X, Y + BAR - 1), (X + AW, Y + BAR - 1)], fill=(222, 225, 231))
for i, c in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
    cx = X + 24 + i * 22; cy = Y + BAR // 2
    d.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=c)
font = ImageFont.truetype("/usr/share/fonts/opentype/inter/Inter-Medium.otf", 15)
d.rounded_rectangle([X + AW / 2 - 200, Y + 7, X + AW / 2 + 200, Y + BAR - 7], 8, fill=(255, 255, 255), outline=(225, 228, 234))
d.text((X + AW / 2, Y + BAR / 2), "localhost:8080  ·  Home Lock for Zillow (concept)", font=font, fill=(110, 118, 132), anchor="mm")
bg.save("cards/plate.png")
# Mask: rounded bottom corners for the app area.
m = Image.new("L", (AW, AH), 0)
ImageDraw.Draw(m).rounded_rectangle([0, -R, AW - 1, AH - 1], R, fill=255)
m.save("cards/mask.png")
print("ok", X, Y + BAR)
