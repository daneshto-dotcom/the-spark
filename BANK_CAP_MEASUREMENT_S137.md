# Is `CASTLE_BANK_CAP = 5` still right? — measured, S137 P3

**Short answer: the cap is not the knob you think it is. Don't raise it to fix hauler stall — that
won't work. Raise it (or don't) based on which RECIPE you want to be able to hold outright.**

Nothing was tuned. `CASTLE_BANK_CAP` still ships as **5**. This is the measurement the ruling needs.

## What was measured

`e2e/bank-throughput.spec.ts` (`@perf-measure`, soak lane — not gating). Real browser, real physics,
real gatherer AI. Solo, one gatherer, **no consumer** (nobody spending), 60 s per cap, sampled every
250 ms. `__TEST_CASTLE_BANK_CAP__` varies the cap; the spec asserts the seam actually reached the
running game before trusting a single number.

| cap | shapes banked in 60 s | time-to-full | WAITING (whole run) | **WAITING (after saturation)** |
|----:|----:|----:|----:|----:|
| **5** | 5 | 20.2 s | 58.6 % | **88.7 %** |
| 6 | 6 | 19.4 s | 63.3 % | **94.1 %** |
| 8 | 8 | 28.6 s | 47.4 % | **90.8 %** |

## What it says

1. **Raising the cap does not reduce stall.** Post-saturation the hauler stands still ~**89–94 %** of
   the time at *every* cap. Cap 8 is no better than cap 5 (90.8 % vs 88.7 %) — inside noise.
2. **Total output over the whole run is exactly the cap.** 5/5, 6/6, 8/8. With nobody spending, a
   gatherer fills the bank once and then stops for good. There is no steady-state throughput to
   improve; there is a one-shot fill followed by a permanent stall.
3. **So the binding constraint is CONSUMPTION, not capacity.** Raising 5→8 buys ~3 more shapes and
   delays the stall by ~8 s. It does not buy throughput. This is what "the bottleneck MOVED" in S136
   actually means, and it means the fix lives in spending (build queue / faster building / more
   sinks), not in the bucket.
4. **H1 (time-to-full grows with cap) is NOT cleanly supported** — 6 filled *faster* than 5
   (19.4 s vs 20.2 s). One run per cap cannot resolve that; treat time-to-full as ±few seconds.
   Reported rather than quietly dropped.

## So what should the cap actually be chosen for?

The cap's real job is the question *"which recipe can I hold outright?"* — which is exactly why the
recipe-size table lives beside it in `constants.ts`. From that table:

| cap | largest recipe holdable outright |
|----:|---|
| **5** (today) | pentagram (5) |
| 6 | + lightningHub (6) |
| 7 | + Helga (7) |
| 8 | + Voltkin (8), laserTurret (8) |
| 9 | + NONET (9) |

**Recommendation (owner's call, not taken):** leave the cap at 5 *if* the intended feel is "you must
build as you gather". Move it to **8** *if* you want a player to be able to stockpile a full Voltkin
or laserTurret and place it in one go — which is also precisely what the in-bubble build space
(V6-1.3 P2) is for, so these two decisions should be made together, not separately.

⚠ Never change the cap without re-reading that table in `constants.ts` — the two are one decision.

## Caveats, stated

- **No consumer.** H3 — that periodic spending removes the stall at every cap — is **not measured**.
  Driving a realistic consumer needs a dispatch seam `__SPARK__` does not expose. Carried forward.
- One gatherer, one run per cap, solo. Multi-gatherer economies are not covered.
- The S136 handoff reported "fills in ~10 s" and 247/338 WAITING; this measures ~20 s and 88.7 %
  steady-state. Different windows and sampling, so not a contradiction — but this run's method is
  stated above, and the first cut of it (22 s) was **wrong**: it ended before the bank saturated and
  reported "0 % WAITING at every cap", i.e. "no bottleneck". The spec now fails loudly if any cap
  never saturates inside the window, so that error cannot recur silently.
