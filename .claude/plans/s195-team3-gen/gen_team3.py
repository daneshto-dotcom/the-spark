"""S195 ART — generate the 3-player (3v1) team backdrop prompt sheet (.md + .html).

Worlds and pair seams are taken VERBATIM from the S192 2v2 sheet (parsed into s192.json) so the
two sets stay one family. Run: python gen_team3.py <out_dir>
"""
import html, itertools, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
data = json.load(open(os.path.join(HERE, 's192.json'), encoding='utf-8'))
W, SEAM = data['worlds'], data['seams']

RACES = ['demons', 'mummies', 'nagas', 'orcs', 'vampires', 'zombies']  # fixed canonical order
CAP = {r: r.capitalize() for r in RACES}
COL = {'demons': '#d73bff', 'mummies': '#ffe23b', 'nagas': '#3bd7ff', 'orcs': '#ff8c1a',
       'vampires': '#ff3b6b', 'zombies': '#44ff5e'}
DL = r'C:\Users\onesh\Downloads'

# ---- measured geometry (src/constants.ts:95-96, 137-139, 637-638; src/state/zones.ts ANCHORS) ----
REQ_W, REQ_H = 1376, 768  # the 16:9 size gemini-3-pro-image returned for the S165 4p masters
NW_W, NW_H = REQ_W // 2, REQ_H // 2  # 688 x 384

combos = list(itertools.combinations_with_replacement(RACES, 3))  # already canonical: NE<=SE<=SW
assert len(combos) == 56


def kind(c):
    n = len(set(c))
    return {3: 'three races', 2: 'pair + one', 1: 'same race'}[n]


def seam(a, b, where):
    if a == b:
        return (f"{where}: both quarters are {CAP[a].upper()} ground - one unbroken stretch of the same "
                "world with no seam at all, varied enough that it never looks repeated, tiled or mirrored.")
    return f"{where}: {SEAM[a + '|' + b]}"


AVOID = ("Avoid: sky, horizon, moon, sun, clouds, mountains seen from the side, a side or isometric view, "
         "perspective receding into the distance; characters, people, creatures, animals, monsters, skeletons, "
         "vehicles, units; standing buildings or castles seen from the side; text, letters, numbers, runes that "
         "read as writing, logos, signature, watermark, border, frame, vignette, UI, icons, grid, hex tiles, map "
         "markers; bright highlights, white or near-white areas, neon saturation, high contrast, a sharp focal "
         "point, busy fine detail; ANY landmark, ruin, structure, glow or detail in the TOP-LEFT QUARTER; a box, "
         "edge, frame, wall or border drawn around the top-left quarter; a straight dividing line, a wall, a "
         "fence, a road or a river between the quarters, a split-screen, three-panel, four-panel or grid look, "
         "mirrored or symmetrical quarters; anything at the dead centre of the frame, in the three outer corners "
         "or in the bottom strip; portrait or square framing; the recognisable style, characters or locations of "
         "any existing game, film or franchise.")


