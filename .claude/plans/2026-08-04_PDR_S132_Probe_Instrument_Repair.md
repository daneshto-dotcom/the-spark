# PDR S132 — Probe instrument repair (make the Phase-1 gate trustworthy)

**Tier:** Micro (<10K; 1 code file + 2 doc files)
**STATUS: COMPLETED**
**Priority id:** `P1-probe-instrument-repair` (dot-free — a dotted id fails `validate_priority_id` and the unlock mint silently no-ops)
**Deliberation:** waived on the user path (`pdr_approved` + `unlock_source: user`), per Rule 17 Micro opt-in.
**A.0 STATE-DISCOVERY:** ✅ RUN THIS SESSION, EMPIRICALLY — see §A.0 below. Not skipped, not inferred.

---

## OBJECTIVE

Make the V6-0.1 economy probe harness trustworthy **before** the owner spends a playtest on it.
That playtest gates **all of Phase 1** (B3 + B4), has been outstanding for four sessions, and the
instrument had never once been exercised. It has now been driven headlessly and it *works* — but
the run surfaced one real bug that silently drains the inventory, and one framing trap that would
have led the owner to rule B3 the wrong way.

This is not "add a feature". It is: an instrument that produces a misleading number is worse than
no instrument, because the ruling it produces is load-bearing for seven Full-tier slots.

## §A.0 — STATE-DISCOVERY (empirical, this session)

Driven in headless Chromium via the project's own `playwright` (swiftshader), the S131 recipe. The
probe's overlay is a DOM node (`el.textContent`, `[data-probe]`), **not** Pixi, so B3's numbers need
no compositing — the two prior sessions' "HUD unverifiable" constraint does not apply here at all.

| Probe | Expected | Measured | Verdict |
|---|---|---|---|
| Arms on `?probe=1` | overlay + console | `ARMED` line + `[data-probe]` present | ✅ |
| Sim advancing | 120 ticks / 2 s | **122** (61 Hz effective) | ✅ |
| `probeBootstrap` import order | first import | `main.ts:27`, lines 1-26 are docblock | ✅ |
| Keys `1`-`6` stock | 8/8 | `8/8  Sqr ×8` | ✅ |
| `Q` draw | Idle → Carrying | Idle → **Carrying** | ✅ |
| `?spawn=N` reaches `constants.ts` | `(OVERRIDDEN)` | `λ 2.0000/s (OVERRIDDEN)`, throughput 1.866/s (n=168) | ✅ |
| Faucet throughput @ default | 0.1875/s | **0.1933/s** (n=29 / 150 s, Poisson SE 0.036) | ✅ |
| Free-spark lifetime | 600 ticks | **600.0, min=max=600** | ✅ |
| Standing pool | λ·W = 1.93 | **1.81** | ✅ |
| 8-slot fill @ fair 1/6 share | BACKLOG says ~256 s | **248 s** | ✅ |
| `FREE_SPARK_SOFT_CAP = 50` reachable? | claimed dead code | pool peaks at 4 — **dead** | ✅ |

**⇒ B3 IS EMPIRICALLY CONFIRMED.** Measured, not asserted. The BACKLOG's numbers were right.

### DELTA-1 — the probe cannot reproduce the condition it exists to rule on

The probe is **solo-only by design** (auto-disarms the instant a peer or bot appears,
`probeHarness.ts:290,342`), but B3/B4 are **six-seat** claims. In solo the local player receives the
**whole arena faucet**, so an 8-slot bank fills in **41 s** here versus **248 s** at a fair 1/6
share — a faucet **6× more generous** than the one B3 describes. The handoff's playtest URL
(`/?probe=1&regime=new&slots=8`) carries no correction, so the owner would very likely rule
"starvation isn't real" and be wrong.

Fixable for free with the lever that already exists: **`&spawn=0.03125`** (= 0.1875 ÷ 6) makes a
solo run represent one seat's fair share.

