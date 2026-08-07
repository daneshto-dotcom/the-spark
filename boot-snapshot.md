# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-07 | Session: S134 (1/1 priority · 8 commits · ✅ PUSHED + DEPLOYED + VERIFIED)

## ✅ SHIPPED AND VERIFIED LIVE
`ab8d50e..d902571`, 0 unpushed. Deploy run `31181718138` **success**, and
`npm run verify-deploy` passes **4/4 carriers** — live entry asset `index-BxmxAHDO.js` is
content-hash identical to the local build. ⚠ The push DID auto-trigger a run this time, but
that is not evidence the trigger is reliable: two earlier qualifying pushes created **zero**
runs. **Still verify, never infer.** Fallback remains `gh workflow run deploy.yml --ref master`.

## ⭐ THE BIGGEST THING THAT HAPPENED THIS SESSION WAS NOT THE BUG FIX
**All six open v0.6 economy decisions were ruled, plus the whole of V6-1.1. PHASE 1 IS
UNBLOCKED AND SPECIFIED** after six sessions of waiting. See the OWNER RULINGS table at the
top of `BACKLOG.md`, the B4 queue section, and the V6-1.1 section. Headlines:
- **B4 is an ordered RTS BUILD QUEUE, not a filter** — the first recording said "filters" and
  the owner corrected it. Click a shape N times ⇒ ×N; ordered and consumed; one queue per
  player; empty queue ⇒ collect nearest; controls live in a **footer bar**.
- **⭐ SCORE IS NOW A CURRENCY.** Gatherers are bought with victory points (~100 of 1500),
  **ONE POOL — spending sets you back toward the win.** Score was write-only and monotonic;
  it is now spendable and non-monotonic. **Audit every monotonicity assumption before this
  ships — a tier crossing can now go DOWNWARD** — and re-scope V6-1.6, whose energy sink is
  now redundant.
- **The sim-worker default-on flip is SPLIT OUT of V6-1.1** — close the hunter residual first.

## WHAT S134 DID
Fixed creature lifetime serialization. `serializeCreature` coupled the `despawnAtTick` emit
to `sourceSpawnerId !== null` and `trimMirrorCreature` then stripped it from the wire, so
`deserializeCreature` rehydrated 0 — a **DETONATION default**, not a neutral one.

⚠ **IT WAS NOT PRIMARILY A HOST-MIGRATION BUG.** Three consumers share that serializer, and
the third is live on today's build with no peer and no disconnect: `main.ts:1630` →
`workerSim` `restore()` + `isHost = true`. MEASURED pre-fix: a Voltkin at 1700 rehydrated to
**0** under `?worker=1`, on the ORIGINAL host. **V6-1.1 flips `?worker=1` on by default**, so
this would have gone opt-in → universal in that slot.

⚠ **AND WORSE THAN DELETION.** `hostTick` Step 1.5 runs BEFORE the lifetime gate and fires
DRONE_EXPLODE on `world.tick >= despawnAtTick - 1` = `>= -1`, always true ⇒ every inherited
drone detonated, severing up to 3 enemy bonds each, up to 12 drones = **up to 36 irreversible
severs per handoff**.

`sourceSpawnerId` shipped in the SAME commit: the deletion was MASKING two defects it causes
(per-spawner caps silently disabled; a rehydrated chewer counted as its owner's Voltkin,
blocking their summon), and those are untestable while creatures are being deleted.

## STATE
tsc 0 · vitest **2028/2028** (133 files, +8/+1) · bundle **645.3/750 KiB (−88 B)** ·
wire 12,821 → **13,313 B** (+492 B, +3.8%) measured · PROTOCOL_VERSION **15** (no bump) ·
**MCV exit 0** (14 bindings) · gitleaks clean · CHECK verdict **SHIP-WITH-FIXES**, all 5
adopted items landed in `c98e2e2`.

## Next Steps
1. **THE HUNTER RESIDUAL, AND IT IS NOW SEQUENCING-CRITICAL** — it must close BEFORE the
   sim-worker default-on flip, per the owner's S134 ruling. Details in step 3 below.
