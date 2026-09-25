# S191 — DISPATCH LOG (merge owner's resume file)

Dispatched 2026-09-25 from master `42cc2ee`. Fix rounds go to the SAME agent by `SendMessage` (to = the agent id below).

| name | worktree / branch | agent id | status |
|---|---|---|---|
| s189-weld | s189-weld / s189/weld | a88c9dbf146d418a8 | running — steps 1–6 (merge master, gates, DORMANT census, notes, 52 reasons) |
| s189-net | s189-net / s189/net | a4c62ebc9f877a4a3 | running — steps 1–7 (merge master, NETFR-1/2/3/4/5/6); step 8 C4 tuning on message |
| s191-carry | s191-carry / s191/carry | add665e63434da430 | running — C-1..C-5; C-6 (owner go) and C-7 (after weld on master) on message |
| s191-perf | s191-perf / s191/perf | a57142be85e0b98ca | running |
| s191-addons | s191-addons / s191/addons | ad3e157587f888ccf | running — A-1..A-5 |
| s191-owner | s191-owner / s191/owner | a15bca10f87a0035b | running — Scorched Earth 1a/1b + chewers |
| s191-endstats | s191-endstats / s191/endstats | a66c9c85a0325cbfc | running — search → spec (or implement) |
| s191-council | (read-only) | a5cee3d33ba2ad0fb | running — writes `.claude/plans/S191_COUNCIL_LEDGER.md` |

## Owner questions put in S191 (answers → forward to the named agent)
- Q1 Scorched Earth casts/duration → s191-owner
- Q2 Scorched Earth burns the enemy castle? → s191-owner
- Q3 own-zone passive burns enemy buildings too? → s191-owner
- Q4 orc rage re-trigger after 25 s → s191-addons
- Q5 spreadEnemyTarget strict (S162) → s191-carry C-6
- Q6 welding beside own spawner (W-FR7) → record; weld behaviour unchanged unless he rules

## Log
- boot verdicts: CI E2E for 7404a49 = SUCCESS (the "red since S187" note is stale).
- ANSWERED Q1 once/FIGHT until FIGHT end · Q2 castle safe · Q3 moot + NEW "structures take half" · Q4 cooldown first (25 s MINE) → forwarded to s191-owner and s191-addons.
- Owner widened item 2 → systemic (drones lose stock at FIGHT start too) → forwarded to s191-owner.
- ANSWERED §A1 Voltkin: **"Keep defending first"** → C3 CLOSED as working-as-ruled (S103 #8 stands). No code.
- ANSWERED bot welding: **"keep it for bots but the towers should be repairable! we have discussed ti last session. i will explain in the follow up message"** → S190 records hold NO such ruling (grep: rulings file, dispatch log, integrator notes — all still R185-B unrepairable). AWAITING his follow-up; then a fix round to s189-weld (structureRepair `blueprintGroupOf` origin===null refusal; weld's R185-B test flips; canon §7b R185-B / §8 limit 2) BEFORE the weld audit.
- DECIDED by the merge owner as extensions of existing rulings (told to the owner, reversible), queued for s191-carry after its C-5 report:
  · C-6 go — `spreadEnemyTarget` strict, enforcing S162 (no own creature on an own/mixed bond).
  · C-8 — R190-I on the CASTLE: separate hit and heal numbers (a per-player castle heal counter, four sites).
  · C-9 — R190-H extended: the Ra strike draws above buildings too; the art's ground rune ring (slots 0–3) back ON THE GROUND (canon §7c says only the strike goes up).
- §A2 drafted ATK on summons → folded into s191-addons A-5 magic-attack design doc.
- §A5 CONNECTION LOST overlay covering an open draft panel → decided correct (you cannot pick while disconnected); not asked.
- OWNER R191-A (welded structures: tower-level FIX/SCRAP + sheets, structure SCRAP-all, no structure FIX; R185-B amended) → s189-weld ROUND 5, right after its steps 1-6, before the audit. PDR scope amendment A1.
- OWNER R191-B (FIX = a gatherer job delivering the shapes from the castle) → s189-weld ROUND 6, QUEUED until "round 6 go" after weld is on master (deploy #6). PDR scope amendment A2.
- OWNER refined R191-B (multi-gatherer tasks, nearest source that HOLDS the type — quarry vs castle, queued jobs, FIX ALL) → s189-weld round 6 (still queued).
- OWNER corrected: the end-game research EXISTS as the S179 "END-OF-MATCH STAT BOARD" (HANDOFF_S179 :105, S180_BACKLOG :131, S182_BACKLOG :27/:59/:70). s191-endstats REDIRECTED: short spec from the record + his words, then IMPLEMENT v1 without waiting (units built/killed per type, graphs comparing players; WIN_TRIGGER teardown trap; POSTGAME click-reset hazard).
