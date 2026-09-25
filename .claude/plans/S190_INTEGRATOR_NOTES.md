# S190 — INTEGRATOR NOTES (deploy #4: every remaining branch, ONE protocol bump 50 → 51)

Written by the merge owner as audits land. The integrator agent reads THIS file first. Audit journals (one
{"type":"result"} JSON line per agent) are the evidence for every line below.

## Merge order (one branch at a time; typecheck + FULL vitest after EVERY merge; a branch that is not clean is LEFT OUT)
1. `s188/wrath` → 2. `s188/swarm` (already contains wrath) → 3. `s189/render` → 4. `s189/units` → 5. `s189/weld`
→ 6. `s190/perf` → 7. `s188/draft-atk` → 8. `s189/net` → 9. the ONE protocol bump + canon + docs commit.

## Per-branch chores (exact resolutions)

### s188/draft-atk (audit wf_05c696b4-44a — NO defect on branch; merge-ready)
- canon.test.ts goes RED in TWO places by design (DA-A1 / DA-L2-1/2/3): (a) the castle-arm source pin (~:862) —
  re-pin to require the LADDER call name in the castle arm (`/[aA]ttackFifths\(/` — L2-2 notes this is weaker; pin
  that the arm calls `creatureAttackFifths(` specifically); (b) the §3d "PENDING TRAIN D" tripwire (~:496-515) —
  replace with the live rule (callers('draftedAttackFifths') === ['state/creatures/creature.ts']), pin the worked
  strikes from the constants (6→7→8, 12→13, 33→36, 20→22, 30→33, 150→165), and rewrite SPARK_CANON.md §3d's
  "only HP and DEF picks land" clause, the PENDING paragraph and the §3 castle row IN THE SAME COMMIT; ⚠ canon.test.ts
  ~:321 pins the OLD castle-row wording (DA-L2-3) — change both together.
- Conflicts: corpseEater.ts import block with s189/units (keep `attackCycleMultiplier` + `creatureAttackFifths` +
  render's `noteCreatureHeal`); stateHashFull.ts CreatureHashed union + projection with s189/render (keep BOTH
  'healedFifths' and 'atkFifths', each with its own contribution test).
- Text (DA-A3/A5): creatureStrike.guard.test.ts SANCTIONED `why` strings call R190-E "OPEN OWNER QUESTION" — rewrite to
  cite R190-E ("No — a drafted ATK pick buffs physical hits only; the Ra column is MAGIC"); stale comments saying the
  arms read `attackFifths(atk, pen)`.
- Protocol reason for the 51 docblock: `Creature.atkFifths?` (serialized + hashed) and the birth-bake of drafted ATK/PEN
  into every creature strike (a v50 peer drops the field → card/fatal-blow disagree; a v50 successor restores unbuffed).
- Owner question recorded for next session (DA-A2, NOT changed): boss-skill SUMMONS (Pharaoh locusts, Warlord
  direwolves), Voltkin lightning and the suicide/drone blasts ARE buffed by a drafted ATK pick (they are creatures'
  own hits). Lever if he says no: pass `draftPicks` undefined for boss-summon types in the null-spawner branch of
  applySpawnCreature (moves pool AND strike together).

### s188/wrath + s188/swarm (swarm tip 74119db ALREADY CONTAINS wrath beb7517 + master 5934d3b)
- Merging `s188/swarm` brings wrath with it — merge wrath first only if its fix-round audit requires a wrath-only fix.
- canon.test.ts reds (by design): (1) §3d/§3e registry test (~:415) wants §3e rows for all 14 titles — add
  **WRATH OF RA** (mummies · 10, only for a seat holding mummies.l0; 3 casts per FIGHT; SANDWORM ruled NOT built) and
  **THE SWARM** (vampires · 10; every stat ×6 from the bat per R190-D; bite 132 vs bat 12; CRIMSON TIDE heals 66 per
  bite > its 60 pool — a stated consequence) as BUILT rows, and fix the NOT-BUILT table; (2) §3d offer test (~:476/:481)
  pins vampires at wave 11 as COMING SOON → re-pin: vampires `pickIsOffered(..,'racial')` true / autoPickFor 'racial';
  a race with no L10 perk (orcs) false / the general pick; mummies true only with mummies.l0.
