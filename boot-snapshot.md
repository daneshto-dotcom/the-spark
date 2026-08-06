# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-06 | Session: S133 (3/3 priorities · 51 commits PUSHED · deploy verified live)

## ✅ THE TWO GATES THAT BLOCKED SIX SESSIONS ARE BOTH RESOLVED OR ANSWERED
**Auth is fixed and everything is pushed. `git rev-list --count origin/master..master` = 0.**
S131's CI gate **WORKS** — first-ever execution passed (`✓ Unit tests (gating — a red test now
blocks the deploy)`, build 1m4s, deploy 11s). Prod is verified live and hash-identical to the
local build. HEAD `24f13fa`. Live: https://daneshto-dotcom.github.io/the-spark/

## ⛔ ONE NEW HAZARD, AND IT IS THE MOST IMPORTANT THING ON THIS PAGE
**A PUSH DOES NOT RELIABLY DEPLOY. VERIFY, NEVER INFER.**
Two consecutive qualifying pushes landed and created **ZERO workflow runs** (45-commit, then a
2-commit one touching `package.json`). GitHub logged the `PushEvent` both times. Actions
`enabled:true`, workflows `active`, paths filter matched, public repo, valid YAML, far under the
1,000-commit threshold, no late-arriving run. **Root cause unknown and deliberately not guessed at.**
- **Deploy with:** `gh workflow run deploy.yml --ref master`
- **Then ALWAYS:** `npm run verify-deploy` — 4 carriers (REMOTE / RUN / VERDICT / LIVE), exits
  nonzero, names the failing one. `cancelled` counts as FAILURE. Mutation-tested 5/5.
- Full probe table in `BACKLOG.md` CARRY-FORWARD LEDGER; `SPARK_Blueprint.md` §XV.7 corrected.

## STATE
tsc 0 · vitest **2020/2020** (132 files; was 2001/130 at boot) · bundle **645.4/750 KiB** entry
**660,916 B — DOWN 100 B** from S132 · PROTOCOL_VERSION **15** (no bump) · **MCV exit 0** (22
bindings, 3/3 priorities) · review gate APPROVED · `npm test` now EXITS (was watch mode — fixed).
⚠ `origin/gh-pages` still exists with 1 commit not on master — **its deletion is the owner's call**,
deliberately not actioned.

## Next Steps
1. **Structure-HP + `damageEntity` slot** — owner-ruled (S130) to precede V6-2.1, and S133 built its
   prerequisite. It is now MUCH safer to attempt: adding `hp` to `Primitive` **fails `tsc` by name**
   via `FIELD_COVERAGE` in `src/state/stateHashFull.ts` (mutation M13 proves it). Register new
   families/fields THERE, never in `stateHash.ts`'s deliberately-narrow `HashableWorld`.
2. **OWNER: the probe playtest** — still the only thing gating ALL of Phase 1 (B3 supply is settled;
   B4 is the open human judgment). `npm run dev` → `/?probe=1&regime=new&slots=8&spawn=0.03125`.
   ⛑ `&spawn=` is NOT optional — without it the faucet is 6× too generous and you would rule wrongly.
   Confirm the overlay reads `✅ = ONE SEAT of a 6-seat match`; hold ≥60 s for `✅ past the ramp`.
3. **Creature deletion on host migration** — a NOW-VERIFIED live bug, and worse than logged: ALL
   THREE `CREATURE_CONFIGS` are `persistent:false`, `despawnAtTick` rehydrates to 0, and a promoted
   client runs the lifetime gate ⇒ **the successor deletes its entire creature population on the
   first creature tick.** Already in `SPARK_Blueprint.md` §XV.6 as a 3-path hazard. **NOT fixable by
   un-stripping** — `serializeCreature` emits `despawnAtTick` for chewers only, so the fix must change
   the SERIALIZER's emit condition. Characterization test pins current behaviour in
   `src/state/save.migrationDamage.test.ts`.
4. **Runtime host↔client desync oracle** — genuinely does not exist (`stateHash` has zero importers
   under `src/net/`; no checksum on the wire). Needs a `PROTOCOL_VERSION` bump + the R15 17-site
   checklist ⇒ Full tier, and R11 already measures a 6-seat wire at **2.35× its 16 KiB ceiling**.
5. **Small + logged:** the lifecycle trio still stripped (`sourceSpawnerId`/`despawnAtTick`/
   `targetCreatureId`) · `diagnostics` is ONE World field so new counters under it escape
   `FIELD_COVERAGE` · the two-oracle hazard is named in `stateHashFull.ts`'s header.

## Blockers
- **The probe playtest (owner-only human judgment).** No technical blockers in the code.
- **V6-2.1 (R6)** still needs the structure-HP slot first (S130 ruling).
- **V6-1.5 mis-tiered Standard→Full** — deleting `CarryingPlayer` silently changes shipped hazard rules.
- Tier banner + sever toast remain SOLO/BOTS-ONLY in practice (`SCORE_TIER` is host-local; the sever
  toast reaches a remote victim ~1/6 of the time, 100% on the host). Ruled and named in-code.

## Pending Backlog
No `- [ ]` checkbox items in BACKLOG.md (it tracks work as V6-x.y slot rows + the CARRY-FORWARD
LEDGER, not checkboxes). **Read the LEDGER first** — S133 added the deploy-trigger probe table there,
corrected R1's remedy, and marked carrier (b) true for only 4 of 23 risks.

## CRITICAL TRAPS (S133 additions first)
- **A PUSH IS NOT A DEPLOY.** See above. `npm run verify-deploy` after every push.
- **ASSERTIONS WRITTEN FROM MEMORY WERE WRONG THREE TIMES IN ONE SESSION** — an invented MCV type
  (`file_absent_string`; the real one is `file_lacks`), a docblock claim trusted from a neighbouring
  comment, and a needle recalled instead of copied. **Copy literals from the file, or use a SYMBOL.**
- **A GUARD CAN BE VACUOUS BECAUSE THE FIXTURE TAKES A DIFFERENT BRANCH** — not only because the
  assertion is weak. Mutation M9 passed while the code under test never ran.
- **CRLF BIT THREE TIMES.** Workflow/source files are CRLF; a bare `\n` regex anchor matches NOTHING
  and can fail silently. Use `\r?\n`, and `[ \t]` (not `\s`) for indentation.
- **A LOGGED CARRY-FORWARD CAN ITSELF BE THE DEFECT** — `P2-18 'godly'` was a false positive
  re-carried across four handoffs; doing it would have been a back-compat regression. Now REJECTED
  in BACKLOG with three grounds. Re-verify small items before executing them.
- **`${PIPESTATUS[0]}`** — a pipeline's exit status tests the LAST command; `$?` after a pipe lied
  about the verifier's exit code this session.
- Use a **script FILE** for payloads — shell-escaped python silently no-op'd a mutation and produced
  a FALSE PASS; the tell was output identical before and after the "mutation".
- `.claude/plans/` is EPHEMERAL and can lie — `plans-archive/` is the source of truth (104 archived).
- MCV needs an ABSOLUTE-path `verification[]` binding on a **completed** priority for `BACKLOG.md`.
- A GREEN SUITE PROVES NOTHING until you delete the code and watch it fail — and it cannot see a
  clipped string. S133 mutation matrices: **14/14** (P1) and **5/5** (P3).

## Recent Reflexion (last 2 sessions)
See `.claude/reflexion_log.md` — S133's 15 entries are at the top (49 entries / 6 blocks after the
STEP 2.8.B prune; S124–S127 preserved in `.handoff-archive/`). Highest-signal S133 entries:
`#my-own-correction-was-also-wrong-and-i-shipped-it-to-three-places` ·
`#i-wrote-three-assertions-from-memory-and-all-three-were-wrong` ·
`#a-guard-can-be-vacuous-because-the-FIXTURE-takes-a-different-code-path` ·
`#the-push-landed-and-deployed-nothing` · `#a-check-that-is-usually-wrong-gets-ignored` ·
`#a-blocked-destructive-command-pointed-at-a-better-design`.
S132: `#four-sessions-of-owner-hasnt-run-it-and-nobody-checked-the-instrument` ·
`#an-instrument-that-cannot-reproduce-its-own-test-condition`.
