# HANDOFF — S137 (2026-08-10)

**4 shipped, 1 carried. The gating lane is GREEN for the first time in two sessions (29/2 → 32/0), both
S136 failures fixed at the ROOT and neither quarantined. The owner's two pending playtest questions
are both answered — one with screenshots, one with measurements. P1 was deliberately NOT implemented
on a verified protocol blocker; its design shipped instead.**

Deploy verified 4/4 live (`index-D7oQlyv1.js`). git 0 ahead / 0 behind. Context at close 329,686 /
1,000,000 (33.0% GREEN).

---

## ✅ P0 — the gating lane is green (commit `2a3cd55`)

**fog.spec — the layer contract is now a ROLL CALL, not a count.**
The 14th `aboveFogLayer` child is **`gathererRenderer`** (`main.ts:506`), added in **S135** — so the
contract went stale then, not in S136. Attribution came from a static roll call of every
`parent.addChild` (sums to exactly 14) and was then **independently confirmed by measurement**: the
runtime type sequence has `_Container` at indices 1, 5 and 11, matching the roll call exactly.

Rather than bump 13→14, the assertion now pins the **ordered constructor names** with each line
naming its owning renderer. A bare count told you a number and nothing else — which is why
attributing one child cost a whole session. It also catches what a count structurally cannot: one
renderer leaking a second child while another adds none still sums to 14.

**hunter.spec — the spec's premise had gone stale.** Measured chain:

| # | file:line | fact |
|---|---|---|
| 1 | `gameMode.ts:271` | every seat starts at `STARTING_VICTORY_POINTS` = **100** |
| 2 | `scoring.ts:264` | `scoreProgress = max(scoreByPlayer)` → 100 immediately |
| 3 | `hunter.spec.ts:81` | forced `__TEST_HUNTER_TRIGGER_SCORE__ = 1` |
| 4 | `hostTick.ts:498` | `floor(100) >= 1` → **SPAWN_HUNTER on the first tick**, ~90 s early |

The spec's own line (`set(0, 5) // > trigger (1)`) proves its author believed score started at 0;
V6-1.2 added the opening balance and silently made that injection a no-op. It broke the test **twice**:
a benched player is fully input-locked (`controls.ts:345`) so the V6-1.3 castle-pull could not click
the keep, *and* the later wait for `count === 1` could never pass on an already-despawned hunter.
Seam raised to 200, injection to 250. **Production is untouched** — there the seam is
`floor(1500 × 0.75) = 1125`.

**How it was found matters more than the fix:** `pullFromBank`'s throw now reports all three
`isInputLocked()` clauses individually. One run then printed `lockedByBench: true`,
`benchedUntilTick: 1925` at tick 330, `hunters: []`. That converted a session of inference into a
single measurement.

**Also:** `__SPARK__.keepCenter` added; `helpers.ts` no longer transcribes `castleAnchor`'s formula
(the S50-P5 drift class). Verified prod-inert: entry hash unchanged, 0 occurrences in the bundle.

## ✅ P2 — the rainbow castle party, SEEN (commit `5eac4e4`)

`e2e/rainbow-castle.spec.ts` reads **real composited pixels** off the keep. Deterministic without a
real rainbow pickup: `rainbowSwitchTick` is back-dated to `tick - age`, and sync+extract run in ONE
`page.evaluate` so no rAF frame can interleave at a drifted age.

**I looked at the images, not just the green tick.** Resting = crimson keep (`0xff3b6b`); mid-party =
magenta, then orange, with the flyover wash recolouring the background in step. **It works and it
reads clearly — do not spend playtest time on it.** PNGs in `test-results/s137-rainbow-castle/`.

Two real defects found in the process: `testInfo.attach` images are **discarded** under
`--reporter=list` on a passing test (the first run produced no images at all despite passing), and
`page.screenshot`'s `clip` is CSS pixels while the canvas is letterboxed — a canvas-coord clip crops
the wrong region.

## ✅ P3 — the bank measured; the cap is NOT the knob (commit `98c2b72`)

Nothing tuned. `CASTLE_BANK_CAP` still ships as **5**. Full write-up:
`BANK_CAP_MEASUREMENT_S137.md`.

| cap | banked in 60 s | time-to-full | WAITING after saturation |
|----:|----:|----:|----:|
| **5** | 5 | 20.2 s | **88.7 %** |
| 6 | 6 | 19.4 s | **94.1 %** |
| 8 | 8 | 28.6 s | **90.8 %** |

**Raising the cap does not reduce stall** (~89–94 % at every cap), and total output over the run is
*exactly the cap* — a gatherer fills the bank once and then stops for good. So the binding constraint
is **CONSUMPTION, not capacity**; 5→8 buys ~3 shapes and ~8 s, not throughput. The cap's real job is
"which recipe can I hold outright" (pentagram 5 · lightningHub 6 · Helga 7 · Voltkin/laserTurret 8 ·
NONET 9) — which is why this decision and the build-space decision are the **same decision**.

