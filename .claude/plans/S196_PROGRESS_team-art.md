# S196 PROGRESS — team-art (branch s196/team-art)

PROMPTS READY: C:/Users/onesh/OneDrive/Desktop/SPARK_Team3_Backdrop_Prompts.html (also _from-desktop/SPARK_Team3_Backdrop_Prompts.html) - section #singles, 12 cards (6 races x 4P quadrant + 2P half), copy buttons, own progress counter; headless smoke: 0 page errors, counters 0/56 + 0/12, tick works.

NEXT STEP: re-run gates on merged tree (master fb8f6b42 merged, no conflicts): typecheck/vitest/build/e2e:gating into .tmp-gates/m-*.{log,exit}; then FINAL REPORT. Pre-merge: e2e:gating exit 0 (67 passed, 10.7 m); typecheck 0; vitest 1 timeout-only red (endgameAudit, alone 18/18 BENIGN); build 0 entry 1252.3 KiB.

## Log
- merged master b35368c6 (tower-fx) at boot, no conflicts.
- item 1 DONE: gen_team3.py + js.txt (group-aware counters) regenerated; generator reproduced the shipped sheet byte-identically BEFORE the edit (cmp IDENTICAL), so the regen is consistent.
- item 2a DONE: 27 trio files RE-VERIFIED BY EYE (contact sheets .tmp-gates/trio/sheet1-7.jpg, x2.5 brightened): every file matches the S195 card mapping. Transcoded by `.claude/plans/s195-team3-gen/transcode_trios.py` to public/art/race-zones/teams/<ne>-<se>-<sw>.webp 960x540 q75, NW quarter blacked; 27 files = 906,978 B (886 KiB) static. Brightness of drawn 3 quarters: mean 26.3-57.6 (mummies-heavy trios 55-58, above the 2v2 set's 27-49), px>200 max 143 (bxt40 cook-fires) — reported, not altered.

## TRIO MAPPING (file -> NE / SE / SW), verified by eye S196
qwb0Y D/D/D (1) · Y209P D/D/Mu (2) · 7u6BS D/D/Na (3) · Xn4YJ D/D/Or (4) · Cti5A D/D/Va (5) · GIlwP D/D/Zo (6) · mTNsB D/Mu/Mu (7) · F9nFS D/Mu/Na (8) · bxt40 D/Mu/Or (9) · gOsXj D/Mu/Va (10) · b0OyK D/Mu/Zo (11) · CMK8y D/Na/Na (12) · OsCDw D/Na/Or (13) · **card 14 D/Na/Va: hqBp3 = 0 bytes, MISSING** · T7xpW D/Na/Zo (15) · 9vbUs D/Or/Or (16, drawn disc on the S seam) · O8ULO D/Or/Va (17) · 06oWF D/Or/Zo (18) · XFhrY D/Va/Va (19) · 00Z0A D/Va/Zo (20) · Vafnh D/Zo/Zo (21) · XEOoT Mu/Mu/Mu (22) · 0nA6Y Mu/Mu/Na (23) · KHeex Mu/Mu/Or (24) · EeN9B Mu/Mu/Va (25, 1712x1152) · oLzl8 Mu/Mu/Zo (26) · l5Ren Mu/Na/Na (27) · mLOs2 Mu/Na/Or (28) · `mLOs2 (1)` = byte-identical duplicate. Unidentified: none.
- item 2b+3 DONE: TEAM_TRIO_ART manifest (27) + trioBackdropUrl + quarter crop (`ne`/`se`/`sw`, no nw) + failed->fallback; TEAM_SEAM_BLEND_LEGACY_ART = true; teamTrioArt.test.ts (new) + re-pins in teamTiles/teamBackdrop/canon tests + SPARK_CANON.md 5d BACKDROPS (canon.test binds the flag + the 27). 6 affected files: 168 passed. README at public/art/race-zones/teams/README.md.
- mutations M1 (NW zone gets a quarter) M2 (failed picture kept) M3 (flag off) M4 (set not positional) M5 (crop reads NW): all RED (.tmp-gates/mutate.log); source restored byte-identical.
