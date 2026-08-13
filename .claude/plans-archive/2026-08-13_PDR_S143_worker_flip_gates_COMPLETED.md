# PDR — S143: close the three gates blocking the sim-worker default-on flip

**STATUS: COMPLETED** (3/3 priorities shipped, deployed 4/4, CI-verified)
**Tier:** Standard (batch) · **Approved:** user, explicit ("approve!") · **Session:** S143 · 2026-08-13

## OBJECTIVE

Close the three measured items blocking the sim-worker default-on flip (LOCKED since S129,
14 sessions overdue), plus one flip-caused regression found during A.0 that appears in no document.
**The flip itself is deliberately NOT taken** — both Council seats ruled in S142 that it must not
ship in the same session as its own safety fixes, and that still holds.

## A.0 STATE-DISCOVERY (Rule 21)

3 capped Workflow probes (3/3 returned, 448K subagent tokens) + first-hand disk verification of
every load-bearing claim before use. Fan-out capped at 3 after three consecutive sessions lost work
to the individual spend limit.

Verified by hand before acting: `main.ts:2203` successor bypass · `botConfig` MID
`buildCooldownTicks=210` · `main.ts` dtSec clamp 0.05 ⇒ ≤3 ticks/frame · `razePrimitives.ts:78`
`primitives.delete` ⇒ non-monotonic · `simWorkerDriver.ts` 108 lines, NO watchdog ·
`probeHarness.ts:342` vs `main.ts:418` double-parse.

## SCOPE (3 priorities)

**P1 — Flip safety prerequisites** (`2e1b5ec`)
1. ONE shared worker-flag predicate (`src/workerFlag.ts`) read by both parse sites
2. A real `?worker=0` opt-out — did not exist; every read was `=== '1'`
3. Fix the probeHarness guard **inversion** (refuse on worker ACTIVE, not on URL spelling)
4. Fix the migration-successor INTENT bypass at `main.ts`
5. Watchdog on `SimWorkerDriver` so a silent hang can reach the existing fallback

**P2 — Repair the `worker-bots` gating test** (`4781be8`, e2e only, no src)
1. Tick-budgeted wait (`waitForWorldWithinTicks`) with wall-clock demoted to a dead-page backstop
2. Cumulative-creation oracle (`maxPrimitiveId`) replacing the non-monotonic `primitives.length`
3. Failure message that distinguishes dead-page / unmet-predicate / out-of-runway
4. `retries: 0` on this spec (S127 `PW_RETRIES` precedent)

**P3 — Differential harness** (`b3b6b77`)
1. Seed `gathererOrders` via ENQUEUE/CANCEL in the shared `scriptInputs`
2. Per-family meaningfulness guard replacing the 10-family SUM
3. `gathererOrders` added to `structuralSignature` (the other unforced site) + a forcing test

## DELIBERATELY DE-SCOPED

- **The flip itself.** Now a one-constant change (`WORKER_DEFAULT_ON`). Wants `defenders` seeded
  and one owner playtest first.
- **The `spawnedCount` / TAKEOVER host-migration defect.** A.0 measured it fires with the flag
  **OFF** too, so S142's headline diagnosis ("the blocker the flip creates") was wrong. It is a
  pre-existing host-migration defect, tracked as such, not a flip gate.
- **Seeding `defenders`.** ~2–4 h; needs real stinkTower recipe geometry because `hostTick`
  re-validates and tears down an injected defender within one tick. Acknowledged in code and
  printed on every run.

## TESTING / GATES (all met)

tsc 0 · vitest **2304/2304** (153 files, from 2275/150) · e2e:gating **36/36** local ·
**mutation matrix 7/7** · bundle **678.2/750 KiB** (71.8 KiB headroom) · deploy **4/4** ·
MCV **26/26**, hard_fail=0 · Rule 22: **14/14** cited symbols verified on disk ·
**no PROTOCOL_VERSION bump** (stays 20).

**CI verification (the point of P2):** two consecutive green gating runs — `31737846412`,
`31738493370` — against failures in 2 of the 3 runs before (`31707927282`, `31730999721` red;
`31712230199` green).

## SELF-CORRECTIONS ON RECORD

1. My first growth oracle used `nextPrimitiveId` — host-only and **frozen on a worker mirror**. It
   printed "INSTRUMENT OK, PREDICATE GENUINELY UNMET — a real product failure" while the game built
   normally. Caught by measuring cursor 33 against a live primitive with id 38.
2. My first per-family table read the **final frame** and failed on `rainbows` — 0 only because a
   rainbow spawns and despawns mid-run. Now tracks the PEAK across compared frames.
3. My `structuralSignature` fix was itself **decorative** — deleting both terms left the suite
   green until a forcing test was added.
4. I invalidated a full gating run by editing `src/state/workerSim.ts` **while it executed**
   against a live vite dev server. The clean rerun was 36/36; I nearly attributed 3 phantom
   regressions to my own correct changes.
