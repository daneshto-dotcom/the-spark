# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-22 | Session: S95 (full — incl. visual buildout follow-ups)

## ⭐ NEXT LAYER (user-requested — start here)
"Push forward on ambient life + other video loops + cool graphics." The NONET realm now has 4 animated original spirits (breathe/blink/hop/float) + a 16-firefly swarm. Build the NEXT layer of life on top:
1. **Video/parallax dusk-sky background** behind the board — try `veo_generate` (gcp-vertex MCP) for a seamless looping forest-dusk clip, OR layered parallax of drifting silhouettes. Off-bundle in `public/art/nonet/`, lazy. Respect the photosensitivity 0.30-alpha cap precedent.
2. **More ambient particles** — drifting leaves / spores / pollen motes (same pre-drawn-Graphics + sin-drift pattern as the fireflies in `sudokuOverlay.animateLife`).
3. **Spirit micro-reactions** — occasional head-turn / lantern-lift; one spirit that wanders all the way across; a reaction beat when you place a number or SOLVE (spirits hop/cheer; tie to the existing resolve edge).
4. **(stretch) veo creature video-loops** for the kami; keep everything off-bundle + in the lazy overlay chunk; the build bundle guard (560 KiB) only watches the main entry so off-bundle assets are free.

Key files: `src/render/sudokuOverlay.ts` (`buildSpirits` + `animateLife`), `src/render/nonetJuice.ts` (pure anim/sfx helpers), `public/art/nonet/` (sprites). Imagen/veo via the gcp-vertex MCP (key valid this session).

## Next Steps (after / alongside the next layer)
2. RE-PLAYTEST NONET live on https://spark-online.space/ — board appears + solvable; 4 animated spirits + fireflies; anime SFX; winner-colour flood + shake on solve. Solo + 1v1 + bots.
3. RECONFIRM VOLTKIN (4 squares + 4 triangles) — likely fixed as a side effect of the NONET hang fix (voltkin.test.ts 22/22 green; cutscene is eager). If still broken with NONET working → fresh diagnosis (consider a DEV `__SPARK__.forceVoltkin`).
4. IP cleanup: delete/replace the Totoro-derivative concept refs in `assets-source/nonet-concepts*`; broader audit of other generated art (rainbow-flyover, voltkin, seagull) for franchise resemblance — no-copy policy is general.
5. TRUE 2-peer NONET WebRTC playtest (round-trip is unit-covered; silent-hang fixed; exact prod trigger never reproduced single-browser).
6. Combo order-symmetry bug (S93): Triangle→Spiral magic vs reverse plain line — own PDR (LOCKED §6 amend).

## Blockers
None blocking. All S95 work shipped + deployed (Deploy CI green; bundle guard passes). STEP-0 review gate reads a cross-project session (known infra quirk; advisory until 2026-07-15).

## Pending Backlog
- [ ] NONET ambient-life NEXT layer (video/parallax bg, particles, spirit reactions) — user-requested
- [ ] Re-playtest NONET live; reconfirm Voltkin live
- [ ] IP: delete Totoro-derivative concept refs + broader art audit
- [ ] True 2-peer NONET WebRTC playtest
- [ ] Combo order-symmetry fix — own PDR (LOCKED §6)
- [ ] USER DISCUSSION (deferred): combinatorial depth 6^6 ≈ 46k

## Recent Reflexion (last 2 sessions)
**S95 (cont., 06-22)** — #shipped-an-IP-look-alike-then-got-flagged-live (self-check generated art for franchise resemblance BEFORE shipping; prompt for original silhouettes) · #procedural-life-on-static-sprites-is-cheap (sin-driven breathe/blink/hop/float + firefly swarm; drive on wall-clock not world.tick; blink as a pure tested helper) · #verify-animation-by-state-sampling-not-one-screenshot (fresh preview server; sample sprite transforms at t and t+Δ).
**S95 (06-21)** — #a-silent-catchless-lazy-import-is-a-time-bomb (verify the LOAD path, not just the render) · #key-a-stubborn-chroma-bg-by-its-minimum-channel (hue/channel invariant, not absolute colour distance) · #a-soft-prose-charter-with-no-CI-guard-will-always-drift (raise + ENFORCE in the build + code-split to defend).