def prompt(ne, se, sw):
    if ne == se == sw:
        quarters = (f"TOP-RIGHT, BOTTOM-RIGHT AND BOTTOM-LEFT QUARTERS - all three are {CAP[ne].upper()} ground, "
                    f"one world for one team of three: {W[ne]} Give each of the three quarters its own landmarks "
                    "so the L never looks copied, tiled or mirrored.")
        seams = ("THE SEAMS - ONE CONTINUOUS ZONE, NO WALLS: the L that runs from the top-right down to the "
                 "bottom-right and across to the bottom-left is ONE unbroken piece of the same ground shared by "
                 "three allies - no seams, no dividing lines, no walls, no fences, no roads or river edges "
                 "between the quarters.")
    else:
        quarters = (f"TOP-RIGHT QUARTER (north-east) - {CAP[ne].upper()}: {W[ne]} "
                    f"BOTTOM-RIGHT QUARTER (south-east) - {CAP[se].upper()}: {W[se]} "
                    f"BOTTOM-LEFT QUARTER (south-west) - {CAP[sw].upper()}: {W[sw]}")
        seams = ("THE SEAMS - ONE CONTINUOUS ZONE, NO WALLS: the three worlds form ONE piece of ground shared by "
                 "three allies, an L that runs from the top-right down to the bottom-right and across to the "
                 "bottom-left. "
                 + seam(ne, se, "Where the top-right meets the bottom-right (along the right half of the horizontal middle)") + " "
                 + seam(se, sw, "Where the bottom-right meets the bottom-left (along the bottom half of the vertical middle)") + " "
                 "Each blend is gradual and irregular, roughly a tenth of the frame wide; never a straight line, "
                 "never a wall, a fence, a road, a river edge or a cliff line, never a split-screen or a three-panel "
                 "look. Each world stays clearly recognisable in the middle of its own quarter.")
    return (
        "One continuous battlefield ground covering a WHOLE game board, seen from high above: three allied worlds "
        "that flow into each other in an L-SHAPE around one quiet, empty quarter. Picture the frame cut into four "
        "equal quarters by an invisible cross through its exact centre (never draw the cross). "
        f"WHO GOES WHERE: TOP-RIGHT (north-east) = {CAP[ne].upper()}, BOTTOM-RIGHT (south-east) = {CAP[se].upper()}, "
        f"BOTTOM-LEFT (south-west) = {CAP[sw].upper()}, TOP-LEFT (north-west) = nobody. "
        "THE TOP-LEFT QUARTER IS NOT PART OF THIS SCENE - EXACT: the quarter from the left edge to the middle and "
        "from the top edge to the middle (x 0-50%, y 0-50% of the frame; in a 1376 x 768 frame that is x 0-688 px, "
        "y 0-384 px). In the game it is completely covered by a different picture. Fill it only with plain, dark, "
        "low-detail ground that quietly continues the colours of the two quarters beside it and fades toward "
        "near-black: no landmarks, no ruins, no structures, no glow, no focal point, nothing worth looking at. Do "
        "not draw a box, an edge, a wall or a border around it, and do not leave it flat solid black - it is soft, "
        "neutral ground that could be covered without anything being lost. Every landmark, ruin and glow in the "
        "image belongs in the other three quarters. "
        + quarters + " " + seams + " "
        "CAMERA AND FRAME - EXACT: a WIDE LANDSCAPE image, aspect ratio 16:9 (for example 1376 x 768) - the shape "
        "of the whole game board, never portrait, never square. Seen from HIGH ABOVE, almost straight down, like a "
        "painted map of the ground: ruins and objects show only a slight three-quarter tilt, and there is no sky, "
        "no horizon, no moon, no side view and no perspective receding into the distance. The only light is the "
        "faint glow coming from the ground itself. "
        "LAYOUT: the exact centre of the frame is a shared spawn portal that the game cuts out - keep a round "
        "area about a quarter of the frame height across, at the dead centre, plain and dark. The three outer "
        "corners (top-right, bottom-right, bottom-left), roughly an eighth of the frame width in from the side "
        "edge and a fifth of the frame height in from the top or bottom edge, are where castles stand - keep them "
        "plain and dark too. The bottom 8% of the frame lies under a toolbar - keep it plain. Put each world's "
        "two or three landmarks in the middle of its own quarter, between the centre and its corner. Nothing "
        "important touches the top-left quarter. "
        "A DARK, MOODY, LOW-CONTRAST environment backdrop for a game board, with no characters and no foreground "
        "clutter. Painted in a stylised cartoon-illustration style with soft ink linework and flat shading, a "
        "little more realistic and less saturated than a poster - muted, near-monochrome, atmospheric. IT MUST "
        "STAY DARK AND QUIET. Overall value is deep and shadowed, like ground lit only by moonlight or distant "
        "embers. NO bright passages, no white or near-white areas, no strong highlights, no hard focal point, no "
        "busy detail, nothing that would compete with brightly coloured game pieces drawn on top of it. Think of "
        "it as a faded mural seen through darkness. No characters, no people, no creatures, no animals, no "
        "vehicles. No text, no lettering, no words, no logo, no border, no frame, no vignette, no UI, no map "
        "markers. Fills the entire frame edge to edge with no margin and no letterboxing. An original world, not "
        "the look of any existing game, film or franchise. " + AVOID
    )


def fname(c):
    return 'Team3_' + '_'.join(CAP[r] for r in c) + '.jpg'


def shipped(c):
    return 'zone-team3-' + '-'.join(c) + '.png'


