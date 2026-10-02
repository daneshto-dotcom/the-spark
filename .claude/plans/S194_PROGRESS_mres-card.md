# S194 PROGRESS — s193/mres-card (T3, the wave-26 MRES draft card)

## FINAL REPORT
- tip: `git log -1 s193/mres-card` (this commit). Merge 21e2be4e = master 0a37175e; 1 conflict, src/state/damage.ts import block, kept both sides.
- gates (exit codes from files): typecheck 0 (re-run after the new test, 0) · vitest --maxWorkers=3 0 (521 files passed / 4 skipped; 7881 passed / 11 skipped; magicResist.differential, magicResist.callSites, draftMresReaches all green) · new overlay test file alone 0 (57/57) · build 0.
- entry 1123.1 KiB (master 1121.9 per the rules) = +1.2 KiB; headroom 126.9 KiB.
- BUMP VERDICT: BUMP. CHOOSE_DRAFT.pick gains 'mres' (new discriminant); a v62 peer offers/auto-takes DEF at wave 26, so the hashed pick lists diverge; Creature.mresFifths is serialized + hashed and divides every magic hit on both sims.
- MINE: (1) "+10% MRES" = +10% of the magic-defended pool HP x (5+MRES), floored, min 1 (orcs soldier 6->7, a 33 zap lands 28) — recommend keep, it is how every other pick works. (2) Wave 26 offers MRES INSTEAD of the cycle's DEF — recommend keep. (3) Title WARDED, line "+10% MAGIC RESIST" — recommend keep. (4) The MRES pick is baked from the owner race at birth (soldier) — recommend keep (race cannot change mid-match).
- MERGE SEAMS: protocol bump (six sites); damage.ts creature arm + magicResistCue.ts branch on victim.mresFifths (absent branch = S192 call byte for byte); makeCreature takes ownerRace (all 4 production spawn sites pass it); hellspawn children inherit mresFifths; draftOverlay COPY.card is now string|null.
- NOT DONE: CARD ART (imagen 404 on gcp-vertex, $0 spent, nothing retried). Tile shows text title; GENERAL_CARDS_AWAITING_ART=['mres']; MANIFEST row 4b has the brief.

## Log
- merge master 0a37175e -> 21e2be4e. 1 conflict: src/state/damage.ts import block (ours moved getCreatureConfig up; master added matchStats import) — kept both. npm install 0, typecheck 0.
- self-review: four sites (creature.ts factory + 4 production spawn sites pass ownerRace; save serialize/deserialize validated; stateHashFull CreatureHashed + :mr + per-field test; worker INIT rides save); narrow hash carries neither atkFifths nor mresFifths (by design). All magic damage on creatures funnels through damage.ts creature arm (only landedFifths/landedFifthsPools callers). offer/pickIsOffered/autoPickFor all read generalPickForWave (26 -> mres). No tolerant-default consumer of GeneralPick found (grep 'pen'/ARMOURED).
- added REACH test (draftOverlay.test.ts): wave-26 tile through the real DraftOverlay + production draftOptionsFor — no card fetched, title WARDED drawn, tap sends 'mres'. Mutation (card:'general-mres') turns it RED; restored.
- gates run, final report written. DONE (art NOT DONE).
