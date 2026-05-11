# PDR — Session 11 (Batch, Standard Tier)

**Generated:** 2026-05-11
**Tier:** Standard (~25K tokens estimated; 1 design-doc priority + 2 process priorities)
**Trigger:** S10 closed clean (179/179, all commits pushed, dev server up). The three backlog candidates are all user-gated:
  1. Cinematics tuning → PLAYTEST-GATED (user playtest pending)
  2. Audio integration → ASSET-GATED (Suno track pending) + forbidden by Phase-1 charter
  3. Phase 2 implementation → PHASE-2-GATED (no "ship Phase 2" sign-off)

Highest-value non-gated work is **design-doc prep for the Phase 2 conversation** when user signs off Phase 1 — same pattern as S9 P4 prepping S10 cinematics implementation.

**Status:** APPROVED — user said "APPROVED per your best recommendations" → Standard tier, Council ON, full pipeline + `/handoff` at close.

---

## OBJECTIVE

Deliver three priorities:

1. **Process drift cleanup** — push the 3 pending state-autocommits to `origin/master`; let hook bookkeeping reconcile.
2. **Phase 2 design decision matrix** — produce `docs/phase-2-design-options.md` covering 6 Phase 2 mechanics (fog of war, local multiplayer, Inject Spiral, Steal, multi-color structures, mega-combos). Same template as S9 P4's `docs/structure-cinematics-options.md`. Decision-ready, user-prunable.
3. **Closeout** — BACKLOG + reflexion + boot-snapshot + PDR archive + handoff + push.

## SCOPE

### Files touched

| File | LOC delta | Purpose |
|---|---|---|
| `docs/phase-2-design-options.md` | new ~280-350 | P2 design matrix (6 options × ASCII sketch + spec citation + cost + pros/cons + verdict + flag-for-veto) |
| `BACKLOG.md` | +30 / −2 | S11 entry + session map update (S11 → DONE, S12+ buffer) |
| `reflexion_log.md` | +~3 / −~3 | S11 entries + prune to 50-cap |
| `boot-snapshot.md` | regen | Standard regeneration |
| `HANDOFF_2026-05-11.md` | rewrite | Post-S11 root handoff |
| `.handoff-archive/HANDOFF_2026-05-11_S10_postS11.md` | new | S10 root archive copy |
| `.claude/plans-archive/2026-05-11_PDR_Session_11_COMPLETED.md` | new | This PDR archived at close |
| `.claude/session-state.json` | rewrite | S11 priorities + gate fields per CLAUDE.md |

**Files NOT touched:** All `src/**`, all `tests/**`, all `physics/**`, `LOCKED_DECISIONS.md`, `SPARK_Blueprint.md`. **No source changes this session.**

### Out of scope (deferred)