⚠ **The first cut of this measurement was WRONG** and it is the most transferable lesson of the
session: at a 22 s window the cap-5 bank did not saturate until 20.2 s, so the run ended before any
stall could exist and the table reported **"0.0 % WAITING at every cap"** — a confident, clean,
completely false "there is no bottleneck". The spec now splits pre/post-saturation and **fails** if
any cap never saturates.

## ⏸ P1 — the in-bubble build space: DESIGNED, NOT IMPLEMENTED (commit `37f90a6`)

**Not caution — a verified fact.** `PULL_STRUCTURE_FROM_BANK` is a new **client intent**, and
`protocol.ts:101-106` records that V6-1.1 bumped `PROTOCOL_VERSION` 15→16 for exactly one new intent
(`BUY_GATHERER`) because a stale peer's intent is dropped by the host allowlist and such peers are
**HARD-REJECTED AT HELLO**. So this forces **16 → 17** and breaks multiplayer against every
already-deployed client until both sides reload.

Making that change unattended, hours before the owner playtests a **live** game, is the same risk
class as the worker flip this session already deferred — and it could break the very playtest it was
meant to serve. **Take it at the START of a session, with a deploy and a 2-peer check in the same
session.**

`CASTLE_BUILD_SPACE_DESIGN.md` has the full design, all cited. Two traps written down because both
are cheap to hit and expensive to find:
- **`bankTake` splices, so every removal shifts every later index** — taking `[0,1,2]` naively yields
  shapes 0, 2, 4. Resolve indices to concrete `Spark`s **before** removing any. Most likely silent
  bug in the whole feature.
- the `escrow` / `enforceSpawnerBounds` rim-snap that cost S136 a 194 px teleport, invisible to unit
  tests because none of them run physics.

**§8 has 4 open owner questions** — answer them before implementing.

---

## ⭐ NEW PRODUCT FINDING (verified, NOT fixed — B5 territory)

Surfaced by a Council challenge whose stated mechanism was wrong, then verified independently:

`scoreProgress` **includes the 100-point opening balance**, and both thresholds gate on it —
WIN (`gameState.ts:62`, 1500) and HUNTER (`hostTick.ts:498`, 1125). So a match actually ends after
**1,400 earned** points, not 1,500, and the hunter fires at **1,025 earned**, not 1,125.
**Phase 1 is silently ~6.7 % shorter than every comment claims** (`constants.ts:336` reads "WIN at
1500" as though counting from zero).

This is **owner-unruled B5 (match length)**, and the ×6 faucet already shortens matches.
**Deliberately not fixed** — it is a balance change the owner never approved.

## Process deviations (stated, not presented as compliance)

- **Rule 17 Council ran 2-WAY, not 3-way.** `gemini-3.1-pro-preview` returned **HTTP 429 — prepayment
  credits depleted**. Protocol-sanctioned fallback. *Gemini needs billing topped up before the next
  Council-tier session.*
- **A 6-agent A.0 fleet died on the individual spend cap** after ~454 K subagent tokens with **zero
  output** — the same failure mode that killed two S136 fleets. Redirected to direct empirical
  discovery, which is what produced every finding here. **Do not launch large agent fleets on this
  account.**
- **Priority order changed:** P2/P3 taken ahead of P1 (both cheap and directly serving the imminent
  playtest; a half-built panel feature would have harmed it).

## Next session, in order

1. **P1 in-bubble build space** — answer `CASTLE_BUILD_SPACE_DESIGN.md` §8, then implement FIRST
   thing in the session (protocol bump + deploy + 2-peer check together).
2. **B5 match length** — now has real input: the 6.7 % discount above, plus the ×6 faucet. Still
   owner-unruled.
3. **Bank cap ruling** — data is in `BANK_CAP_MEASUREMENT_S137.md`; decide together with P1 §8.3.
4. **Sim-worker default-on flip** — 6 literals / 4 files (BACKLOG corrected this session);
   `probeHarness.ts:339-345` becomes refuse-by-default after the flip and must be inverted in the
   same change.
5. **H3** — does periodic consumption remove the hauler stall? Needs a dispatch seam `__SPARK__`
   does not expose.

## Still open from before

- `e2e-quarantine` lane red (known `@quarantine-flaky` host-migration D3), non-gating by design.
- No 2-peer/joiner exercise of the castle bank; no host-migration round-trip for it.
- S135 untouched: SCORE_TIER corner-bloom replay · carried-potato `onUp` pointer capture ·
  deposit-slot column overflow.
- `origin/gh-pages` deletion — OWNER-GATED.