2. **V6-1.1 — gatherer substrate.** Fully specified now (see BACKLOG's V6-1.1 table); needs a
   Full-tier PDR. Scope: new entity family across the R15 17-site checklist · a minimal
   placeholder keep that takes 100 score and emits a gatherer · the score-spend path (the
   monotonicity audit above is part of THIS slot) · the procedural shapeshift renderer
   (renderer-only, must not become world state) · `gatherer` naming everywhere.
   ⛔ **Does NOT include the sim-worker flip** — owner split it out.
   Read R1/R3/R4/R23 in the ledger first. **R3 (gatherer identity) is still unchosen and
   load-bearing**: a `freeSparks` entry inherits the 10 s TTL reap and rim-snapping; a new map
   is invisible to R1/R2; a seated Player collides with `MAX_PLAYERS = 6`. Pick deliberately.
3. **The hunter residual — identical bug, one family over.** `serializeHunter` emits no
   lifetime, `deserializeHunter` hardcodes `despawnAtTick: 0`, `hunterLifecycle.ts:148` gates
   on it. A live hunter silently escapes on migration/worker-resume and `hunterSpawned` blocks
   respawn. Full entry in BACKLOG's ledger. ⚠ **Strike `SPARK_Blueprint.md:725-729` only in
   the same change that closes it** — until then it is the only accurate warning left.
4. **Seed `workerSim.differential.test.ts`.** Its `hashWorldStateFull` INIT compare is the
   repo's strongest `restore()` guard and it runs on an EMPTY creature+hunter set, so it is
   structurally blind to this whole bug class. That is why this defect needed a manual
   `?worker=1` measurement to find.
5. Two-tab boot-then-smoke for migration (nothing gates it today; the e2e spec is quarantined
   and contains zero occurrences of "creature").

## Blockers
- **The six design questions.** Everything in Phase 1 waits on them. No technical blocker.
- **V6-2.1** still needs the structure-HP slot first (S130 ruling). ⚠ That ruling is REAL
  (`HANDOFF_S130.md:142`) but `BACKLOG.md:505` still records it as an unresolved binary and
  **no numbered row for the slot exists** — it must be authored before it can be built.

## CRITICAL TRAPS (S134 additions first)
- **A DOCBLOCK IN `save.ts` IS NOT EVIDENCE.** Three said the fix belonged in the emit
  condition; all wrong, and that text is why S133 scoped the bug out. S134 then **repeated
  the mistake** — its own commit message claimed "all four rewritten" while seven stale sites
  survived, including `serializeCreature`'s OWN header 44 lines above the emit it changed.
  **When you diagnose stale docs as a root cause, grep the WHOLE file before claiming a fix.**
- **A MUTATION THAT FAILS TO RED MAY MEAN THE LINE NEVER RAN.** This file produced a false
  all-green **twice**, both from fixture branch-routing, not weak assertions: first no
  creature had a `targetCreatureId` so all took `trimMirrorCreature`'s early return; then the
  P1-owned creature was the CHEWER, which has no zap target and is therefore immune to M3.
  **Re-run the matrix after EVERY fixture change** — one proven against the old fixture proves
  nothing about the new one.
- **CRLF AGAIN (4th session running).** `save.ts` is 1780 CRLF / 0 LF. Bare-`\n` anchors
  matched **nothing** and would have reported three mutations as passes. Use `\r?\n`, `[ \t]`,
  and put an **anchor-count guard** in any mutation harness — it is what caught this.
- **AN MCV NEEDLE WRITTEN FROM MEMORY FAILED.** Same class as S133's three-from-memory
  assertions. Copy literals off disk. MCV caught it; I did not.
- **REVIEWER FABRICATION IS REAL AND CONCENTRATED.** Of 22 CHECK findings, 6 cited symbols
  that do not exist (a non-existent `export function trimMirrorCreature`, a guard
  `if (c.despawnAtTick === undefined)`), all from one reviewer's second pass. The two
  reviewers working directly against disk produced zero. **Grep-verify every citation.**
- **`0` IS NOT A NEUTRAL DEFAULT FOR A TICK FIELD.** It makes every `>=` gate true. Check
  what a rehydrate default MEANS to the gates that read it.
- A PUSH IS NOT A DEPLOY · `npm run verify-deploy` after every push.
- MCV needs an ABSOLUTE-path `verification[]` binding on a **completed** priority for
  `BACKLOG.md`, and supports only file_exists/file_absent/file_contains/file_lacks/
  grep_count/json_field/syntax_ok/nonce_match.

## COMMUNICATION NOTE (owner feedback, S134)
The owner said outright he could not follow six turns of output: "your wording of everything
is super obscure". He also pointed out the game **looks identical to two weeks ago** — true,
and the honest answer is that nothing player-visible has shipped since the v0.6 pivot landed.
**Lead in plain English, lead with what changed for the player, and put decisions in a widget
rather than in prose.**

## Recent Reflexion
`.claude/reflexion_log.md` + 6 S134 entries in session-state. Highest-signal:
`#a-logged-fix-location-can-be-the-defect` · `#the-bug-was-not-where-the-title-said` ·
`#my-mutation-matrix-lied-twice-before-it-told-the-truth` · `#fixing-one-bug-can-unmask-two` ·
`#the-user-could-not-understand-my-output`.