- Protocol reasons for the 51 docblock: (wrath) `SerializedPlayer.raStrike` REPLACED by `raStrikes` (≤3, cast order,
  validated + capped); CHOOSE_DRAFT 'racial' at wave 11 offered/accepted for a mummies seat holding mummies.l0 and
  taken by the deadline; WRATH 3 casts per FIGHT with the pattern seeded by seat + 4 × charge; a Ra column's sever no
  longer refused for a benched/eliminated caster. (swarm) new CreatureType `t3BatSwarm`; the level-10 vampire offer.
- Doc rot: `protocol.ts` ~:784 stale `Player.raStrike` line; `powerOfRaRules.ts:24`; `e2e/nplayer.spec.ts:214`;
  `draftOverlay.test.ts:175` old title; the `t3BatSwarm` docblock in `creature.ts` says it rode 49→50.
- s189/render collision: `goblinRenderer.ts` atlasFallbackType → union
  `type === 't3BatSwarm' ? 't3Bat' : type === 't3PiranhaElite' ? 't3Piranha' : null`, KEEP `BAT_SWARM_ATLAS_BASE`,
  re-pin BOTH exclusivity tests (s189EliteFallback.test.ts ~:135, theSwarm.test.ts ~:338) — never delete either.

### s189/units (audit wf_642c93b4-7ea; fix round: U1 sonar velocity REPLACE, spawn-window test, restore-hash verdict)
- Canon (U3 / U2-2): §3/§3d regen text says "a % of the flat base pool — MINE" → now R190-C (his ruling): a % of the
  UPGRADED total; pin `castleRegenPerSecond(1, 2750) === 28` and `(5, 2750) === 50` from the constants (half-up rounding
  is now live: 2750 × 1.8 % = 49.5 → 50); keep the 25/30/35/40/45 line for an un-upgraded keep. §501 "stuns AND flings"
  → "stuns and shoves ~70 px" + pin `KRAKEN_SONAR_KNOCKBACK_PX === 2 * GOBLIN_ATTACK_RANGE`. §472 "born after the death
  sweep" → also covers out-of-tick RAID kills (children now born at the raid). BOSS_STATS_TABLE.md:57 (26 px → 70 px).
  castleRegen.ts docblocks ("nobody asked for", "CASTLE_MAX_HP is 1500 … no rounding rule") → cite R190-C + rounding.
- U4 / U2-6: DO NOT add the suggested C3 pin `return bestEnemyId ?? bestOwnId;` — s190/perf deletes that literal.
- U2-4: `WorldSnapshot.nextCreatureId?` (additive-optional, no bump) → list it in the protocol docblock's
  "rides without a bump" notes + a canon §6 line.
- Conflicts: corpseEater.ts import block with draft-atk (+ render's noteCreatureHeal) — keep all names.

### s189/net (audit wf_6bc5b278-12e; fix round: rejoin-proves-same-match, per-PEER gate, codex/settings Escape,
### restore the 1v1 D4 frozen-host takeover, RESTORED-log, C4 wiring test, gate the vite-spawning unit test)
- Canon §6 rows owed with assertions (wire: ~113 KiB / 9.3 Mbit/s on a real ~2.2 bonds/prim board vs 84 KiB / 6.88 at
  the S182 fixture; latest-wins snapshots; the new drop-reason console lines). Stale `lobbyStateMachine.test.ts:645-658`.
- e2e OWED on the merged tree before the push: `e2e/reconnect-hard-blip.spec.ts` (C4 repro — must be GREEN now),
  `reconnect.spec.ts`, `exit-match.spec.ts`, `hostmigration.spec.ts` (3-player migration must still take over).

### s190/perf (audit wf_da0cd9c1-768 — no correctness defect; follow-up 7b0f6db..c11d20d tests/docs only; MERGE-READY)
- `bondTargetIndex.guards.test.ts` pins per-file OCCURRENCE COUNTS of `bonds.set(` / `nextPrimitiveId++` /
  `.placerColor =` / `.clear()` measured on perf's tree — **RE-COUNT after merging s189/weld** (it edits
  placePrimitive.ts) and after any branch that adds a bond/shape writer; a changed count is a prompt to check the cache
  invariant (every bond through makeBond, removal through razePrimitives or a clear() outside the creature loop).
