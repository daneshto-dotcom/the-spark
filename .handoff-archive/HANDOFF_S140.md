═══════════════════════════════════════════════════════════
SPARK — Handoff Prompt
Generated: 2026-08-12 | Commit: `55894e3` | Session: S140 CLOSED
Working dir: `C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark`
STATUS: READY
═══════════════════════════════════════════════════════════

QUICK SUMMARY

SPARK is a 2D real-time multiplayer browser game (TS + Pixi, host-authoritative sim, optional Web
Worker, WebRTC, deterministic state hash). S140 shipped one priority and deployed it: **the castle
bank now holds 7, and the laser turret was retuned 8 → 7 so BOTH tower recipes are directly
holdable.** `PROTOCOL_VERSION` is now **19** — both peers must reload. Deploy verified 4/4.

The session's defining event: **the owner overrode a unanimous Council.** All five seats rejected
the laserTurret retune 5-0; the owner was shown the objections and reaffirmed, so it shipped in
full. The interesting part is the execution. The Council's headline objection was that implementing
the retune *requires deleting* the anti-drift test that exists to stop the Codex emblem and the
recipe predicate disagreeing about seven. It did not. That test now reads `TURRET_HUB_DEGREE`
instead of a literal — it survives any future retune and is strictly stronger than before.
**A rejected-but-ruled change is an instruction to find the version of it that keeps the protection.**

WHAT TO DO NEXT (priority order)

1. **⚠ 2-PEER CHECK ON v19 — ONLY YOU CAN DO THIS.** Open two browsers and confirm the HELLO
   lockstep. The only runtime coverage of the version gate is the e2e **quarantine lane, which is
   fully red** and `continue-on-error`, so **CI cannot verify it and I did not claim it.**
2. **PLAYTEST cap 7 + the 7-shape turret.** Worth answering while you play: does holding a whole
   tower read as a satisfying unlock, or as the last friction leaving the build loop? And is the
   keep-face glyph row still legible now that it wraps rather than shrinking?
   ⚠ Every Council seat independently priced this raise at **~4 seconds** of refill wait, and the
   S137 measurement says the binding constraint is CONSUMPTION, not capacity. If building still
   feels stop-start, the cap is the wrong knob.
3. **THE STINK TOWER** — the deferred S139 P3, unchanged and correctly next. A 4-shape non-godly
   `DefenderKind`, and the first thing in the game that would deliver "assemble a complete tower
   structure directly" in the fullest sense. All four Council rulings are in `session-state.json →
   carry_forward` — **do not re-derive them.** ⚠ Its own spec forbids guessing the recipe shapes;
   that needs a decision from you.
4. **PLAYTEST the S139 goblin** — two design questions still unruled: it is a permanent roaming
   ~120 px vision source, and goblins render above the fog so enemy goblins are always visible.

ACTIVE PLAN
→ `.claude/plans/2026-08-12_PDR_S140_bank_cap_7_and_turret_retune.md` (P1 COMPLETED)

⛔ CORRECTIONS TO THE RECORD — these were wrong before this session

- **`LOCKED_DECISIONS` §7 said the carve-down threshold was "a bank cap ≥ 5".** It is the OUTLIER:
  `BACKLOG` B4 and `constants.ts:409-411` both say **"≥ the biggest recipe"**. I reported §7 to you
  as evidence the objection was moot before the PRIME-AUDIT caught it. §7 is now corrected in place.
- **`BACKLOG` B3's faucet prose is stale.** `SPAWN_RATE_PER_SECOND` is **1.125**, not 0.1875 (6×'d
  in S136 P4). Any argument resting on "a refill wait is ~32 s" is really about ~4 s.
- **`defender.ts:8` called both defender kinds "STATIONARY"** fifty lines above HELGA's `WALK`
  state. Fixed — it became decision-relevant when you had to rule what counts as a "tower".

⛔ STILL BLOCKED ON YOU

- **R7 (the design library) is not implementable as ruled.** Per-browser localStorage means peers
  hold *different* libraries and the host cannot validate "I own this design" — contradicting the
  design's own §5 non-negotiable host-validation contract.
- **Owner-gated, standing:** `origin/gh-pages` deletion.

CARRY-FORWARD
15 entries in `session-state.json → carry_forward`, including: the fully-red e2e quarantine lane;
the migration `SparkId` collision hole; `npm test` being watch-mode (so it reports **cancelled**, not
failure); and the deferred ranged goblin and producer towers.

TRAPS THAT WILL BITE

* **When the owner overrides the Council, upgrade the guard — don't delete it.** The version of the
  change that keeps the protection usually exists; look for it before removing a test.
* **A strict-equality gate turns stale copy into a trap.** `laserTurret` gates on `!==` with no upper
  tolerance and the host re-validates every 0.5 s, so "builds at six, dies at seven": a player
  following stale copy adds a 7th spiral and watches the turret they just built get destroyed.
* **A tripwire that has never been red is a wish.** The cap pin fired correctly. Four
  `PROTOCOL_VERSION` pins had rotted — every one of their titles said "is 17" while asserting 18.
  Keep exactly ONE deliberate pin and bind the rest to the constant.
* **Derive from the container, not the contents.** Slots-per-row from the panel width is
  overflow-proof at any cap AND byte-identical at cap 5 — which is what let a risky change ship as
  two provable ones.
* **A cost can belong to your first sketch, not to the problem.** The "1 dead box at cap 7" that
  drove a whole Council argument vanished once each row was centred on its own occupancy (4+3).
* **`file_lacks` needles match your own explanatory comments.** MCV failed because my "the old
  assertion is gone" binding matched the docblock quoting it. Anchor on a statement terminator.

FULL HANDOFF DOC
→ `boot-snapshot.md` — **read this FIRST** instead of handoff + backlog + reflexion.
→ `.handoff-archive/HANDOFF_S140.md` (permanent copy)

PRE-FLIGHT

* [ ] Read `boot-snapshot.md`
* [ ] `git rev-list --count origin/master..master` (NOT the inverse — it lies)
* [ ] `npm run verify-deploy` — expect 4/4
* [ ] `npm run e2e:gating` — expect **34 passed / 0 failed** (was 32; +2 bank-strip runtime specs)
* [ ] Note `PROTOCOL_VERSION` is **19**; a v18 peer is hard-rejected at HELLO

SESSION RULES

* SESSION PDCA — priorities from BACKLOG.md, PDR gate before any implementation
* PORT PROTOCOL — use `$SESSION_PORT`
* B5 match length is RULED CLOSED — do not re-raise (LOCKED_DECISIONS.md)
* `origin/gh-pages` deletion remains OWNER-GATED
* Pushing `master` = shipping to production. There is ONE deploy path.
═══════════════════════════════════════════════════════════
