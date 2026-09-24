# S176 — BATCH PDR

**Tier: Full** (>30K; art pipeline + renderer + two subsystems)
**STATUS: APPROVED BY OWNER — IN PROGRESS**
Approval, verbatim: *"I approve three and four"* … *"finish those two priorities that I've mentioned,
make them land, uh, check that they landed, then close off with a full handoff skill."*

---

## OBJECTIVE

Give the Voltkin a real, coherent animated life — idle, walk, attack, die — from the art the owner
already generated, plus a health bar; and finish the TV he lives in, including the destruction beat
and the frozen-emergence bug he photographed.

## PHASE A.0 — STATE DISCOVERY (COMPLETE, and it rewrote the batch)

Run partly by workflow (4 lanes, **all four died to the org spend limit — zero findings**) and then
**by hand in this session**, per the project's S161 rule that a hunt returning nothing is not a
completed hunt.

| # | claim on entry | what the disk says | consequence |
|---|---|---|---|
| 1 | "Voltkin attack + die cost ~$6.20 to re-roll" | All four clips exist and are git-tracked, dated 2026-09-12 21:08–21:17 | Cost re-derived below |
| 2 | "the new art I generated for him" | **Nothing on disk is newer than 2026-09-12 21:17** — no art landed today | The "new art" IS the S173 clips |
| 3 | walk recoverable at `sampleStart:36` | **VERIFIED** — frames 36–71 carry zero amputation and zero bars; the only bad frames (72, 79, 86, 87) fall after the window | walk = **$0** |
| 4 | `check-clip` passes idle ("no action needed") | **FALSE PASS.** It tests whether bars are *present* in all frames, never whether their *width* is constant. idle's bars ramp 318→104 across f0–f7 | idle needs `sampleStart` too |
| 5 | attack is unusable | The lightning discharge (f36–69) is the real attack but bolts leave the frame; the only amputation-free + scale-stable window is **f70–95**, the post-attack pose | see RISK-1 |
| 6 | die is unusable | True for the clip — the clean window (f44–55) is him *staggering*, the actual collapse is edge-hit and the background turns **grey** from ~f75 | **`voltkin-dead.png` as a `still`** — the direwolf pattern, $0 |
| 7 | Voltkin is drawn from art | **FALSE.** He is a procedural Pixi.Graphics puppet (`voltkinPose`→`drawVoltkin`) with a 2-still sprite path (`voltkin-idle.png`/`voltkin-zap.png`) over it. The atlas path was retired S107 | P1 is "give him an atlas", not "fix his animation" |
| 8 | the TV emergence animates | `spawning` is **one still**, `framesPerState: 1`, held while a voltkin is `SPAWNING` within 160 px | **the owner's frozen screenshot** |

**COST VERDICT: $0.00. No veo call is made this session.**

## SCOPE

**P1 — THE VOLTKIN, ALIVE.**
- `assets-source/voltkin-tv/atlas-specs.json` gains a `voltkin` character spec: idle/walk/attack
  from the clips at measured windows, `die` from `voltkin-dead.png` as a `still`
  (`stillHeightRatio` 0.581 = 412/709, measured off the source art).
- Pack, then **audition the sheet on the dark board colour** before believing it.
- `creatureRenderer` draws the packed atlas instead of the two stills; procedural rig stays as the
  fallback it already is.
- A health bar, via the existing `drawHealthBars` + the `SpriteBoxLookup` main.ts already wires for
  creatures that live in `CreatureRenderer`.

**P2 — THE TV, FINISHED.**
- SA-S176-1 (owner, mid-session, with a screenshot): the emergence is **stuck on one frame**. Give
  it real frames so he climbs out instead of posing.
- The destruction beat: `tv-4-critical` + `tv-5-explosion`, frame-driven and client-local
  (`TOWER_CRUMBLE_FRAMES` shape).
- Owner ruling, verbatim: *"then he waits by his TV that's broken, but it's not, like, you know,
  damaged or anything. You need to be very consistent about this."* → the TV he has burst out of is
  its NORMAL intact state. Damage rows are driven by damage, never by his emergence.

## OUT OF SCOPE (named, not silently dropped)
The ~6 bugs he is holding for next session — deliberately not researched, at his explicit
instruction, to protect the weekly budget. The 5 waived atlases. R173-B, B8, Pharaoh, Vlad, NONET.

## RISKS
- **RISK-1 — the attack window is a genuine fork.** f36–69 is the lightning (bolts off-frame, so the
  union bbox is frame-wide and he may pack tiny); f70–95 is clean but is the recovery pose, not a
  strike. Packing is free — pack it, LOOK at it, and take the one that reads as an attack. Record
  which, and why, at the spec.
- **RISK-2 — four sites.** A new atlas needs factory + serialize + hash + worker only if it touches
  state. It does not: this is renderer-only, derived from already-synced fields. **PROTOCOL_VERSION
  stays 46.** If that stops being true, the change is wrong.
- **RISK-3 — double-draw.** `voltkin` must NOT join `GOBLIN_KINDS`; `CreatureRenderer` owns it. Two
  renderers drawing one creature is the failure mode.

## TESTING
`npm run typecheck` · `npx vitest run` · `npm run build` · `npm run check:atlas` ·
`npm run e2e:gating` · `npm run verify-deploy` — every exit code read from a captured `$?`,
never from a wrapper line, never through a pipe.

## VERIFICATION (bound at priority close, then RUN)
Per-file assertions in `session-state.json.verification[]`; `verify-session-claims.py` must exit 0.
