"""Generate app icon / splash: solid colour + text (Pillow's bundled font). Run: python3 scripts/make-assets.py"""
from PIL import Image, ImageDraw, ImageFont

BG = (17, 24, 39)        # #111827
FG = (250, 204, 21)      # #FACC15
SUB = (229, 231, 235)    # #E5E7EB


def font(size):
    return ImageFont.load_default(size=size)


def centered(draw, text, size, cy, fill, w):
    f = font(size)
    l, t, r, b = draw.textbbox((0, 0), text, font=f)
    draw.text(((w - (r - l)) / 2 - l, cy - (b - t) / 2 - t), text, font=f, fill=fill)


def mark(size, bg, scale=1.0):
    img = Image.new("RGBA", (size, size), bg)
    d = ImageDraw.Draw(img)
    centered(d, "R", int(size * 0.55 * scale), size * 0.44, FG, size)
    centered(d, "RECEIPTS", int(size * 0.11 * scale), size * 0.44 + size * 0.30 * scale, SUB, size)
    return img


mark(1024, BG + (255,)).convert("RGB").save("assets/icon.png")
# Adaptive foreground: transparent, content inside the central 66% safe zone.
mark(1024, (0, 0, 0, 0), scale=0.6).save("assets/adaptive-icon.png")
mark(48, BG + (255,)).convert("RGB").save("assets/favicon.png")

W, H = 1284, 2778
splash = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(splash)
centered(d, "Receipts", 200, H * 0.46, FG, W)
centered(d, "seal the call · reveal · get scored", 56, H * 0.46 + 200, SUB, W)
splash.save("assets/splash.png")
