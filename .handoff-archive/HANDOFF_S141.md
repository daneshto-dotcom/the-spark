═══════════════════════════════════════════════════════════
SPARK — Handoff Prompt
Generated: 2026-08-13 | Commit: `bb96595` | Session: S141 CLOSED
Working dir: `C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark`
STATUS: READY · **LIVE IN PRODUCTION**
═══════════════════════════════════════════════════════════

QUICK SUMMARY

SPARK is a 2D real-time multiplayer browser game (TS + Pixi, host-authoritative sim, optional Web
Worker, WebRTC, deterministic state hash). S141 shipped **four priorities and deployed them**. The
game now has its **first NON-GODLY buildable** — the STINK TOWER, four shapes — and the player can
finally **command their economy** with an ordered RTS build queue. `PROTOCOL_VERSION` is **20**; both
peers must reload. Deploy verified 4/4.

The session's defining finding: **the severe bug was in the space between two separately-reviewed
decisions.** Both Council seats rejected the tower's recipe for the same real reason and *both
proposed fixes were wrong* — one a provable no-op, one a regression. What actually mattered was that
the recipe and the death blast, each fine alone, would together have **detonated a blast inside the
player's own structure** the moment they kept building. Neither seat was shown the pair.

WHAT TO DO NEXT (priority order)

1. **⚠ 2-PEER CHECK ON v20 — ONLY YOU CAN DO THIS.** Two browsers, confirm the HELLO lockstep. The
   only runtime coverage of the version gate is the e2e **quarantine lane, which is fully red** and
   `continue-on-error`, so **CI cannot verify it and I did not claim it.**
2. **PLAYTEST THE STINK TOWER.** ⚠ **Its recipe shapes are a CLAUDE ruling, not yours** — the S139
   spec forbade guessing them and you were asleep, so I chose them on a measured collision sweep and
   made the retune a ONE-LINE edit. Watch for **accidental construction**: a Square among three loose
   Circles builds one. It self-heals and cannot blast you, but it may still feel wrong.
3. **PLAYTEST THE ORDER QUEUE.** Click shapes in the castle panel; they queue with ×N chips. Does it
   read as commanding your economy, or as one more panel? ⚠ It is in the PANEL, not the footer B4
   specified — the later S136 ruling deleted the footer, so the later ruling won.
4. **THE AGGRO PULL ONLY WORKS ON GOBLINS.** Stated, not hidden — `targetPrimitiveId` is read only by
   creatures whose config has `targetsStructures`. A Voltkin walks straight past a depleted tower.

ACTIVE PLAN
→ `.claude/plans/2026-08-13_PDR_S141_stink_tower_and_order_queue.md` (P1–P4 ALL COMPLETED)

⭐ THE TWO COUNCIL FINDINGS THAT DID NOT SURVIVE PRIME-AUDIT

- **"The death blast will double-fire."** Both seats. `damage.ts` deletes the defender **in the same
  call**, and the poll iterates a snapshot — no double-fire. Gemini's `dying: boolean` would have
  added a serialized + hashed field for nothing. Structural idempotence (remove first) instead.
- **"You'll miss gatherer-carried sparks."** Both seats. A hauled spark **is** in `freeSparks` (escrow
  `'hauled'`); only *deposit* removes it. `castleBanks` really was the only hole. Do not widen the
  allocator scan on that advice.

⛔ CORRECTIONS TO THE RECORD — six stale docs, one of them dangerous

- **`voltkinFrames.ts` said two PNGs were deleted. They ship.** Git-tracked, in `dist/`, loaded by six
  production modules. A cleanup driven by that comment would have broken live art with **tsc and the
  bundle gate both green** (string literals are invisible to both) — and `public/**` is in
  `deploy.yml`'s paths filter, so the deletion would have **shipped itself**.
- **`deploy.yml` was stale in the OPPOSITE direction**: it warned `npm test` is watch mode and booked
  a `test:run` script as an open carry-forward. S133 fixed that already. **Strike that carry-forward.**
- **`stateHash.ts` named `FAMILY_COVERAGE` twice.** No such symbol; it is `FIELD_COVERAGE`.
- **`gathererLifecycle.ts`'s header** claimed "ONE action" above five, and called the gatherer
  "static … parked at the keep" above a full three-state haul FSM.
- **Two docblocks claimed a deposit "stores a TYPE and DESTROYS the spark".** It stores the whole live
  entity — which is exactly what lets a pull return the same id.
- **`main.ts:1706` was cited in ten places.** A.0 measured 1766; it had drifted to **1793** by the end
  of this same session, from this session's own edits. All eleven are now **symbol-anchored**.

⛔ STILL BLOCKED ON YOU

- **R7 (the design library) is not implementable as ruled.** Per-browser localStorage means peers hold
  *different* libraries and the host cannot validate "I own this design" — contradicting the design's
  own §5 non-negotiable host-validation contract.
- **Owner-gated, standing:** `origin/gh-pages` deletion.

CARRY-FORWARD
15 entries in `session-state.json → carry_forward`. **The Stink Tower and the order queue are now
DONE — strike them.** The `npm test` watch-mode entry is also stale (fixed in S133). Still live: the
fully-red e2e quarantine lane, the deferred ranged goblin and producer towers.

TRAPS THAT WILL BITE

* **Unanimity on a FINDING does not transfer to the FIX.** Two seats agreed on the problem; both
  remedies were wrong. Price the diagnosis and the prescription separately.
* **Review the CROSS PRODUCT of decisions that touch one object**, not the list. That is where the
  only severe bug of this session lived.
* **A tsc forcing function can be satisfied without doing anything.** `stateHashFull`'s guard fires by
  name, but the hash PROJECTION is a hand-written template with no executable link to it — add the
  name and tsc goes quiet while the field stays UNHASHED and the oracle goes blind.
* **A stale comment can be an instruction to break production.** See `voltkinFrames` above.
* **Renumbering a line citation ships a fact with a half-life of hours.** Anchor on symbols.
* **Rebuild before `verify-deploy`.** A stale `dist/` makes the LIVE carrier compare the wrong hash —
  it gave a false FAIL this session, and it can give a false PASS just as easily.
* **Cap the A.0 fan-out.** 31 agents hit the spend limit; every adversarial verification died. Second
  session running. Read the highest-risk area by hand FIRST.

FULL HANDOFF DOC
→ `boot-snapshot.md` — **read this FIRST** instead of handoff + backlog + reflexion.
→ `.handoff-archive/HANDOFF_S141.md` (permanent copy)

PRE-FLIGHT

* [ ] Read `boot-snapshot.md`
* [ ] `git rev-list --count origin/master..master` (NOT the inverse — it lies)
* [ ] `npm run build` **then** `npm run verify-deploy` — expect 4/4 (rebuild FIRST; see the traps)
* [ ] `npm run e2e:gating` — expect **36 passed / 0 failed** (was 34; +2 runtime specs)
* [ ] Note `PROTOCOL_VERSION` is **20**; a v19 peer is hard-rejected at HELLO

SESSION RULES

* SESSION PDCA — priorities from BACKLOG.md, PDR gate before any implementation
* PORT PROTOCOL — use `$SESSION_PORT`
* B5 match length is RULED CLOSED — do not re-raise (LOCKED_DECISIONS.md)
* `origin/gh-pages` deletion remains OWNER-GATED
* Pushing `master` = shipping to production. There is ONE deploy path.
═══════════════════════════════════════════════════════════