def refs(c):
    ne, se, sw = c
    out = [f'{DL}\\{CAP[ne]}X{CAP[se]}.jpg']
    r2 = f'{DL}\\{CAP[se]}X{CAP[sw]}.jpg'
    if r2 not in out:
        out.append(r2)
    return out


ROWS = [(i + 1, c) for i, c in enumerate(combos)]
COUNTS = {k: sum(1 for _, c in ROWS if kind(c) == k) for k in ('three races', 'pair + one', 'same race')}
assert COUNTS == {'three races': 20, 'pair + one': 30, 'same race': 6}, COUNTS

SPEC = [
    ("Layout (owner R195-T2)", "3v1: the solo player is ALWAYS top-left (NW, where player one sits). The team of three holds "
     "<b>NE + SE + SW</b> as one continuous L with no walls between them. SE is the elbow: it borders both teammates; "
     "NE and SW touch each other only at the quarry."),
    ("Region one image covers", "The <b>WHOLE board</b>, 1920 x 1080 world px (16:9, <code>constants.ts:95-96</code>). Quarters are "
     "960 x 540 each, clock order 0 = NW, 1 = NE, 2 = SE, 3 = SW (<code>zoneBackgroundRenderer.ts:308-320</code>). The NW quarter "
     "(x 0-960, y 0-540) is covered in game by the solo player's own race art."),
    ("What to ask Gemini for", f"<b>Landscape 16:9</b>, e.g. <b>{REQ_W} x {REQ_H}</b> - the size gemini-3-pro-image returned for the "
     "six S165 4-player masters (<code>assets-source/race-zones/zone-*-4p.png</code>). Never portrait, never square."),
    ("The NW quarter, exactly", f"x 0-50%, y 0-50% of the frame = <b>x 0-{NW_W}, y 0-{NW_H} px</b> at {REQ_W} x {REQ_H} "
     "(= x 0-960, y 0-540 on the board). If Gemini returns another size it is always the top-left W/2 x H/2."),
    ("Crop + resize (wiring tree)", "Cover-scale to 1920 x 1080, centre-crop (1376 x 768 loses ~0.4% each side), LANCZOS-resize "
     "to <b>960 x 540 PNG RGB</b> - half resolution, the same rule as every shipped zone image (the S166 texture-memory fix)."),
    ("Keep plain (measured)", "Centre: quarry disc r = 127 at (960,540) is punched out (about a quarter of the frame height "
     "across). Outer corners: castles at (1790,130), (1790,950), (130,950). Bottom 84 px: footer bar (y 996-1080, 7.8%)."),
    ("Brightness gate", "Shipped zone art: mean max-channel 22-41 / 255, zero px &gt; 200. Your 2v2 set measured 27-49. Check below."),
    ("Where files go", f"You: download full size into <code>{DL}</code> (same as the 2v2 set) as <code>Team3_&lt;NE&gt;_&lt;SE&gt;_&lt;SW&gt;.jpg</code>, "
     "e.g. <code>Team3_Demons_Mummies_Nagas.jpg</code>. Shipped (later, wiring tree): <code>public/art/race-zones/zone-team3-&lt;ne&gt;-&lt;se&gt;-&lt;sw&gt;.png</code>."),
]

SEAT_RULE = ("Sort the three teammates by the fixed race order Demons &lt; Mummies &lt; Nagas &lt; Orcs &lt; Vampires &lt; Zombies "
             "(alphabetical, the same order the 2v2 file names use). The first goes <b>NE</b> (top-right), the second <b>SE</b> "
             "(bottom-right, the elbow), the third <b>SW</b> (bottom-left). Teammates of the same race are interchangeable.")

PROC = """from PIL import Image
import numpy as np
im = Image.open(SRC).convert('RGB')            # e.g. Downloads/Team3_Demons_Mummies_Nagas.jpg
w, h = 1920, 1080
s = max(w / im.width, h / im.height)
im = im.resize((max(w, round(im.width * s)), max(h, round(im.height * s))), Image.LANCZOS)
l, t = (im.width - w) // 2, (im.height - h) // 2
im = im.crop((l, t, l + w, t + h)).resize((960, 540), Image.LANCZOS)
im.save(DST, optimize=True)                     # public/art/race-zones/zone-team3-<ne>-<se>-<sw>.png
a = np.asarray(im).max(axis=2)
print('mean', a.mean(), 'px>200', (a > 200).sum())          # gate: mean ~22-49, zero px > 200
q = {'NW': a[:270, :480], 'NE': a[:270, 480:], 'SE': a[270:, 480:], 'SW': a[270:, :480]}
print({k: round(float(v.std()), 1) for k, v in q.items()})  # NW should be the calmest (lowest std)"""

