"""
S96 — NONET video pipeline, stage 3a: feathered radial alpha matte.

Builds a soft-edged ellipse alpha mask (white center -> black edges, feathered rim) sized to the
post-processed video. ffmpeg alphamerge / the Pixi sprite.mask uses it so each character video
composites into the dark NONET overlay with NO hard rectangle edge — the dusk-forest surround fades
out smoothly while the SUBJECT (owl/spirit body + wings) stays fully opaque.

S99 — added --plateau. The S96 defaults (inset 0.06, feather 0.30 => 81px blur on a shrunk core)
produced a mask whose PEAK alpha was only 231/255 and that feathered ~93% of the frame, so the
WHOLE sprite (incl. wings) went semi-transparent and its outline melted into the dark bg. Fix: a
LARGE opaque core + a post-blur PLATEAU clamp (multiply then min 255) so the core saturates to a
flat 255 like owl-b's hand-cut mask, feathering ONLY the outer rim. Use a smaller --feather +
--plateau > 1 for a crisp, fully-visible subject. The S99 shipped spirit-mask uses the defaults
below (inset 0.05, feather 0.20, plateau 2.0): peak 255, ~42% opaque core, wings opaque to x≈15%,
a soft feathered rim, fully-transparent corners (no hard rectangle).

Usage: python make_mask.py <w> <h> <out.png> [--inset 0.05] [--feather 0.20] [--plateau 2.0]
  inset:   fraction of half-dimension the opaque core sits inside the frame edge
  feather: fraction of half-dimension over which alpha ramps (smaller = crisper, larger core)
  plateau: post-blur alpha multiplier, clamped to 255 (>1 forces a flat opaque core; 1.0 = legacy)
"""
import sys
from PIL import Image, ImageDraw, ImageFilter


def main():
    w, h, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    inset, feather, plateau = 0.05, 0.20, 2.0
    for i, a in enumerate(sys.argv):
        if a == "--inset":
            inset = float(sys.argv[i + 1])
        if a == "--feather":
            feather = float(sys.argv[i + 1])
        if a == "--plateau":
            plateau = float(sys.argv[i + 1])

    # opaque ellipse, then a gaussian blur to feather the edge, then a plateau clamp so the
    # large core saturates to a flat 255 (only the outer rim ramps to 0).
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    mx, my = int(w * inset), int(h * inset)
    # shrink the solid core so the post-blur feather still lands inside the frame
    blur = int(min(w, h) * feather * 0.5)
    pad = blur  # keep the blurred edge off the frame border
    d.ellipse([mx + pad, my + pad, w - mx - pad, h - my - pad], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(blur))
    if plateau != 1.0:
        m = m.point(lambda v: min(255, int(v * plateau)))
    m.save(out, "PNG")
    print(f"wrote {out} ({w}x{h}) inset={inset} feather={feather} blur={blur} plateau={plateau} peak={m.getextrema()[1]}")


if __name__ == "__main__":
    main()
