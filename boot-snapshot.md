# Boot Snapshot (auto-generated at handoff)
Generated: 2026-09-08 | Session: S168 | Commit at close: see `git log -1`

> Regenerated at S168 close. Every claim re-derived here, not copied forward.
> **PROTOCOL_VERSION is 45** — a peer on 44 is REFUSED outright. Both players must reload.

## Next Steps

1. ⭐⭐ **THE KRAKEN AND THE PHARAOH ARE THE LAST TWO BOSSES**, and both are large. Four of six
   shipped in S168 (zombie rot aura + death explosion, Vlad life sap, Warlord direwolves + RAGE,
   Archdemon take-to-hell + loneliness teleport).
   - **Kraken (R139) + STUN (R152)** — the owner ruled STUN as a **general condition**, not a Kraken
     feature: *"the player is stuck on idle and cant do anything"* plus a *"seeing stars"* effect.
     Design is costed in `RACE_ZONES_AND_BOSS_TOWERS.md` §R152: a `stunnedUntilTick` FIELD, **not** a
     fifth `CreatureState` (that is a serialized wire discriminant); the stars DERIVED per frame from
     synced state, because a one-shot `world.effects` push is lost ~5/6 of the time. ⚠ The real work
     is enumerating **every** place that reads "can this creature act" — miss one and stun works in
     three systems and not the fourth. Knockback and CONE targeting are two further new verbs.
   - **Pharaoh (R142)** — needs **"untargetable"** (R121's submerged naga wants it too — build once)
     and an **unkillable channel**, which nothing in the sim can express: `damageCreature` removes a
     creature the moment its pool is spent. ⚠ Locusts at 10 ATK / 10 PEN are **150 fifths a strike**,
     more than the Pharaoh's own 78 — cadence and cloud count are unstated and decide everything.
   ⭐ Three mechanisms exist to build on: the host-local **boss roster** in `HostTickState` for
   anything death-triggered, **`damageOverTime.ts`** for percentage-of-victim effects (the locusts
   will want it), and the per-boss modules `bossSkillsWarlord.ts` / `bossSkillsArchdemon.ts`.

2. ⭐ **THE FOOTER (R153) — the owner called it "something small" for next session.** Remove the six
   coloured shapes on the LEFT (`makeLegend`, `main.ts:280`, staged `:699`, footer `:707`, visibility
   `:2990`) — ⚠ it is a REGISTERED HUD surface, so its rect must come out of `hudSurfaces()` too, the
   same completeness the help-line removal needed. Then colour the RIGHT-hand queue/palette shapes by
   **owning race** (`render/shapeStrip.ts`, `shapeStripLayout` / `STRIP_PALETTE_TYPES`) — the race
   palette already exists, so it is a tint at draw time, not new state.
   ⚠ Check the codex/tutorial do not reference the legend before deleting it.

3. ⭐ **THE ABILITY ART (R143 + R147).** Every ability is TWO deliverables — the VFX **and** a new
   stance whose pose explains it (*"kracken opens his mouth… pharaos puts his hands towards an
   enemy"*). R147 is strict: one-shot prompts, the original creature attached as `refImages`, ask
   before guessing. ⚠ veo pillarboxed the same Kraken clip TWICE, the second time against an explicit
   anti-letterbox instruction — budget for `sampleStart`, not for a re-roll.

4. **THE OWNER IS GENERATING TIERS 4–7 HIMSELF** to cut API spend, race by race, mummies first
   (Sand Crawler / Anubis Warrior / Djinn / Sand Guardian). Folders and every expected filename are
   in `assets-source/TIERS_4_TO_7_DROP_HERE.md`. ⚠ One question is parked there: *"healthy, hurt and
   dying"* for UNITS is a **new capability** — the game has damage-state art for TOWERS only.

5. **VOLTKIN REWORK** — `assets-source/godly-voltkin/REWORK_S168.md`. He has **two stills and no
   atlas at all**; he predates the veo pipeline every other unit uses. ⚠ Contains a **legal flag**:
   the rework reads as strongly Pikachu-derived, and S95 already cost a rework for a Totoro
   look-alike. Raise it before any generation spend. His broken-TV building is owner-generated.

6. **Add TCP/TLS urls to `VITE_TURN_URLS`** — owner action, one secret edit. The build ships ONE
   relay url, plain UDP:80, so a UDP-blocked network still has no fallback. The parser now accepts a
   dashboard paste verbatim; it did not before S168.

7. **Wave-5 tech draft (R101–R112)** — not started. R112 is a NAMED owner trigger.
   **R121 submerged naga** · the boss's literal "return to castle" WALK.

## Blockers

- **None blocking code.** Credits are live, relays answer 9/9, deploy verified 4/4, all gates green.
- **Three owner decisions**, none blocking anything else: whether Vlad's life sap is 20% of MAX
  (what shipped) or of CURRENT · the **Orc/Demon** ability ART briefs · and the three balance calls
  under Open Issues below.

## Pending Backlog

- (none unchecked in BACKLOG.md — the live list is this file's Next Steps)

## Open Issues Carried

- ⚠ **THE DRONE AND POTATO STILL DELETE CONNECTORS OUTRIGHT**, untouched by S168's raid ceiling.
  `droneLifecycle.ts` dispatches `SEVER_BOND` with no damage step (capped at 3/drone) and the potato
  calls `applyRadialClear` with no `primKill`, erasing primitives at full HP. **Bots build and use
  both.** This is the owner's own "one action, connectors gone" complaint from a different emitter.
- ⚠ **THE ZOMBIE DEATH BLAST ERASES RATHER THAN DAMAGES.** He ruled *"hurting everything"*, and
  `applyRadialClear` deletes, ignoring `ehp`. `potatoLifecycle.ts`'s own docblock calls that
  "indefensible" against expensive things. Owner call: hurting ≠ erasing.
- ⚠ **THE ARCHDEMON EXECUTE CANNOT REACH SMALL UNITS.** 5% of a 6-fifth race unit floors below one
  fifth, so the most numerous unit on the board is permanently immune to *"any enemy … below 5%"*.
  Fix is a one-fifth floor, or record the exclusion as a ruling.
- ⚠ Four gaps in the new atlas letterbox guard: it is column-only (a TOP/BOTTOM bar scores 0), a
  missing `-anim.json` silently reports "clean", `LETTERBOX_MAX = 2000` leaves an 8-column hole, and
  `near-black < 42` misses a dark-GREY bar. `check:atlas` also chains its two passes with `&&`.
- ⚠ An eliminated seat's boss is unowned and immortal (`scoring.ts:289-304`, carried from S167).
- ⚠ `sapLedger` is never reset between matches; it survives only because the prune runs before any
  id can collide — load-bearing on an ordering no test pins. Noted at `makeHostTickState`.
- ⚠ `.claude/plans/` holds 56 stale plans; the directory is meant to be ephemeral.

## Recent Reflexion (last 2 sessions)

See `.claude/reflexion_log.md` — the S168 block is at the top (12 entries), S167 below it.
The two highest-signal ones for the next session:

- **#a-warning-that-cannot-be-enforced-is-not-a-guard** — `goblinRenderer` warned in writing for two
  sessions that a type missing from `GOBLIN_KINDS` "draws NOTHING AT ALL", and that no test imported
  it. Both true: the Set was module-PRIVATE. The direwolf fell in and was invisible. The fix was
  EXPORTING the Set so the warning could become an assertion.
- **#the-bug-hunt-caught-four-regressions-I-SHIPPED-THIS-SAME-SESSION** — twelve findings, twelve
  fixed, four of them mine and all four shipped green. Moving fast through many priorities is exactly
  when an independent adversarial pass stops being optional.