WIRING = [
    "The renderer draws every backdrop at <b>0.55 alpha</b>, so the solo player's NW sprite does NOT hide what is under it. "
    "The bake (<code>punchPortal</code>) must erase the team image's NW quarter as well as the quarry, or the team art bleeds through the solo's world.",
    "<code>arrangeTeamSeats</code> (<code>src/state/teams.ts:141</code>) never moves seat 0 (the host). In a 3v1 where the host is IN the trio, "
    "today's seating cannot put the solo in NW as R195-T2 requires. The wiring tree has to re-seat (or mirror the image - the straight-down "
    "camera makes an X/Y flip legal, which moves the empty quarter to any corner; the canonical race order then maps onto the flipped slots).",
    "<b>Seats are not equal:</b> NE and SW each border the solo; SE borders only teammates. The race-order rule therefore always gives the "
    "alphabetically-middle race the sheltered elbow. If the owner wants seat choice free, see the alternatives under the count.",
    "Bake key must include the team composition (the image differs per trio), and the shipped file is 960 x 540 (one texture, ~2.1 MB decoded, "
    "vs ~1.6 MB for three 480 x 270 quadrants today).",
]

GEN_STEPS = [
    "Open gemini.google.com, start a <b>new chat for every image</b>, pick the image tool with the Pro / Thinking model (Nano Banana Pro) - the family the originals and your 2v2 set came from.",
    "Recommended: attach the two 2v2 images listed on the card (your own finished <code>&lt;A&gt;X&lt;B&gt;.jpg</code> files) and add: <i>\"Use the attached images ONLY for palette, materials, level of detail and camera - not for their layout or framing.\"</i>",
    "Paste the prompt. If the result is not wide: reply <i>\"Same image, but as a wide landscape 16:9 frame.\"</i> If the top-left has anything in it: <i>\"Same image, but make the top-left quarter plain, dark, empty ground with nothing in it.\"</i>",
    "2-4 tries per trio, keep the best. Download at full size (download button, not a screenshot) and save with the card's file name.",
    "Tick the card. When a batch is done, send the folder path to a session; it crops, resizes, runs the checks and wires.",
]
REJECT = [
    "Anything in the top-left quarter: a ruin, a glow, a landmark, a character, or a visible box/edge around it.",
    "A wall, road, river, fence or straight line between the three team quarters, or a three-panel / split-screen look.",
    "A race in the wrong quarter (check the card: NE, SE, SW).",
    "Sky, horizon, moon or a side-on view; portrait or square output.",
    "Bright or white patches, neon colour, a busy high-contrast picture; text, rune-letters, a watermark, a frame or a vignette.",
    "Landmarks at the dead centre, in the three outer corners or in the bottom strip.",
    "Anything that looks like a known game, film or franchise.",
]

# ------------------------------------------------------------------ markdown
md = []
md.append("# S195 - 3-PLAYER TEAM BACKDROP PROMPTS (3v1) - for the owner to generate by hand in Gemini\n")
md.append("Generated by the S195 ART tree, 2026-10-03, by `gen_team3.py` from the S192 2v2 sheet's worlds and seams (verbatim). "
          "Nothing was generated, nothing in `src` was edited. Desktop copy: `C:\\Users\\onesh\\OneDrive\\Desktop\\SPARK_Team3_Backdrop_Prompts.html`.\n")
md.append("Owner (S195, R195-T2): *\"if it's three players, they will be north-east, south-east, and south-west quadrants. And the one player "
          "against them will always be where player one is. So in the north-west ... This has to be an important technicality.\"* "
          "v1 needs NO 3-player art (each teammate keeps his own single-quadrant race art, walls removed); this sheet is the optional upgrade.\n")
md.append("## 1. Layout\n")
md.append("```\n+-----------------+-----------------+\n|  NW  (solo)     |  NE  team slot 1|\n|  NOT in image:  |                 |\n"
          "|  plain, covered |                 |\n+-----------------( Q )-------------+\n|  SW  team slot 3|  SE  team slot 2|\n"
          "|                 |  (the elbow)    |\n+-----------------+-----------------+\n   Q = quarry disc, cut out of every backdrop\n```\n")
