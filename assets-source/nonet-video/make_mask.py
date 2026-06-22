"""
S96 — NONET video pipeline, stage 3a: feathered radial alpha matte.

Builds a soft-edged ellipse alpha mask (white center -> black edges, heavily feathered) sized to the
post-processed video. ffmpeg alphamerge uses it so each character video composites into the dark
NONET overlay with NO hard rectangle edge — the dusk-forest surround fades out smoothly.

Usage: python make_mask.py <w> <h> <out.png> [--inset 0.06] [--feather 0.30]
  inset:   fraction of half-dimension the opaque core sits inside the frame edge
  feather: fraction of half-dimension over which alpha ramps 1->0 (bigger = softer)
"""
import sys
from PIL import Image, ImageDraw, ImageFilter


def main():
    w, h, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    inset, feather = 0.06, 0.30
    for i, a in enumerate(sys.argv):
        if a == "--inset":
            inset = float(sys.argv[i + 1])
        if a == "--feather":
            feather = float(sys.argv[i + 1])

    # opaque ellipse, then a big gaussian blur to feather the edge to black
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    mx, my = int(w * inset), int(h * inset)
    # shrink the solid core so the post-blur feather still lands inside the frame
    blur = int(min(w, h) * feather * 0.5)
    pad = blur  # keep the blurred edge off the frame border
    d.ellipse([mx + pad, my + pad, w - mx - pad, h - my - pad], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(blur))
    m.save(out, "PNG")
    print(f"wrote {out} ({w}x{h}) inset={inset} feather={feather} blur={blur}")


if __name__ == "__main__":
    main()
