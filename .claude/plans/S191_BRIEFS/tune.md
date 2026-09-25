# S191 BRIEF — `s191/tune` (the owner's two late items: Ra strength · castle no-build zone)

**Worktree:** `C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark\.claude\worktrees\s191-tune` · **branch** `s191/tune` from master `9cbc2e5` (src = deploy #4, PROTOCOL 51).
**Rules:** `.claude/plans/2026-09-25_S191_BATCH_PDR.md` §4 (read it first). Progress `.claude/plans/S191_PROGRESS_tune.md`; notes `.claude/plans/S191_CANON_NOTES_tune.md`.
**Step 0:** `npm ci` (captured `$?`); progress skeleton committed. Read SPARK_CANON.md §2, §3e (POWER OF RA / WRATH OF RA rows + the "POWER OF RA IS THE PHARAOH'S OWN STRIKE" paragraph), §4b.

## ITEM 1 — POWER OF RA / WRATH OF RA IS TOO STRONG
His words (S191): *"The Wrath of Ra, or whatever the power of Ra. Is way too strong, dude. It destroys like a full fucking tower. Within one hit. And it hits like, what? Three times or five times? … we need to divide by three the … strength of each beam that comes down … it shouldn't be like more than 50 or even less each beam. Like maybe 30."*

Today: `RA_STRIKE_FIFTHS = attackFifths(RA_COLUMN_ATK 15, RA_COLUMN_PEN 15)` = **300** per column (`src/state/racial/powerOfRa.ts:65`), over `RA_COLUMN_RADIUS` 70 px, 5 columns a cast, POWER OF RA 1 cast / FIGHT, WRATH OF RA 3. `powerOfRa.ts` ~:156-195 calls `damageConnector(world, bondId, RA_STRIKE_FIFTHS, null)` on **every** connector inside the radius — a 5-connector tower's WHOLE ladder is 130, so one column deletes it. ⚠ Another branch (`s191/carry`) is making overkill CARRY across connectors (his ruling), so even a small per-connector number would still fell a tower if it lands on every connector in the radius.

Build (defaults — flag each `⚠ MINE` at its constant with a one-line lever, quote him at the constant):
1. **The player perk's column strength = 30 fifths**, on the ONE ladder: new `RA_PERK_COLUMN_ATK` / `RA_PERK_COLUMN_PEN` whose `attackFifths` is exactly 30 (e.g. ATK 2 / PEN 10 → 2 × 15 = 30 — keep a high-PEN "piercing sunlight" character; say why you chose the pair), `RA_PERK_STRIKE_FIFTHS` derived. ⛔ **The Pharaoh BOSS's own ritual (`bossSkillsPharaohRitual.ts` ~:149) stays on `RA_COLUMN_ATK/PEN` (300)** — the owner complained about the player's Ra; decouple the two and replace canon §3e's "a retune of his ultimate retunes this one" sentence in your canon notes. Every perk strike site (POWER OF RA, every WRATH charge, the bot cast) reads the new constant — enumerate them.
2. **A column hits each STRUCTURE once, not every connector in its radius:** for each connected component with at least one enemy connector inside the radius, the column's 30 lands on ONE connector — the one whose midpoint is nearest the column centre (squared distance, then lowest bond id — a total order) — through `damageConnector(…, null)`. Creatures, Helga, lone built shapes and stink bags inside the radius each take the 30 as today. The caster is still spared.
3. Numbers to report (and put in the canon notes, derived from constants): one column vs a fresh 5-connector tower (banks 30 of its first connector's 50 → stands); how many columns fell it; a full POWER OF RA cast (5 columns) and a full WRATH (15) aimed at one tower; vs the tier-9 pools (260–462).
- Tests: through the real host tick — one column on a 5-connector tower leaves it standing with 30 banked; two towers in one column each take 30 once; a creature in the radius takes 30; the caster's own things untouched; WRATH's three charges read the same constant; the Pharaoh boss's column still deals 300 (a negative test that pins the decoupling); host-vs-worker wide hash; one mutation per rule (per-connector application restored → red; perk reading the boss constant → red).

## ITEM 2 — THE CASTLE NO-BUILD ZONE IS TOO BIG
His words (S191): *"you can't build … near the castle. Like it takes so much space. Like the no build zone near castle is like way too ridiculous. It needs to be halved. Okay, like the radius where you can't build around the castle."*

Today: `CASTLE_NO_BUILD_RADIUS = 121` (`src/state/zones.ts:223`) = the castle PORCH's reach (4 deposit slots at x ±45, y +74, each `CASTLE_PORCH_SLOT_CLEAR_RADIUS` 17 → 103.6) + 17 of air; a literal on purpose (no `Math.hypot`), re-derived in `zones.test.ts`.

Build:
1. **Halve it: `CASTLE_NO_BUILD_RADIUS = 61`** (121 / 2 rounded up; keep it a literal; his number — quote him). Re-pin `zones.test.ts`'s derivation to the new rule honestly (it no longer equals the porch reach — say what it is now).
2. ⚠ **Keep the PORCH working** — the porch is where every gathered shape lands. With the radius below the porch reach, a tower could be stamped over a deposit slot. Default (`⚠ MINE`): each porch slot keeps its own clear disc (`CASTLE_PORCH_SLOT_CLEAR_RADIUS`) that no footprint may overlap, so deposits never collide; prove it with a REACH test (a gatherer deposits into every slot with towers stamped as close as the new rule allows).
3. Find EVERY consumer of the keep-out (placement legality on the host, the client's placement preview / cost plate, bots' build-site search, `blueprintLegality`, loose-shape placement if it uses it, any renderer that draws the zone) — they must all move together (a client preview that disagrees with the host is the S182 lesson-2 class). Report the list.
4. Tests: a stamp at 62 px is accepted and at 60 px refused (derive from the constant); a stamp over a porch slot is refused; the bot build-site search can use the freed ring; `netWireSize` / castle-edge tests that build near a castle still pass (S182 lesson 3 — the keep-out once broke another branch's fixture).

**Protocol:** both items change rules a host / successor computes (strike damage, placement legality) → report them for the bump; do not edit `PROTOCOL_VERSION`.
**Final gates** (captured `$?`), **STOP and report** (≤ 50 lines: commits, the numbers table, every consumer list, constants, gates, what you could not do).

## File boundary / collisions
`src/state/racial/powerOfRa.ts` (+ `powerOfRaRules.ts`, `botRa.ts` if they read the strength), `src/constants.ts` (the new perk constants only), `src/state/zones.ts` + its consumers' keep-out reads, tests. ⚠ `s191/carry` edits `damage.ts` (overkill carry) and `bossAuras.ts` (Ra ritual drawing, C-4 / C-9) and added a WRATH pending-record helper (`render/pendingRecordClock.ts`) — do not touch those; `s191/endstats` threads a seat attacker through damage calls (the column passes `null` today — leave it). Not `src/net/**`, not `PROTOCOL_VERSION`, not the canon.
