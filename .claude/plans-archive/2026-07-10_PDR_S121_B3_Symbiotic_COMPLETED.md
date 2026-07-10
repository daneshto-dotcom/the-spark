# PDR — S121: B3 symbiotic-combo follow-ups (rigidity telegraph + income keystone → deploy)

**Session:** S121 · **Tier:** Standard (batch; highest-tier rule) · **Deliberation:** 3-way Council (1 round) + PRIME-AUDIT
**Owner taste calls (locked this session):** telegraph = **A · rigidity pulse** (gold pulse from anchor outward); income combo = **Income Keystone** (Filament confers income to branched magic).

---

## 1. OBJECTIVE
Close the two B3 follow-ups so the symbiotic-combo vision reads as a *system* on both axes and is player-visible:
- **P1 — Keystone rigidity telegraph:** make the S118 Keystone Anchor conferral VISIBLE (today it is silent — you only feel it in contested territory). A gold pulse travels from each un-fouled Anchor along the magic bonds it is keystone-linked to.
- **P2 — Income Keystone:** a second symbiotic combo on the *income* axis (mirrors the rigidity Keystone). A **Filament** (the income combo) confers a small income bonus to MAGIC bonds branched off its endpoint primitives → build TOPOLOGY becomes an income decision, not just a rigidity one.
- **P3 — Deploy:** manual `npm run deploy` (Actions dead per billing lock) — first player-visible change since S118.

**North Star tie:** both make "WHERE you connect shape A to shape B" tactical — the geometric-builder core.

## 2. SCOPE (files)
**P1 (render-only, pure cosmetic — zero determinism impact):**
- NEW `src/render/keystoneTelegraphRenderer.ts` + `keystoneTelegraphRenderer.test.ts`
- MOD `src/main.ts` — wire `keystoneTelegraphRenderer.sync(world)` immediately after `structureRenderer.sync(world)` (main.ts:1658), so pulses draw over the bond layer.

