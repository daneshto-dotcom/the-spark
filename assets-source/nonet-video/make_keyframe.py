"""
S96 — NONET living-realm video pipeline, stage 1: keyframe compositor.

Takes one of the approved transparent character sprites (public/art/nonet/*.webp, 512x512 RGBA)
and composites it onto a DARK dusk-forest plate so veo 3.1 image-to-video has a rich, atmospheric
opaque seed frame. The plate is deliberately dark + warm-lit so the eventual video melts into the
NONET overlay's dark backdrop (0x0a0a14) after ffmpeg applies a feathered radial alpha matte.

Output: a 9:16 portrait PNG (720x1280) — matches veo's 9:16 aspect so the character is not squashed.

Usage: python make_keyframe.py <sprite_name> [--scale 0.95] [--cy 0.54]
  sprite_name: kami | owl-a | owl-b | moss-b
"""
import sys
import math
import random
from PIL import Image, ImageDraw, ImageFilter

W, H = 720, 1280  # 9:16 portrait — veo's portrait aspect

SPRITE_DIR = "../../public/art/nonet"
OUT_DIR = "keyframes"


def lerp(a, b, t):
    return int(a + (b - a) * t)


def dusk_plate(seed: int) -> Image.Image:
    """A dark dusk-forest gradient + soft bokeh + a warm low glow. Deterministic per seed."""
    rng = random.Random(seed)
    img = Image.new("RGB", (W, H))
    px = img.load()
    # vertical gradient: deep indigo crown -> teal-blue mid -> warm dark forest floor
    top = (0x12, 0x16, 0x2c)
    mid = (0x1a, 0x2a, 0x3a)
    bot = (0x2a, 0x1d, 0x22)
    for y in range(H):
        t = y / (H - 1)
        if t < 0.5:
            u = t / 0.5
            c = (lerp(top[0], mid[0], u), lerp(top[1], mid[1], u), lerp(top[2], mid[2], u))
        else:
            u = (t - 0.5) / 0.5
            c = (lerp(mid[0], bot[0], u), lerp(mid[1], bot[1], u), lerp(mid[2], bot[2], u))
        for x in range(W):
            px[x, y] = c

    # soft dark tree-silhouette suggestions down the sides (very subtle, blurred)
    sil = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(sil)
    for _ in range(7):
        bx = rng.choice([rng.randint(-40, 120), rng.randint(W - 120, W + 40)])
        bw = rng.randint(90, 200)
        bh = rng.randint(400, 900)
        sd.ellipse([bx, H - bh, bx + bw, H + 120], fill=rng.randint(40, 90))
    sil = sil.filter(ImageFilter.GaussianBlur(40))
    dark = Image.new("RGB", (W, H), (0x06, 0x09, 0x12))
    img = Image.composite(dark, img, sil)

    # warm low glow where the character will stand (lantern ambiance)
    glow = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(glow)
    gcx, gcy, gr = W // 2, int(H * 0.58), 260
    gd.ellipse([gcx - gr, gcy - gr, gcx + gr, gcy + gr], fill=120)
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    warm = Image.new("RGB", (W, H), (0xff, 0x9a, 0x4a))
    img = Image.composite(warm, img, glow)

    # bokeh fireflies — soft amber/lime dots, varied size + alpha
    bok = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bok)
    for _ in range(46):
        x = rng.randint(0, W)
        y = rng.randint(0, H)
        r = rng.randint(2, 7)
        a = rng.randint(40, 150)
        col = rng.choice([(0xea, 0xf7, 0xa0), (0xf6, 0xff, 0xc0), (0xff, 0xcf, 0x7a)])
        bd.ellipse([x - r, y - r, x + r, y + r], fill=(*col, a))
    bok = bok.filter(ImageFilter.GaussianBlur(2))
    img = img.convert("RGBA")
    img.alpha_composite(bok)
    return img.convert("RGB")


def main():
    name = sys.argv[1]
    scale = 0.95
    cy = 0.54
    for i, a in enumerate(sys.argv):
        if a == "--scale":
            scale = float(sys.argv[i + 1])
        if a == "--cy":
            cy = float(sys.argv[i + 1])

    plate = dusk_plate(seed=hash(name) & 0xffff).convert("RGBA")
    sprite = Image.open(f"{SPRITE_DIR}/{name}.webp").convert("RGBA")

    # scale sprite to a target width relative to frame, preserving aspect
    target_w = int(W * scale)
    ratio = target_w / sprite.width
    sprite = sprite.resize((target_w, int(sprite.height * ratio)), Image.LANCZOS)

    # soft glow halo behind the character (its own light), built from its alpha
    alpha = sprite.split()[3]
    halo = Image.new("RGBA", sprite.size, (0, 0, 0, 0))
    halo.paste((0xff, 0xc8, 0x82, 110), (0, 0), alpha)
    halo = halo.filter(ImageFilter.GaussianBlur(26))

    cx = W // 2
    py = int(H * cy)
    ox = cx - sprite.width // 2
    oy = py - sprite.height // 2
    plate.alpha_composite(halo, (ox, oy))
    plate.alpha_composite(sprite, (ox, oy))

    out = f"{OUT_DIR}/{name}.png"
    plate.convert("RGB").save(out, "PNG")
    print(f"wrote {out}  ({W}x{H})  sprite_scale={scale} cy={cy}")


if __name__ == "__main__":
    main()