- Cinematics constants tuning (PLAYTEST-GATED).
- Audio integration scaffolding (ASSET-GATED + charter-forbidden).
- Phase 2 implementation (gated on user "ship Phase 2" sign-off; this doc prepares the conversation, doesn't ship Phase 2).
- LOCKED_DECISIONS changes (Phase 2 locks added with implementation, not design doc).
- Effects renderer decomposition (LOC under 500-charter — no breach).
- Cinematics perf audit (no user-reported regression — speculative).

## PRIORITIES (in execution order)

### P1 — Process drift cleanup (Micro, ~2K)

**OBJECTIVE:** Push the 3 unpushed state-autocommits (`c672bb3`, `5410e4d`, `60e588a`) to `origin/master`.

**SCOPE:** Git push only. No source change. Hook-bookkeeping drift in `.claude/session-state.json` (tool_calls counter) lets the next state-autocommit reconcile naturally.

**TESTING:** `git status` shows working-tree clean and `Your branch is up to date with 'origin/master'`.

**RISKS:** None material — push of state-autocommits is a no-op for source content.

### P2 — Phase 2 design decision matrix (Standard, ~15K)

**OBJECTIVE:** Produce `docs/phase-2-design-options.md` as a decision-ready matrix of 6 Phase 2 mechanics. Output is content the user can prune from when Phase 2 sign-off happens.

**SCOPE — 6 mechanics covered:**

| # | Mechanic | Spec authority |
|---|---|---|
| A | Fog of war | `SPARK_Blueprint.md § XIII Phase 2` + `LOCKED_DECISIONS Phase 2` |
| B | Local multiplayer | `LOCKED_DECISIONS Phase 2` (split-screen / hotseat / localhost-net) |
| C | Inject Spiral (disruption) | Spec § VIII disruption |
| D | Steal (claim opponent primitives) | Spec § VIII + multi-color implications |
| E | Multi-color structures | `LOCKED_DECISIONS Phase 2` (Steal-derived) |
| F | Mega-combos / connector chains | `LOCKED_DECISIONS Phase 2` |

**Per-option block (S9 P4 template):**
- ASCII sketch of mechanic in play
- Fires-when / works-how (1-paragraph mechanic statement)
- Spec alignment citation (`SPARK_Blueprint.md § X.Y`)
- Implementation cost (S = <100 LOC / M = 100-300 / L = 300-500) — anchored to similar S1-S10 module LOC
- Pros / Cons (3-5 each)
- Verdict line (1-sentence ranking)
- Flag-for-veto line (S8 #flag-for-veto-in-pdr)

**Cross-option layer (top of doc):**
- Prerequisites graph (e.g., Steal → Multi-color → renderer changes; Local-MP → World schema split; Inject Spiral → strain injection plumbing)
- Tier groupings (foundation / core combat / ambient / richness)
- 3-5 open questions for user pick before S12+ implementation

**Recommendation block (end of doc):**
- Tiered rollout proposal (which 1-2 mechanics first if user says "ship Phase 2 minimal")
- Rationale grounded in dependency graph + Phase 1 playtest-readiness

**TESTING (acceptance gates):**
- Doc exists at `docs/phase-2-design-options.md`
- 280-400 lines (matches S9 P4 precedent)
- All 6 mechanics have all template fields
- All `§ X.Y` spec citations resolve to actual sections
- Cost anchors cite real S1-S10 module LOC (e.g., bondVisualRenderer.ts ≈ 400 LOC)
- Recommendation + open questions present

### P3 — Closeout (Micro, ~3K)

**SCOPE:**
- `BACKLOG.md` S11 entry inserted; session map updated (S11 DONE)
- `reflexion_log.md` prepended with S11 entries (≤3); prune to 50-cap
- `boot-snapshot.md` regenerated
- PDR copied to `.claude/plans-archive/2026-05-11_PDR_Session_11_COMPLETED.md` and removed from `.claude/plans/`
- `HANDOFF_2026-05-11.md` at root replaced; S10 root → `.handoff-archive/HANDOFF_2026-05-11_S10_postS11.md`
- Per-priority commits + push (S9 rule)
- session-state.json: per-priority `checkpoint_commit` + `check_completed:true` + verbose `check_method` per INTEGRITY-WARNING PROTOCOL
- Run `/handoff` skill per user direction at the very end

## DELIBERATION

**Council ON** per Standard tier + user "per your best recommendations" approval. 1 round Trident Strike.

- Claude (Prime Architect): this PDR
- Grok (Disruptor): challenges, alternatives, risk register on the Phase 2 design matrix scope
- Gemini (Quality Auditor): short-form scorecard + 3+ challenges

Battle Ledger to be appended below at synthesis time.

## RISK REGISTER (Claude — pre-Council)

| Risk | Severity | Mitigation |
|---|---|---|
| P2 design doc claims spec content that isn't there | Med | Per-claim `§ X.Y` citation; PRIME-AUDIT verifies citations resolve |
| P2 cost estimates wrong (LOC sandbagging or balloon) | Med | Anchor each estimate to a similar S1-S10 module's actual LOC; PRIME-AUDIT spot-checks 2 anchors |
| P2 prerequisites graph claims impossible orderings | Low | PRIME-AUDIT walks DAG, verifies no cycle, B→C→D→E chain matches semantics |
| P3 50-cap reflexion prune drops a load-bearing entry | Low | Prune oldest S1-S6 detail entries already partially pruned; preserve SESSION-level entries from S5-S10 |
| P1 state-autocommit race | Low | Push is read-only from local; hook reconciles after |

## TOKEN BUDGET (informational — defer to UI counter per CLAUDE.md S35 rule)

- P1: ~2K
- P2 prep (Council R1): ~5-7K
- P2 main: ~15K
- P2 PRIME-AUDIT: ~2K
- P3: ~3K
- Buffer: ~3K
- **Estimated total: ~30K-35K** (Standard ceiling 30K; Council R1 + heavy PRIME-AUDIT adds ~5K)

## EXIT GATE

- [ ] P1: 1+ commits pushed; `git status` clean tracking origin
- [ ] P2: `docs/phase-2-design-options.md` exists, 280-400 lines, all 6 mechanics, recommendation + open questions, all spec citations resolve
- [ ] P3: BACKLOG entry, reflexion entries, boot-snapshot regen, PDR archive, handoff replaced
- [ ] Tests still 179/179
- [ ] Typecheck still clean
- [ ] `/handoff` skill run

---

## BATTLE LEDGER (Council R1 — synthesis)

```
+==============================================================+
|     COUNCIL DELIBERATION — P2: Phase 2 design matrix         |
+==============================================================+

TRIUMVIRATE POSITIONS
  Claude (Prime Architect): 6 mechanics, S9 P4 template, markdown matrix
  Grok (Disruptor):         drop F or fold E; question md vs prototype;
                            add decay; verify all spec citations
  Gemini (Quality Auditor): REVISE — playtest-feasibility/option, risk-
                            block/option, rationale for 6, missing 7th-
                            mechanic affordance

BATTLE LEDGER
+---+----------------------+---------------------+---------------+-------------+
| # | Decision             | Claude / Grok / Gem | Authority     | Resolution  |
+---+----------------------+---------------------+---------------+-------------+
| 1 | Mechanic count       | 6 / drop F / 6+QA   | Spec faithful | 7 (Sever    |
|   |                      |                     |               |  added)     |
| 2 | F standalone vs E-dep| std / E-dep / NA    | Grok (risk)   | E-dep       |
| 3 | Drop G (Mega-combos) | keep / drop / NA    | Claude (impl) | KEEP        |
| 4 | Add decay as 8th     | keep 6 / add / NA   | Both          | Open Q #5   |
| 5 | MD vs interactive    | MD / interactive    | Gemini (tool) | MD+Mermaid  |
| 6 | Per-option risks     | implicit / NA / yes | Gemini (qual) | ADDED       |
| 7 | Per-option playtest  | implicit / NA / yes | Gemini (qual) | ADDED       |
| 8 | Cost anchors         | subj / regress / NA | Grok (logic)  | S1-S10 LOC  |
+---+----------------------+---------------------+---------------+-------------+

Resolution types used: ADDED, KEEP, BOTH-AGREE, GROK-CONCEDED, GEM-ADOPTED

QUALITY SCORECARD (Gemini)
  Quality: 3/5 | Efficiency: 4/5 | Tool Utilization: 3/5 | Completeness: 3/5
  → Post-revisions, expected: 4/5 across (Risks + playtest + rationale added).

VETO LOG
  No vetoes used.

RISK CONSENSUS
  Agreed: doc-only is correct given Phase-1 charter forbids out-of-band code stubs.
  Agreed: spec is authoritative for mechanic list (justifies 7 not 6).
  Unresolved → Open Questions in the doc (5 of them).

JOINT PLAN
  7-mechanic matrix; Mermaid prereq graph; per-option ASCII + spec + cost +
  pros/cons + risks + playtest-readiness + verdict + flag-for-veto;
  open-questions section; tiered rollout recommendation.

CONFIDENCE: HIGH (within bounded design space — Phase 2 mechanics are spec-enumerated)
```

## PRIME-AUDIT delta (Rule 20)

Per-priority audit completed:

**P1 (push):**
- ✅ All 3 state-autocommits pushed (f46f56e..60e588a).
- ✅ Working tree tracking origin/master.
- ✅ No source/test/typecheck regression possible (push is content-preserving).

**P2 (design doc):**
- ✅ Doc exists at `docs/phase-2-design-options.md`.
- ⚠️ Line count: 523 (vs 280-400 target). **Reason:** Council-added Risks + Playtest-Readiness sections per Gemini quality concern (~25 lines × 7 options = 175 added). **Verdict:** materially better than R1, not just longer — accept overage.
- ✅ All 7 mechanics have all template fields.
- ✅ All spec citations resolve: § II (48), § III.4 (98), § III.7 (matched), § V (184), § VI.3 (256), § VI.4 (269), § VI.5 (279), § VII.1 (298), § VII.2 (315), § VIII.3 (345), § VIII.4 (357), § VIII.6 (373), § X.2 (436), § X.4 (460), § XI.8 (532), § XIII (733), § XIV (799), § XV (825).
- ✅ Mermaid graph: B→C, B→D, B→E, E→F; A→{C,D,E} dotted; G standalone. No cycles. DAG valid. B→C→D→E chain matches `§ VIII.3` semantics (disruption suite all require Local-MP).
- ⚠️ **Initial cost anchors were stale** — fixed: world.ts 370→481, effectsRenderer.ts 470→569 (S10 grew both). Updated table reflects live LOC.
- ⚠️ **CARRY-FORWARD:** `effectsRenderer.ts` at 569 LOC is OVER the 500-LOC soft charter (anti-bloat § XV). Likely refactor target for S12+: split per-kind draw into separate files (BOND_COMMIT.ts / SEVER_ERASE.ts / STRUCTURE_GROW.ts / STRUCTURE_MERGE.ts / SCORE_TIER.ts) once Phase 2 adds more kinds.

**Open Questions list is not trivially answered:**
- Q1 (MP sub-mode): 3 defensible answers (B.1/B.2/B.3).
- Q2 (minimal vs full): 2+ defensible answers.
- Q3 (Spiral propagation): 3+ defensible answers (1-hop/2-hop/strain-scaled).
- Q4 (steal+combo): 2 defensible (retroactive vs future-only).
- Q5 (decay): 2 defensible (Phase 1.5 vs Phase 2).
- Q6 (Sever inclusion): 2 defensible (include vs deliberate omit).
- Q7 (F depth): 2 defensible (solid flip vs gradient).

**Council verdict (post-revisions): SHIP.**