- The default-suite oracle adds ~18 s under --maxWorkers=6 (own 120 s timeout). Activity floors live in one table.
- `hostTick.ts` +12 lines (epoch open/close around the creature loop) — expect overlaps with weld/units hostTick hunks.
- No protocol bump (outputs byte-identical); canon: a §6/§3 note on the per-tick target index is optional.
- units FIX ROUND DONE (tip 81bf67b): U1 sonar REPLACES velocity (reach test: a seeking goblin now ends 70 px farther;
  red on the additive form); spawn-window guard tests (mutation: delete endHostTickSpawnWindow → red); restore-hash
  verdict BENIGN (only prevPos/targetPos, deliberately not saved — save.ts:159). MERGE-READY. ⚠ Deviation recorded:
  the one-line fix round was not re-audited (precise spec + mutation proof); the integrator's full gates cover it.
- CARRY-FORWARD (not this deploy): `workerSim.ts:213` startup restore never repairs `nextPulledSparkId` (migration +
  worker-failure paths do, main.ts:3440/:3071) → a worker adopted mid-match could re-mint id −1 over a live pulled
  shape; latent (WORKER_DEFAULT_ON = false). Fix: one `rebuildAuthorityAllocators` call or serialize the counter.

### s189/render (audit wf_17627f30-0a4 — no MED defect on branch; MERGE-READY)
- WRATH collision (RENDER-L1-1 / L2-1, MED): bossAuras.ts drawPowerOfRa conflict → wrath's per-charge loop WITH render's
  strikeLayer arg: `for (const [charge, strike] of p.raStrikes.entries()) drawRaColumns(g, strikeLayer, world.tick,
  strike.untilTick, (k) => raStrikeColumnPos(seat, k, strike, charge))`; re-pin `s190RaStrikeAboveUnits.test.ts` :89
  (fixture guard → `raStrikes.length === 0`) and :175 (negative → `raStrikes = []`); add a second-charge case.
