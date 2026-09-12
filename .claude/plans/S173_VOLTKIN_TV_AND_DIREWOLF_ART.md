# S173 — THE VOLTKIN TV, AND THE DIREWOLF: WHAT TO GENERATE

**STATUS: SPEC CAPTURED. Blocked on the source images reaching disk.** Written the moment he
described it, because the sequence he wants is NOT what either of his reference sheets shows on its
own — it is a recombination of the two, and that detail is exactly what a later session would lose.

---

## ⭐ THE RULE THAT DECIDES EVERYTHING BELOW

`ART_PIPELINE.md` — and it is the trap this project has already paid for once:

> **A UNIT** (creature) needs MOTION: `idle`, `walk`, `attack`, `die` — 12 frames each, 4 clips.
> **A BUILDING** (tower) needs DAMAGE STATES: `intact`, `damaged`, `destroyed` — plus, ideally, a
> `spawning` build-up.
> ⚠ *"These are not interchangeable, and confusing them wastes a whole round."*

So his question — *"Are we gonna do it for each of the states or just for the one state? Do we even
need the three states?"* — has a clean answer, and it is different for the two things he generated:

| what | kind | what it needs | what he generated |
|---|---|---|---|
| **the direwolf** | UNIT | 4 MOTION clips from ONE seed | healthy/hurt/dead — a BUILDING shape |
| **Voltkin** | UNIT | 4 MOTION clips from ONE seed | healthy/hurt/dead — a BUILDING shape |
| **the TV** | BUILDING | states + 2 cinematics | ✅ states — the right shape |

⇒ **For both CREATURES: we need ONE still, the healthy pose, and four motion clips from it. The
hurt/dead stills are not states a unit uses.** The dead pose is still useful as a REFERENCE for
where the `die` clip must come to rest — that is all.

---

## 1 · THE DIREWOLF — 4 clips, seeded off `assets-source/direwolf/direwolf-healthy.png`

Already cut out and in the repo. One seed, four clips:

- **idle** — stands, breathing, ears twitching, head scanning. ⭐ His idea, worth taking: *"maybe
  when he's summoned, they howl."* That is a SUMMON one-shot, not the idle loop — park it as a
  separate clip if he wants it, because an idle that howls every 2 s becomes noise.
- **walk** — *"running, following his Orc Warlord"* — a loping run to the right, level, repeating.
- **attack** — ⛔ **A WOLF BITES.** Lunges and snaps, jaws as the weapon. Verbs that involve hands
  make the generator hand the creature a prop; that cost this project three re-rolls on the castle
  vampire.
- **die** — must be DOWN by the halfway point and END STILL, ON THE GROUND, IN FRAME. The
  `direwolf-dead.png` pose is the reference for the final frame.

## 2 · VOLTKIN THE CREATURE — 4 clips, seeded off his healthy still

> *"remember he has zap attacks. He's lightning god, basically. So he has the zap attacks, then
> running, then idle."*

- **idle** — stands, arcs of lightning crawling over him, breathing.
- **walk** — his run.
- **attack** — the ZAP. Lightning discharge from the body/hands; no melee swing.
- **die** — collapses, the lightning guttering out.

## 3 · ⛔ THE TV — HIS SEQUENCE, WHICH NEITHER SHEET SHOWS CORRECTLY

He was explicit that image 2's ordering is wrong: *"the second image… full view, the critical, the
spawn, and the ruins — is not really coherent with the whole thing."* The true sequence is:

1. **BUILT / INTACT** — the whole TV, screen live. (image 3 `FULL VIEW` / `FRONT`)
2. **SPAWN** — ⭐ *"the TV is built, and then it BREAKS because he's coming out of it."* Voltkin
   bursts through the screen. (image 2 `STAGE 3 - SPAWN`)
3. **STANDING (the long-lived state)** — ⭐ **this is the one that matters most and the one neither
   sheet labels correctly.** *"then it's kind of like burning, and then it KEEPS BURNING LIKE THAT
   until someone destroys it."* After the spawn the TV does not return to intact and does not fall
   over — it stands broken and burning for the rest of its life. (image 3 `STAGE 1 - DAMAGED`)
4. **DESTRUCTION**, when an enemy finally kills it — a three-beat cinematic:
   `STAGE 2 CRITICAL` → `STAGE 3 EXPLOSION` → `STAGE 4 RUINS` (all from image 3).

**Mapping onto the engine's existing tower states:**

| engine state | his art |
|---|---|
| `intact` | the whole TV |
| `damaged` | **the burning post-spawn TV** — its normal appearance for most of the match |
| `destroyed` | the ruins |
| `spawning` row | ⭐ already exists in the tier-3 sheets and **no code can draw it** — this is where the spawn cinematic goes, and it is half-paid-for |

Plus **two cinematics**: the SPAWN (Voltkin emerging) and the DESTRUCTION (critical → explosion →
ruins). The crumble cinematic path already exists — `TowerRenderer` has `destroyRows` and plays a
per-race crumble, so destruction has a home. The SPAWN one does not yet.

### ⛔ AND THE CUTSCENE COMES OUT

> *"you know how now there is the cutscene where you can see kind of a TV, and it stops the whole
> game — we'll remove that and just make it like a cool animation inside the game without a
> cutscene. Kind of like any of the other ones we have. It'll be better."*

The Voltkin summon currently halts play. It becomes an in-world animation at the structure, like
every other tower cinematic. That is a CODE change, not an art one, and it is separable from the art.

### What he does NOT want generated

> *"There's a few TVs where you can see the side and the back. That's silly, we don't need those.
> Or the scale. That's stupid too."*

Drop `SIDE`, `BACK`, `SCALE` from the sheet. The game draws one camera angle.

---

## ⛔ THE BLOCKER RIGHT NOW

The direwolf images reached disk; **the Voltkin and TV images did not.** They are attached to the
chat, which is not a filesystem — they cannot be seeded into image-to-video from there.

**He needs to save them to** `C:\Users\onesh\OneDrive\Desktop\GeneratedImagerySpark\` (where the
direwolf pair landed), and then they can be cut out and used as seeds.

⚠ Note on generation: `ART_PIPELINE.md` stage 3 has the OWNER generating clips, and the standing cost
note records that he wants video run on HIS accounts rather than paid API. He has now said *"just
generate the videos"* — which supersedes that for this batch, but it is worth confirming he means
paid-API generation, because the cost note was his own.