md.append("## 2. Target spec (measured, not carried)\n")
md.append("| | |\n|---|---|")
for k, v in SPEC:
    md.append(f"| {k} | {v.replace('<b>', '**').replace('</b>', '**').replace('<code>', '`').replace('</code>', '`').replace('&lt;', '<').replace('&gt;', '>')} |")
md.append("\nBoard facts used: canvas 1920x1080 (`constants.ts:95-96`); quarry (960,540) r=125, cut r=127 (`constants.ts:137-139`, "
          "`zoneBackgroundRenderer.ts` `PORTAL_CUT_RADIUS`); footer 84 px, `FOOTER_TOP_Y` 996 (`constants.ts:637-638`); 4p castle anchors "
          "(130,130) (1790,130) (1790,950) (130,950) (`zones.ts` `ANCHORS`); zone rects + clock order (`zoneBackgroundRenderer.ts:308-320`); "
          "renderer cover-fits at `ZONE_BG_ALPHA` 0.55; 4p masters 1376x768 and shipped 480x270 (measured with PIL this session); the owner's "
          "2v2 files measured 784x1168, mean max-channel 27.0-48.9.\n")
md.append("## 3. How many images\n")
md.append("- Any race in any of NE/SE/SW: ordered triples = 6^3 = **216**.\n"
          "- Free choice of which race takes the elbow (SE), NE/SW sorted: 6 + 30x2 + 20x3 = **126**.\n"
          "- **RECOMMENDED: canonical seating -> multisets = C(8,3) = 56** (6 same-race + 30 pair-plus-one + 20 all-different).\n")
md.append("**Canonical seat rule (recommendation for the owner):** " + SEAT_RULE.replace('&lt;', '<').replace('<b>', '**').replace('</b>', '**') + "\n")
md.append("No flip trick reduces 56 further: swapping NE and SW would need a transpose, which a 16:9 frame cannot survive.\n")
md.append("## 4. Wiring notes (NOT done here - for the teams tree)\n")
for w in WIRING:
    md.append("- " + w.replace('<b>', '**').replace('</b>', '**').replace('<code>', '`').replace('</code>', '`'))
md.append("\n### Processing (per received file)\n\n```python\n" + PROC + "\n```\n")
md.append("## 5. How to generate in Gemini\n")
for i, s in enumerate(GEN_STEPS, 1):
    md.append(f"{i}. " + s.replace('<b>', '**').replace('</b>', '**').replace('<code>', '`').replace('</code>', '`').replace('<i>', '*').replace('</i>', '*').replace('&lt;', '<').replace('&gt;', '>'))
md.append("\nReject if:")
for r in REJECT:
    md.append("- " + r)
md.append("\n## 6. Image list (56)\n")
for n, c in ROWS:
    md.append(f"- #{n:02d} NE {CAP[c[0]]} / SE {CAP[c[1]]} / SW {CAP[c[2]]} -> `{fname(c)}` -> `{shipped(c)}` ({kind(c)})")
md.append("\n## 7. Prompts\n")
for n, c in ROWS:
    md.append(f"### #{n:02d} NE {CAP[c[0]]} + SE {CAP[c[1]]} + SW {CAP[c[2]]} -> `{fname(c)}`\n")
    md.append("Style refs: " + ", ".join(f"`{r}`" for r in refs(c)) + "\n")
    md.append("```text\n" + prompt(*c) + "\n```\n")
open(os.path.join(OUT, 'S195_TEAM3_BACKDROP_PROMPTS.md'), 'w', encoding='utf-8', newline='\n').write("\n".join(md))

# ------------------------------------------------------------------ html
e = html.escape
CSS = open(os.path.join(HERE, 'css.txt'), encoding='utf-8').read()
H = []
H.append('<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n'
         '<title>SPARK Trio Backdrops</title>\n<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&family=Space+Grotesk:wght@500;600&display=swap" rel="stylesheet">\n'
         '<style>\n' + CSS + '\n</style></head>\n<body><div class="wrap">\n')