- SWARM collision (L1-2 / L2-2): the atlasFallbackType union (see the wrath/swarm section) + drop render's stale
  "Portrait NOT given the fallback" sentence (swarm's SWARM-B1 made the portrait use it).
- draft-atk collision (L1-3 / L2-5): stateHashFull.ts — keep 'healedFifths' (:hf) AND 'atkFifths' (:ak).
- L1-5 (LOW, small fix): since C1 the codex and the RECONNECTING/CONNECTION LOST overlays draw OVER the draft panel and
  swallow clicks (R2-1), but controls still asks draftPanel.isOver/isOverChoosable → the cursor promises a pick the
  backdrop eats. Fix: DraftOverlay.isOver / isOverChoosable return false while a later-staged modal is visible (a
  `coveredBy()` predicate from main.ts: codex visible || connection-lost visible); one test (panel + codex open →
  cursor not 'pointer').
- Text (L1-7 / L2-6 / L2-7): 'zIndex-900' comments in controls.ts / draftOverlay.ts / tests (ten lines — see the
  first render audit R2-3), the codex note, stale progress/canon-notes sections.
- Protocol: `Creature.healedFifths?` rides without a bump but MUST be listed in the 51 docblock (L2-8); its per-snapshot
  cost is permanent (~17-19 B per ever-healed creature) — note it in canon §6.
- OWNER QUESTIONS → next session (recorded, not built): R190-I on the CASTLE (regen/repair still net against a hit —
  L1-4); R190-H also lifts the art's ground rune ring (slots 0-3) above units (L1-6 / L2-3); the RECONNECTING overlay
  now covers an open draft panel (L2-4); Ra strike above buildings too?

### wrath + swarm audits (wf_f3827fc3-41f, wf_d47f2a4d-bf4) — no MED/HIGH defect on either branch; MERGE-READY
- Merge `s188/wrath` FIRST (its own gate step), then `s188/swarm` (WRATH-F4).
- THE FULL canon.test.ts red chain on the wrath+swarm tree (SWM-4 / WRATH-F2) — a one-row edit will NOT fix it:
  ~:420 asserts `racialPerkFor(race, index)` with NO picks → for a perk with RACIAL_PERK_REQUIRES (mummies.l10) pass
  picks that hold the requirement, and separately assert null without them (do NOT weaken the requirement);
  ~:426 count 12 → 14; ~:427 heading "THE TWELVE" → fourteen; ~:431 rows length 2 → mummies/vampires 3;
  ~:432 racialPerkFor(race, 2) null → false for vampires (and mummies with l0); ~:434 "exactly two perks per race";
  ~:436 WRATH in the NOT-BUILT table → move WRATH + THE SWARM to §3e (THE SANDWORM stays RULED/NOT BUILT);
  ~:444 delete the l10-mummies AHEAD_OF_THEIR_PERK allowance + fix SPARK_CANON.md ~:268 (now 18 cards, none ahead);
  ~:451 the printed card count → 18; ~:476/:481 the offer test (see above). §3e WRATH row names the PRE-CUT
  `public/art/skills/wrath-of-ra.webp`; add pins RACIAL_PERK_BUILT['mummies.l10'], perkDraftIndex 2,
  RACIAL_PERK_REQUIRES 'mummies.l0', WRATH_OF_RA_CHARGES 3.
- THE PROTOCOL BUMP pins: canon.test.ts ~:260 `toBe(50)` → 51; ~:803 `expect(doc).toContain('BUMPED 49 -> 50')` reads
  the docblock NEAREST the const — re-point it once a 51 docblock sits above; SPARK_CANON.md ~:711 "is **50**" + a
  "WHAT RIDES 51" paragraph; protocol.ts const + narrative + HelloMsg chronological list (~:1090) + `protoVersion: 51`
  (~:1115) + protocol.test.ts (~:104 pin + title) + e2e/smoke.spec.ts:90 LOCAL_PROTO_V + the session label;
  creature.ts ~:423-425 ("rides 49 → 50"); annotate protocol.ts ~:784 and powerOfRaRules.ts ~:24 (raStrike renamed
  in 51); correct S188_CANON_NOTES_wrath.md:64-70; the project CLAUDE.md protocol line.
- LOWs recorded, not blocking: WRATH-F5 (the W-4 pending record goes inert when a joiner snapshot moves world.tick
  backwards), SWM-6 (no test drives the swarm draw loop through the bat-sheet fallback) → carry-forward.

### s189/weld FIX ROUND DONE (tip 8b2b553) — under a fix-round audit (wf_cd96cb8a-575); merge ONLY on the merge
### owner's go (the audit may add fixes)
- Spare rules REVERTED; own members = the recipe's bonds with id < `ownBondIdLimit` (NEW field on spawners AND
  defenders, four sites; `ignitedAtTick` could not be used — stripped from the wire). New serialized defender state
  `'DORMANT'` (Helga dies → dormant → revives at FIGHT→BUILD while her hall's own connectors stand; R190-J).
- 51 docblock reasons (weld): `ownBondIdLimit` on spawners + defenders; the `'DORMANT'` defender state; survival on
  built-with connectors; Helga exact first build + dormant revive; the empty S107 P4 lock (drops may bond onto live
  spawners); hub self-destruct / t9 release delete own members + orphaned welds; the welded tower's drawn shapes /
  centre / aura / ground zone / FEED button; bot raids aim at own connectors.
- Canon (W10 / W2-5 + weld's S189_CANON_NOTES_weld.md): §7b/§8 — the no-spare rule stated exactly with its tests;
  R185-B unchanged (welded = unrepairable); the S107 P4 lock; Helga dormant revive; perf's guard occurrence counts
  must be RE-COUNTED after this merge (placePrimitive.ts changed).
- Owner questions (next session, recorded in S191_BACKLOG): drops next to a spawner now always weld (bots weld their
  frontier into own towers; a player can merge into his tower by accident → permanently unrepairable); an own-race
  Dot ring welded through a live hub never becomes a tower (ignition duplicate check ignores recipes).