### DELTA-2 — `Q` while carrying silently destroys an inventory slot (real bug)

`probeHarness.ts:291` calls `inventory.shift()` **above** the carry-1 guard at `:294`. Measured:
`8/8` → `7/8` (genuine draw) → **`6/8`** (refused draw, item consumed anyway). A human presses `Q`
while already carrying constantly. The bank leaks under exactly the input pattern a playtest
generates, and `buildCount` / `peakPrimitives` under-read along with it.

### REFUTED (recorded because the reasoning matters)

`Q` **is** double-bound — the in-game hint at `main.ts:888` advertises "Q shrink territory" and
`probeHarness.ts:326` binds `q`/`Q` to draw. It cannot fire: `decideKeyShrink` returns false when
`gameMode === 'solo'` (`controls.ts:868`) and the probe auto-disarms outside solo. **The collision
is real; the solo guard is the only thing preventing it.** If the probe ever gains a bots or
networked mode, this becomes live — logged as a carry-forward, not dismissed.

### Self-correction

My first two readings called the λ·W model "wrong in both directions" (pool 2.73 vs 1.88 predicted;
12.79 vs 20.00). Both were artifacts of my own reading protocol, not the instrument: a 63 s window
on a process with a 10 s TTL carries ~6 independent samples, and the λ=2.0 run was held only 12 s —
**entirely inside the ramp**. Held past the ramp with a tick-locked census the model is correct.
This is the boot snapshot's own *#measure-inside-the-hold-not-on-the-edge-of-the-ramp*, re-learned
the hard way.

## SCOPE

1. **`src/dev/probeHarness.ts`** — (a) hoist the carry-1 / player-exists guard **above**
   `inventory.shift()` so every refusal path leaves the inventory untouched; (b) name the shipped
   λ as a const (`SHIPPED_SPAWN_RATE_PER_SECOND = 0.1875`) and reuse it for the existing
   `Math.abs(SPAWN_RATE_PER_SECOND - 0.1875)` comparison — removes a magic number rather than
   adding one; (c) print the seat-share arithmetic **on the overlay**, stating whether the current
   run is 6-seat-representative, so the 41-vs-248 s trap cannot be read past.
2. **`boot-snapshot.md`** + **`BACKLOG.md`** — correct the playtest recipe to carry
   `&spawn=0.03125`, and record B3 as empirically confirmed with the measured figures.

**OUT OF SCOPE:** the `Q` rebinding (refuted — carry-forward only); anything in Phase 1; the push
(owner-gated, needs `gh auth login`); B4's human judgment, which no headless run can substitute for.

## TESTING

- **Mutation-test both guards, do not merely watch green.** S131 broke 4 of 4 guards written that
  same session by deleting 1-2 lines each, suite green every time. For each new assertion: delete
  the production line it defends, confirm the test goes RED, restore.
  - Guard A: reorder the `shift()` back above the carry-1 check → the new reducer test must fail.
  - Guard B: delete the seat-share line from the overlay → its assertion must fail.
- **Re-run the headless driver** and confirm `Q`-while-carrying no longer decrements the inventory
  (`8/8` → `7/8` → `7/8`), and that the seat-share line renders with the right numbers in real pixels.
- tsc 0 · full `npx vitest run` green (never `npm test` — bare `vitest` is watch mode) · bundle
  measured. `probeHarness.ts` is DEV-only so the production entry chunk must not move; report the
  measured delta rather than assuming zero.
- **Production-stripping guard still holds:** after `npm run build`, `PROBE_SENTINEL` must be ABSENT
  from the bundle.

## ACCEPTANCE

1. `Q` while carrying is a no-op on the inventory — measured in a real browser, not inferred.
2. The overlay states, on screen, whether the run represents a 6-seat share, with both fill numbers.
3. Both guards proven non-vacuous by mutation.
4. The playtest recipe the owner reads carries `&spawn=0.03125`.
5. `PROBE_SENTINEL` absent from the production bundle.