H.append('<header class="top"><h1>SPARK <b>3-Player Team Backdrops</b></h1>\n'
         '<p class="lede">Gemini prompts for the 3v1 team backdrops. The solo player always sits top-left (north-west, where player one is). '
         'The team of three holds the other three quarters - top-right, bottom-right, bottom-left - as one continuous L with no walls. '
         'Each image is the <b>whole board</b>, wide 16:9, and its top-left quarter must stay plain because the solo player\'s own art covers it. '
         'Recommended: <b>56 images</b>, one per race trio, with the seat rule below. None are needed for v1 - teammates keep their own quadrant art until these exist.</p></header>\n')
# diagram
H.append('<h2>The layout - the important technicality</h2>\n<div class="diagram">'
         '<svg viewBox="0 0 330 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Board layout: top-left is the solo opponent, the other three quarters are the team">'
         '<defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#4a5163" stroke-width="2"/></pattern></defs>'
         '<rect x="5" y="5" width="320" height="180" rx="4" fill="#1b1e27" stroke="#4a5163"/>'
         '<rect x="5" y="5" width="160" height="90" fill="url(#hatch)" opacity=".7"/>'
         '<path d="M165 5 H325 V185 H5 V95 H165 Z" fill="#8fd3ff" opacity=".13"/>'
         '<path d="M165 5 H325 V185 H5 V95 H165 Z" fill="none" stroke="#8fd3ff" stroke-width="2"/>'
         '<line x1="165" y1="95" x2="325" y2="95" stroke="#8fd3ff" stroke-dasharray="3 5" opacity=".5"/>'
         '<line x1="165" y1="95" x2="165" y2="185" stroke="#8fd3ff" stroke-dasharray="3 5" opacity=".5"/>'
         '<circle cx="165" cy="95" r="21" fill="#0b0c10" stroke="#4a5163"/>'
         '<text x="85" y="45" fill="#e7e9ee" font-size="13" font-weight="600" text-anchor="middle" font-family="Inter,sans-serif">NW - SOLO</text>'
         '<text x="85" y="62" fill="#9aa0ad" font-size="10" text-anchor="middle" font-family="Inter,sans-serif">his own art covers it</text>'
         '<text x="85" y="76" fill="#9aa0ad" font-size="10" text-anchor="middle" font-family="Inter,sans-serif">keep plain in the image</text>'
         '<text x="245" y="48" fill="#e7e9ee" font-size="13" font-weight="600" text-anchor="middle" font-family="Inter,sans-serif">NE - slot 1</text>'
         '<text x="245" y="142" fill="#e7e9ee" font-size="13" font-weight="600" text-anchor="middle" font-family="Inter,sans-serif">SE - slot 2</text>'
         '<text x="245" y="158" fill="#9aa0ad" font-size="10" text-anchor="middle" font-family="Inter,sans-serif">the elbow</text>'
         '<text x="85" y="142" fill="#e7e9ee" font-size="13" font-weight="600" text-anchor="middle" font-family="Inter,sans-serif">SW - slot 3</text>'
         '<text x="165" y="99" fill="#9aa0ad" font-size="9" text-anchor="middle" font-family="Inter,sans-serif">quarry</text>'
         '</svg>'
         f'<p>One continuous scene runs through the blue L - top-right, bottom-right, bottom-left - and blends softly across the two dotted seams. '
         f'The hatched top-left quarter is <b>x 0-50%, y 0-50%</b> of the image (<b>x 0-{NW_W}, y 0-{NW_H} px</b> at {REQ_W} x {REQ_H}): plain, dark, low-detail ground with nothing in it. '
         'Every prompt names which race goes in NE, SE and SW and repeats this rule. The centre disc (the quarry) and the three outer corners (castles) stay plain too.</p></div>\n')
H.append('<h2>Technical spec</h2>\n<div class="spec">' + ''.join(f'<div>{k}</div><div>{v}</div>' for k, v in SPEC) + '</div>\n')
H.append('<h2>How many images - 56 recommended</h2>\n<div class="cols"><div class="box"><h4>The count</h4><ul>'
         '<li>Any race in any of NE / SE / SW: 6 x 6 x 6 = <b>216</b>.</li>'
         '<li>Free choice of which race takes the elbow (SE): 6 + 30 x 2 + 20 x 3 = <b>126</b>.</li>'
         '<li><b>Recommended: the game seats a trio by a fixed rule, so one image per race trio = C(8,3) = 56</b>: 20 with three different races, 30 with a pair plus one, 6 all one race.</li>'
         '<li>No flip trick cuts this further: swapping NE and SW would need a transpose, which a wide frame cannot survive.</li></ul></div>'
         f'<div class="box"><h4>The seat rule (recommendation - your call)</h4><p style="margin:6px 0 0">{SEAT_RULE}</p>'
         '<p style="margin:8px 0 0;color:var(--mut)">Trade-off to know: NE and SW each border the solo player, SE borders only teammates. With this rule the middle race in the order always gets the sheltered elbow. If that matters, it is 126 images (you pick the elbow) or 216.</p></div></div>\n')
