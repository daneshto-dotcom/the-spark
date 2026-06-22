# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-22 | Session: S95 (+ IP-rework follow-up)

## ⚠️ IP NOTE (resolved this follow-up, commit 2f0fa89 — DEPLOYED)
The S95 P1 kami was a **Totoro look-alike** (Studio Ghibli) — user flagged it as a legal/trademark risk while it was LIVE. Reworked to a clearly **ORIGINAL mossy seedpod forest-spirit** (sprite `public/art/nonet/kami.webp` + the vector 404-fallback in `sudokuOverlay.buildSpirits` + the white kodama-style spirits → generic firefly wisps). Live now. User declined to pick among 4 candidates; I shipped my recommendation (moss-spirit, lantern raised). An **owl-guardian variant** was also generated if a swap is wanted (regen via Imagen; magenta-bg + `/tmp`-style hue/min-channel key). **TODO:** (a) the concept refs in `assets-source/nonet-concepts/` + `-v2/` are Totoro-derivative — delete or replace; (b) BROADER IP AUDIT — review ALL generated art (rainbow-flyover, voltkin sprites, seagull, any other AI art) for resemblance to Ghibli/other franchises, since the no-copy policy is general.

## Next Steps
1. ⭐ **RE-PLAYTEST NONET on https://spark-online.space/** (now live: P0 e23b8a8 + P1 92b7ea8 + P2 d5c54de + IP-rework 2f0fa89). Connect 9 of one shape in 1v1 → the Sudoku board MUST now appear (was the bug). Confirm: board shows + is solvable; the **original moss-spirit kami** shows right of the board AND on its Codex tile (NOT the old Totoro); **anime SFX** on cell-place/wrong/solve; on solve a **winner-colour screen flood + shake**. Test solo + 1v1 + bots. **If a chunk ever fails to load, the page now auto-reloads once** (stale-deploy fix) — that's expected, not a bug.
2. ⭐ **RECONFIRM VOLTKIN (4 squares + 4 triangles)** now that NONET no longer freezes the session. Hypothesis: it failed last time as a downstream symptom of the 180s NONET hang, NOT its own bug (voltkin.test.ts 22/22 green; cutscene is eager, not a lazy-chunk casualty). If it STILL fails with NONET working → fresh diagnosis (consider a DEV `__SPARK__.forceVoltkin` hook mirroring the new `forceNonet`).
3. TRUE 2-peer NONET playtest (real WebRTC, 2 browsers) — the host→client round-trip is now unit-covered (sudokuSync.test.ts) + the silent-hang is fixed, but the exact production trigger was never reproduced single-browser.
4. Combo order-symmetry bug (S93): Triangle→Spiral magic vs Spiral→Triangle plain line — own PDR (LOCKED §6 amend).
5. NONET Phase-2 remainder: parallax sky behind the overlay; optionally illustrate the **firefly wisps** as sprites (kami done; the wisps are now generic glowing orbs, IP-safe). Do NOT reuse the Totoro-derivative refs in assets-source/nonet-concepts*.

## Blockers
None blocking. S95 shipped + deployed (Deploy CI green; bundle guard passes). The exact 1v1 production trigger for the NONET hang could not be reproduced single-browser — the fix eliminates the silent-hang failure mode regardless; a true 2-peer playtest is the final confirmation.

## Pending Backlog
- [ ] Re-playtest NONET live (board appears + solvable + kami + SFX + flood/shake)
- [ ] Reconfirm Voltkin live (likely fixed as a side effect of the NONET fix)
- [ ] True 2-peer NONET WebRTC playtest
- [ ] Combo order-symmetry fix — own PDR (LOCKED §6)
- [ ] NONET parallax sky + (optional) illustrated firefly-wisp sprites
- [ ] IP: delete/replace Totoro-derivative concept refs in assets-source/nonet-concepts*
- [ ] IP AUDIT: review all generated game art (rainbow-flyover, voltkin, seagull, etc.) for Ghibli/franchise resemblance — no-copy policy is general
- [ ] (optional) swap the moss-spirit kami for the owl variant if user prefers
- [ ] USER DISCUSSION (deferred): combinatorial depth 6^6 ≈ 46k

## Recent Reflexion (last 2 sessions)
**S95** — #a-silent-catchless-lazy-import-is-a-time-bomb-for-trigger-critical-ui (NONET overlay never appeared = unguarded latching lazy import, not a render bug; verify the LOAD path) · #key-a-stubborn-chroma-bg-by-its-minimum-channel-not-its-brightness (key on a hue/channel invariant the subject can't satisfy) · #a-soft-prose-charter-with-no-CI-guard-will-always-drift (raise + ENFORCE in the build + code-split to defend).
**S94** — #one-root-cause-can-explain-two-symptoms (rainbow+poop stuck-white = one Silver-in-6-human-shuffle bug) · #a-per-tick-host-sweep-beats-a-per-event-hook · #a-synthetic-codex-entry-with-a-forward-compatible-asset-path.
