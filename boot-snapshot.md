# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-21 | Session: S94

## Next Steps
1. ⭐ **REPORT S94 PLAYTEST on https://spark-online.space/** (deployed: P1 672cddd + P2 9333bbc → deploy.yml). Verify: (P1) rainbow + bird-poop no longer leave your player stuck white/silver — colour always reverts to one of the 6. (P2) NONET now triggers on a connected structure of **9 of ANY single shape** (9 squares OR 9 circles OR 9 spirals…), and fires whether you **build up** to 9 OR **erase down** to 9 of a type; timeout is now 180s; open the **Codex** → a "NONET" super-combo tile (name + hint; no character image yet — that's the Phase-2 kami sprite). Test solo + 1v1 + bots.
2. **Combo order-symmetry bug (S93 user-flagged, own PDR):** Triangle→Spiral = "Warped Anchor" magic but Spiral→Triangle = plain placeholder line — systemic (14/30 orderings cool). Fix = make single-defined magic combos symmetric (mirror reverse pairs) EXCEPT the intentional Wheel/Star pair. LOCKED §6 combo-table change → own PDR + user go.
3. **Bundle trim / charter review:** main bundle 553.0 KiB, +3 over the 550 charter (NONET generator+event are core, can't lazy-load; overlay already split). Trim or formally raise the charter.
4. **NONET illustrated kami sprite (Phase-2):** drop a sprite at `public/art/nonet/kami.webp` — the Codex tile (`makeTile` catch) AND the overlay vector spirits both auto-upgrade to it. Concept refs: `assets-source/nonet-concepts/` (v1) + `assets-source/nonet-concepts-v2/` (v2 pencil). Then parallax sky + the overlay sprite swap → own PDR.
5. **NONET polish (deferred):** anime-SFX layer (boing/pop/kawaii-chime/idle blips — needs SFX assets); resolve juice (screen-shake + winner-colour flood).

## Blockers
None blocking. S94 shipped + deployed. Advisory: bundle +3 over the 550 charter (flagged, non-fatal). User playtest of the S94 fixes pending — bugs reported next session.

## Pending Backlog
- [ ] REPORT S94 playtest (colour fix + NONET 9-of-any-type/erase + 180s + Codex tile) on spark-online.space
- [ ] Combo order-symmetry fix (Triangle↔Spiral etc.) — own PDR (LOCKED §6 amend)
- [ ] Bundle trim / charter review (+3 over 550)
- [ ] NONET Phase 2: illustrated kami sprite (public/art/nonet/kami.webp) → codex + overlay auto-upgrade; parallax sky
- [ ] NONET: anime SFX + resolve juice
- [ ] Carry from S93: also still open — 1v1 NONET netcode is unit-tested but not live 2-peer tested (verify in playtest)
- [ ] INFRA: /handoff STEP-0 review gate reads a cross-project session — advisory until 2026-07-15 then BLOCKS

## Recent Reflexion (last 2 sessions)
**S94** — colour bug + NONET tweaks. #one-root-cause-can-explain-two-symptoms-trace-to-the-shared-state (rainbow+poop "stuck white" = one bug: bots-only Silver in the 6-human shuffle) · #a-per-tick-host-sweep-beats-a-per-event-hook-for-emergent-triggers (NONET fires on build OR erase from one swept integration point) · #a-synthetic-codex-entry-with-a-forward-compatible-asset-path · #after-a-context-reset-mid-edit-run-the-failing-gate-first.
**S93** — NONET shipped (all modes). #netcode-sync-a-host-event-by-mirroring-the-additive-optional-snapshot-pattern · #freeze-a-sim-loop-without-starving-the-network-or-the-clock.