# index grid
H.append('<h2>All 56 at a glance</h2>\n<div class="chips">')
for n, c in ROWS:
    cid = '-'.join(c)
    H.append(f'<a class="chip" href="#card-{cid}" data-card="{cid}"><span class="num">#{n:02d}</span> '
             + ' '.join(f'<i style="background:{COL[r]}"></i>' for r in c) + f' {CAP[c[0]][:3]}/{CAP[c[1]][:3]}/{CAP[c[2]][:3]}</a>')
H.append('</div><p class="legend">Chips read NE / SE / SW. Green = done (saved in this browser).</p>\n')
H.append('<h2>How to generate in Gemini</h2>\n<div class="cols"><div class="box"><h4>Steps</h4><ol>' + ''.join(f'<li>{s}</li>' for s in GEN_STEPS) + '</ol></div>'
         '<div class="box"><h4>Reject if</h4><ul>' + ''.join(f'<li>{e(r)}</li>' for r in REJECT) + '</ul></div></div>\n')
H.append('<h2>Prompts</h2>\n<div class="progress"><span id="pcount">0 / 56 done</span><div class="bar"><i id="pbar"></i></div></div>\n')
for n, c in ROWS:
    cid = '-'.join(c)
    ne, se, sw = c
    H.append(f'<article class="card" id="card-{cid}" style="--a:{COL[ne]};--b:{COL[se]};--c:{COL[sw]}">\n'
             f'  <header><label class="tick" title="Mark done"><input type="checkbox" data-id="{cid}" aria-label="Mark #{n:02d} done"><span></span></label>'
             f'<span class="swatch"><i></i><i></i><i></i></span><div class="ttl"><div class="row1"><span class="num">#{n:02d}</span>'
             f'<h3>NE {CAP[ne]} &middot; SE {CAP[se]} &middot; SW {CAP[sw]}</h3><span class="badge">{kind(c)}</span></div>'
             f'<div class="sub">Top-left stays empty (solo opponent). Top-right {CAP[ne]}, bottom-right {CAP[se]}, bottom-left {CAP[sw]}.</div>'
             f'<div class="file">Save as <code>{e(fname(c))}</code> &middot; style refs: ' + ', '.join(f'<code>{e(r)}</code>' for r in refs(c)) + '</div></div></header>\n'
             f'  <pre class="prompt" id="p-{cid}">{e(prompt(*c))}</pre>\n'
             f'  <div class="actions"><button class="copy" data-target="p-{cid}">Copy prompt</button><span class="ok" aria-live="polite"></span></div>\n</article>\n')
H.append('<details class="box" style="margin-top:24px"><summary><b>For the wiring session (not you)</b></summary><ul>' + ''.join(f'<li>{w}</li>' for w in WIRING) + '</ul>'
         f'<pre class="neg">{e(PROC)}</pre></details>\n')
H.append('<footer>S195 ART tree &middot; worlds and seams verbatim from the S192 2v2 sheet; geometry measured from <code>src/constants.ts</code>, '
         '<code>src/state/zones.ts</code>, <code>src/render/zoneBackgroundRenderer.ts</code>, <code>src/state/teams.ts</code>. '
         'Plain-text copy: <code>.claude/plans/S195_TEAM3_BACKDROP_PROMPTS.md</code>.</footer>\n</div>')
H.append(open(os.path.join(HERE, 'js.txt'), encoding='utf-8').read())
H.append('</body></html>\n')
open(os.path.join(OUT, 'S195_TEAM3_BACKDROP_PROMPTS.html'), 'w', encoding='utf-8', newline='\n').write(''.join(H))
print('ok', len(ROWS), COUNTS)
