**STATUS: APPROVED BY OWNER — IN PROGRESS**

# S177 BATCH PDR — the owner's playtest list (8 priorities)

Tier: **Full** (8 priorities, >30K). Owner approval, verbatim: *"I approve the full session priority
batch."* Phase A.0 was run BY HAND (the 8-lane fan-out was dispatched and had returned nothing by
the time the probes were finished — S161 rule: the hunt is an accelerator, never the deliverable).

---

## OBJECTIVE

Close the eight defects the owner reported from his first playtest of S175/S176, correcting the
places where the shipped code diverges from rulings he had already given.

## PHASE A.0 — STATE DISCOVERY (every row measured, not assumed)

| # | his words | what the tree actually says | evidence |
|---|---|---|---|
| P1a | towers show "167 … like a thousand" | `GOBLIN_DAMAGE_VS_PRIMITIVE = 167`. A SHAPE has `PRIMITIVE_MAX_HP = 1000`; a creature has a pool in FIFTHS. The damage-number renderer prints each in its own unit. A boss at 12 atk prints `primitiveDamageForAtk(12)` ≈ 1002. | `constants.ts:2811,2833`; `damageNumbers.ts:384`; `stats.ts:175` |
| P1b | "I already defined a different correct method" | **R173-A/B/C, RULED S173, NEVER IMPLEMENTED.** `connectorCapacityFifths(n) = n+4` (DEF = n−1) and damage banks PER-BOND. | `.claude/plans/S173_R173_STRUCTURE_HP_RULING.md`; `stats.ts:224,236` |
| P2 | direwolf / Vlad / goblin hound legs ~4× too fast | walk `ticksPerFrame`: **direwolf 3**, **goblin-hound 3**, **Vlad (t9boss-vampires) 4**. Every other unit is 4. Cadence is baked into the shipped `*-anim.json`. | `assets-source/*/atlas-specs.json`; `build-sprite-atlas.mjs:614` |
| P3 | "world lord … max 3 … every 30 s" | "World Lord" = the Orc **WARLORD**. `DIREWOLF_SUMMON_COUNT = 3`, `DIREWOLF_SUMMON_INTERVAL_TICKS = 15 s`, `DIREWOLF_MAX_PER_OWNER = 6`. No cull of the previous wave. | `constants.ts:2451,2452,2473`; `bossSkillsWarlord.ts` |
| P4 | TV must run "the whole loop" | ⛔ **EVERY TV ROW IS ONE STILL.** Shipped manifest: `"frames": 1` on all six rows; the spec's `framesPerState: 1`; the renderer `cut()`s ONE `Texture` per row. There are no TV clips — `clips/` holds only the Voltkin character's mp4s. The destruction beat fires when the CHAIN reads destroyed, not on the first connector. | `public/art/voltkin-tv/voltkin-tv-anim.json`; `voltkinTowerRenderer.ts:194`; `atlas-specs.json` |
| P5 | poop bags "should be one hit" | `STINK_BAG_HP=1, STINK_BAG_DEF=0` ⇒ pool **5 fifths**. A goblin deals `attackFifths(2,0)` = **10**. **They are already a one-hit kill.** His requested 1×1.2 would RAISE it to 6. The bag arm is the 5th branch of the attack chain. | `constants.ts:3202`; `stinkCloud.ts:98`; `creatureAttack.ts:364` |
| P6 | fight +15 s; 1500 → 2500 | `FIGHT_PHASE_TICKS = 45×60 = 2700`. `PHASE_1_WIN_SCORE = 1500`. Win fires at `floor(scoreProgress) ≥ PHASE_1_WIN_SCORE`. ⚠ `scoring.test.ts:375` asserts `WIN / SCORE_TIER_STEP === 3`; 2500/500 = 5 ⇒ **RED**. | `constants.ts:415,382`; `gameState.ts:174` |
| P7 | laser 2× attack speed | `TURRET_FIRE_INTERVAL_TICKS = 450` — **already halved twice** (1800→900 S157, →450 S173, both his). | `constants.ts:2997` |
| P8 | Helga 2× HP + 2× def | `PRINCESS_HP = 6`, `PRINCESS_DEF = 4`, `PRINCESS_ATK = 4`, `PRINCESS_PEN = 4`. Pool `unitPoolFifths(6,4)` = **54 fifths**. | `constants.ts:2071-2074` |

### DELTAS REQUIRING AN OWNER WORD (surfaced BEFORE execution)

- **D1 (P1a).** In S174 he ruled the opposite of what he said today — that shapes (1000) and castles
  (1500) ARE separate systems and towers have "no scale problem". That ruling is quoted in
  `damageNumbers.ts:363`. Recommendation: keep the pools, **normalise the DISPLAY** onto the unit
  ladder, so the same attacker prints the same number on a unit, a connector, a shape or a keep.
- **D2 (P5).** Bags are already one-hit. His stated fix makes them tougher. The six seconds is an
  attack-ORDER problem, not an HP problem.
- **D3 (P6).** 2500 breaks the exact-thirds invariant. Recommend re-pinning to fifths (5×500).
- **D4 (P4).** A real emergence animation needs art that does not exist.

## SCOPE

`constants.ts` · `stats.ts` + connector damage path · `damageNumbers.ts` · creature walk-cadence
override · `bossSkillsWarlord.ts` · `voltkinTowerRenderer.ts` · the tests pinning every number above.

## TESTING

`npm run typecheck` · `npx vitest run` · `npm run e2e:gating` · `npm run e2e:races` · `npm run build`
· `npm run check:atlas` · `npm run verify-deploy` — each read from a captured `$?`, never through a
pipe, never from the wrapper's trailing line.

## PROTOCOL

`PROTOCOL_VERSION` **46 → unchanged**. Every item is a constant, a renderer, or an arithmetic change
inside fields already serialized and hashed. No new discriminant, no new required wire field.
R173-B reuses `Bond.damageFifths` (already serialized + hashed) summed across the component.

## RISK

R173-B moves the balance of every structure in the game (5-connector hub: 35 → 130 fifths, 3.7×).
Tests pinning the old arithmetic go red BY DESIGN and must be RE-PINNED, never silenced.