**P2 (scoring path — replay-self-consistent, NOT byte-identical-to-prior since it changes income by design):**
- MOD `src/state/scoring.ts` — add a keystone-income term to `computeAllComplexities` (the single impl).
- MOD `src/state/scoring.differential.test.ts` — mirror the new term in the reference loop (lockstep, or the differential gate fails).
- MOD `src/constants.ts` — new `KEYSTONE_INCOME_COMPLEXITY = 0.25` + `KEYSTONE_INCOME_MAX_NEIGHBORS = 3` (both #1 playtest knobs — post-Council revision, see §9).
- NEW `src/state/scoring.keystoneIncome.test.ts` — unit + determinism coverage.

**P3:** no code; `npm run deploy` after P1+P2 gates green.

**NOT changing:** combo table (36), PROTOCOL_VERSION (14 — wire schema unchanged; score field already synced), save format, the rigidity `keystoneAnchor.ts` physics pass, any HUD.

## 3. APPROACH / MECHANISM

### P1 — rigidity telegraph (render-side derivation, both peers)
Per frame, scan `world.bonds`; for each un-fouled **Anchor** (`isAnchorCombo`), find magic neighbor bonds sharing either endpoint prim (the SAME structural relation `applyKeystoneAnchor` uses), and draw a **gold** pulse traveling anchor→neighbor. Pulse phase driven by `world.tick` (synced) so host & joiner animate identically.
- **Why render-side, not `world.effects`:** `stiffnessMultiplier` is ephemeral + not synced, so joiners can't read the physics conferral. The structural relation (Anchor + magic neighbor + un-fouled) IS fully synced (prims/bonds/types/fouled set), so recomputing it at render time is the only cross-peer-consistent source. Pure cosmetic → no wire/save/determinism cost.
- **Structural, always-on (not territory-gated):** territory sag needs `computeTerritorialInfluence` (host-only, per-tick, not synced), too costly per render-frame and unavailable on joiners. So the pulse is a *persistent build-order cue* ("these magic bonds are keystone-linked"), subtle in home territory, meaningful in enemy territory. (Council Q2.)
- **Extends to income keystone (same module):** a **Filament** hub emits a **green** (income-colored) pulse to its magic neighbors — one renderer, two hub types/colors, so both symbiotic axes are visible and read as one system.

### P2 — Income Keystone (in `computeAllComplexities`) — post-Council revision
For each un-fouled **Filament**, count its un-fouled MAGIC neighbor bonds (sharing an endpoint prim, excluding the Filament itself), **capped at `KEYSTONE_INCOME_MAX_NEIGHBORS` (3) per Filament**; sum that capped count across the player's Filaments and multiply by `KEYSTONE_INCOME_COMPLEXITY` (0.25). A Filament is the income hub exactly as an Anchor is the rigidity hub.
- **Per-Filament cap (Council Q1 — both seats):** `min(#magic-neighbors, 3)` per Filament kills the "starburst 50 bonds off one Filament" amplification and rewards SPREADING income hubs geometrically rather than clustering. Max +0.75 complexity per Filament.
- **Order-independent / replay-self-consistent (Council Q3):** the per-Filament count and the `min()` cap are pure integer ops → the SUM is identical regardless of Map-iteration order (no tiebreaker, no float accumulation). Value 0.25 chosen for balance (0.3→0.25); the dyadic-FP concern is REFUTED for JS (spec-deterministic doubles; existing `×0.05` non-dyadic term already passes byte-identical replay).
- **Foul parity:** a fouled Filament stops conferring; a fouled magic neighbor isn't counted — matches `keystoneAnchor.ts` and the existing "fouled structure earns zero" rule.

## 4. DETERMINISM / REPLAY-SAFETY
- **P1:** cosmetic only; touches no world state → replay byte-identical by construction.
- **P2:** changes income *values* (intended feature), but is **replay-self-consistent**: `save.replay.test.ts` asserts `jsonA === jsonB` / `hashWorldState` A-vs-B (self-consistency, NOT golden fixtures), so both sim runs use the new formula and still match. Pure fn of synced state, host-authoritative, INTEGER-counted via a Set, ONE-shot final expression (no float accumulation) → no IEEE-754 order hazard, cross-peer identical. No PROTOCOL_VERSION bump (score field already exists on the wire). `scoring.differential.test.ts` stays bit-exact once the reference loop mirrors the term.

## 5. TESTING (gates — all must be green before P3)
- `tsc` 0 errors.
- vitest full suite green (currently 1841/1841), including: `save.replay` 24 self-consistency tests (P2 self-consistency), `scoring.differential` bit-exact (P2 term mirrored), stepPhysics/hostTick replay HARD gates.
- NEW `scoring.keystoneIncome.test.ts`: (a) a magic bond off a Filament earns the bonus; (b) off a non-Filament earns nothing; (c) double-Filament neighbor counted once (no stacking); (d) fouled Filament / fouled neighbor → no bonus; (e) determinism: two same-seed builds → identical complexity.
- NEW `keystoneTelegraphRenderer.test.ts`: GraphicsMock pattern (per `effectsRenderer.test.ts`) — draws for Anchor+magic-neighbor, no-op for lone Anchor / functional neighbor / fouled, gold vs green hub dispatch.
- LIVE smoke on `:$SESSION_PORT` dev — build an Anchor+magic branch, confirm the pulse renders, 0 console errors, tick advances.
- Bundle ≤ 750 KiB (currently 624.4).

## 6. RISKS / TRADE-OFFS
- **R1 balance (P2):** income is the spam-dominance lever. Mitigation: conservative `0.3` default, counted-once Set (no stacking), marked #1 playtest knob; leader-decay + functional-cap already bound run-away income.
- **R2 telegraph honesty (P1):** always-on pulse slightly over-states rigidity in home territory. Accepted as a build-order teaching cue; keep it subtle. (Council Q2.)
- **R3 per-frame scan cost (P1):** O(bonds×avg-degree)/frame — negligible even in a heavy TD world; single pass, no allocation churn in the hot loop (reuse a scratch set).
- **R4 differential drift (P2):** if the reference loop isn't updated in lockstep the differential gate fails — caught by CI, not shippable silently. Treated as a feature of the gate, not a risk.

## 7. DELIBERATION — NEW-surface decisions for 3-way Council
- **Q1 — Income Keystone magnitude + stacking:** is `0.3` counted-once the right default vs per-incidence or a lower value? Does it open a spam/coast exploit the existing caps don't already bound?
- **Q2 — Telegraph honesty:** structural always-on pulse vs some cheaper territory-approximation; is over-telegraphing in home territory a real UX cost?
- **Q3 — Determinism of the neighbor scan (P2):** confirm Set-membership counting is order-independent + replay-self-consistent, and the differential-test mirroring is the correct gate.
- Battle Ledger + PRIME-AUDIT appended before presenting for `go`.

## 8. SEQUENCING
P1 (cosmetic, lowest risk, unblocks visual verification of P2) → P2 (income mechanic + the shared green pulse) → gates → P3 deploy (one meaningful player-visible deploy carrying both). Per-priority completion protocol (commit → session-state check fields → `[ZERO]` line → reflexion entry) at each boundary.

## 9. DELIBERATION OUTCOME (3-way Council, 1 round + PRIME-AUDIT)
**Battle Ledger:**
- **Q1 Income-Keystone value/rule — CONCEDED to Council (both seats).** Grok "0.18 too-generous / degree≥3 rule"; Gemini "REJECT — magic bonds uncapped → starburst exploit, cap per-Filament." VERIFIED against `scoring.ts:189` (magic term uncapped) — finding is real. SYNTHESIS: per-Filament cap of 3 + value 0.25 (bounds the vector AND rewards spread; simpler than degree-scan). PRIME-AUDIT note: the uncapped-magic vector pre-exists (base ×2) and is physically bounded by placement/pairing/energy — the cap prevents the keystone *amplifying* clustering.
- **Q2 telegraph honesty — Council REJECT always-on; ESCALATED to owner (taste).** Both seats: always-on pulse mis-teaches rigidity in home territory. Counter: their fix (client-side territory derivation) couples the renderer to the host physics-territory formula (divergence risk) for a cosmetic. Owner is the taste arbiter → ratify always-on-subtle ("keystone-linked" framing, honest structurally) vs territory-gated (scope amendment) at `go`.
- **Q3 determinism/dyadic — Council changes REFUTED with proof.** Gemini "0.3 non-dyadic → x86/ARM desync": REFUTED — JS doubles are spec-deterministic for `+−×÷` (no FMA/x87), and `×0.05` (non-dyadic) already passes byte-identical replay. Grok "sort-by-ID tiebreaker": REFUTED — a pure count has no tiebreaker; sum is order-independent. Determinism gate as-designed (differential-oracle mirror + save.replay self-consistency) is correct + complete. 9th→10th #empirical-refutes-plausible-criticals watch (Q3 both seats' criticals refuted on merits).

**No vetoes.** Net design deltas from Council: (1) per-Filament cap 3; (2) value 0.3→0.25; (3) Q2 owner-ratification gate. Q3 unchanged (refuted).
