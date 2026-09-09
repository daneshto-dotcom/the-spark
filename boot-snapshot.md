# BOOT SNAPSHOT — after S170 (2026-09-09)

Read `HANDOFF_S170_2026-09-09.md` for the full picture; this is the 30-second version.

## Where the code is
`master`, clean, pushed, 0 unpushed. Live at spark-online.space, `verify-deploy` 4/4.
`PROTOCOL_VERSION` **45** (unchanged — the one field added this session is additive-optional).
Gates at close: typecheck 0 / vitest **4202 across 267 files** / e2e:gating 65 / e2e:races 5 /
check:atlas 30 clean / build 814 KiB of 900 / MCV 75 bindings hard_fail=0.

## ⛔ FIRST: THE OWNER MUST LOOK AT THE FOG
It was rebuilt **four times** this session and he confirmed the last one ("ok better"), but the
OUTCOME is not machine-verified and the reason is logged in `e2e/fog.spec.ts`: Pixi implements alpha
masks as filters and `renderer.extract` does not apply filter effects, so the harness cannot read a
composed frame. The culling itself IS unit-tested (`concealment.test.ts`, 12 tests).
If anything enemy-owned is still visible during BUILD, the hook is now **one line per renderer** —
`isConcealed(x, y, owner)` from `render/concealment.ts`.

## The next things, in order

1. **DISCUSS P11 — the tower/connector consolidation.** FULLY SPECIFIED (R169, all four questions
   answered, recovered verbatim from the S169 transcript). Build → pulsate ~2 s → per-race build
   cinematic → **only the tower** (connectors vanish, still simulated and raidable; the TOWER is the
   raid target) → damage shows on the tower via one aggregated bar over per-connector HP → destroyed
   → per-race destroy cinematic → **connectors reappear** → click the tower middle or any connector
   for FIX/SCRAP. Repair/scrap already exists — this is a REPOINT, not a new mechanic.
2. **THE PHARAOH (R142)** — locust cone + unkillable Ra channel. ⛔ First close **six** paths that
   bypass the untargetable gate (verified this session): `bossSkillsKraken.ts:75`,
   `controls.ts:1430` (the player's own right-click raid pick), `bossSkillsArchdemon.ts:103`,
   `voltkinChain.ts:92`, `seagullLifecycle.ts:254`, and acquisition-only RETENTION. Latent only
   because nothing sets the flag yet — the ritual will.
3. **REDO VOLTKIN COMPLETELY** — the ask S169's compaction lost entirely. He supplied new art. He
   also has no death animation and no build cinematic.
4. **BOSS VFX needing his generation rounds** — the zombie death burst done properly, the DIRE WOLVES
   (no art at all), the Warlord's rage stance, the Archdemon's pit and teleport. The code-only half
   shipped this session.
5. **P15 THE ART COST PIPELINE** — the other thing the compaction lost. He generates stills on
   ChatGPT + Gemini, wants video loops on HIS OWN accounts or free generators, one asset at a time.

## Blockers — owner decisions, not work
- **Vlad's tether**: the visual shipped, but **R140 as ruled has no victim** (pure self-heal, drains
  nobody). He asked for the Dota lifesteal LOOK, which implies a tether. Drawing one would paint
  damage that does not exist. ⇒ does the sap start draining a target? That is a MECHANIC change.
- **`FOG_SHROUD_ALPHA = 0.55`** is MINE. How dark unexplored terrain reads. One dial, tune it live.
- **Boss stats** are still mine; he ruled they must scale to each boss's skill load, which can only
  settle once the remaining skills land.

## Two traps that will bite
- ⛔ **Do NOT reach for a render trick on the fog again.** Three attempts (backdrop above the sheet,
  below it, then an inverse Pixi mask) all shipped GREEN and concealed nothing, because compositing
  and masks are invisible to this harness. The mechanism is per-entity culling. If you must change
  it, pick something the suite can assert.
- ⛔ **`fogHiddenLayer`'s child indices move whenever a renderer is added**, and
  `tower-art.spec.ts` hardcodes two of them (6 and 11). They moved four times this session. Draw new
  VFX into an EXISTING renderer's Graphics rather than adding a display object.
