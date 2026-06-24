"""
S102 #5 — bespoke matte for the BOTTOM-LEFT NONET owl (owl-b).

owl-b is the one guardian that needs a custom mask (the shared spirit-mask would re-expose a stray
veo flame). The S97 hand-cut mask was too TIGHT (opaque core only ~39% wide), so its raised right wing
and left wing fell into the transparent rim and faded out — the owner circled it as "too faded, missing
his wings". This regenerates a WIDER matte that:
  - covers the owl + BOTH wings (opaque core ~69% wide, like spirit-mask), and
  - is shifted UP and cropped before the bottom edge, so the orange flame STREAK that sweeps
    horizontally across the lower body (verified via a max-brightness projection of the loop) has its
    out-past-the-owl extensions cropped — what remains reads as the lantern glow, not a stray flame.

Output format MATCHES the prior owl-b-mask: RGBA, white RGB, alpha = the matte (Pixi sprite.mask uses
the alpha channel for this slot). Frame size = the SPIRIT video native 540x960.

Run: python make_owlb_mask.py   (writes ../../public/art/nonet/owl-b-mask.png)
"""
import os
from PIL import Image, ImageDraw, ImageFilter

W, H = 540, 960
# owl+wings fitted ellipse: centre shifted up from frame-mid (480) onto the head/body; wide for the
# wings; short enough that the lower flame-streak's edge extensions fall outside the feathered rim.
CX, CY, RX, RY = 258, 445, 190, 278
BLUR, PLATEAU = 62, 2.0

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "art", "nonet", "owl-b-mask.png")


def main() -> None:
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).ellipse([CX - RX, CY - RY, CX + RX, CY + RY], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(BLUR))
    m = m.point(lambda v: min(255, int(v * PLATEAU)))  # flat opaque core, feather only the rim
    out = Image.merge("RGBA", (Image.new("L", (W, H), 255),) * 3 + (m,))  # white RGB + alpha=matte
    out.save(OUT, "PNG")
    print(f"wrote {OUT} ({W}x{H}) ellipse c=({CX},{CY}) r=({RX},{RY}) blur={BLUR} plateau={PLATEAU} "
          f"alpha-peak={m.getextrema()[1]}")


if __name__ == "__main__":
    main()
