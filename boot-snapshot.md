# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-20 | Session: S93

## Next Steps
1. ⭐ **PLAYTEST NONET on https://spark-online.space/** (deployed this session, commit 31a8aa6 → deploy.yml). Build a structure of **exactly 9 squares** (all `Square`, one connected structure, nothing else bonded in) → the duel should FREEZE for everyone, the realm theme (Cloudstep Caravan) should play, a 6×6 Sudoku board appears → click a cell + press 1–6 to solve → first solver gets score ×2, everyone else halved → ~3s → resume. Test SOLO + 1v1 (the netcode path) + Bots. Report anything wrong.
2. **Combo order-symmetry bug (user-flagged S93, own PDR):** Triangle→Spiral = "Warped Anchor" (magic) but Spiral→Triangle = plain placeholder line — systemic across most combos (only 14/30 orderings are "cool"). Fix = make single-defined magic combos symmetric (mirror the reverse pairs) EXCEPT the intentional Wheel/Star pair. Touches LOCKED_DECISIONS §6 combo table → own PDR + user go.
3. **Bundle trim (charter):** main bundle 552.7 KiB, +2.7 over the 550 charter. Overlay already lazy-split; residual is the generator+event core (reducer/snapshot need it synchronously). Either trim the generator's dig/solve or formally raise the charter for this feature.
4. **NONET polish (deferred):** anime-SFX layer (boing/pop cell-entry, kawaii correct-chime, comedic bonk, idle kami/kodama blips — needs SFX assets); resolve juice (screen-shake + winner-colour flood); tune trigger =9 vs ≥9 (≥9 is more forgiving if a merge jumps past 9).
5. **NONET Phase 2 (own PDR):** swap the vector kami/kodama for the illustrated Ghibli sprites (assets-source/nonet-concepts/ — kami_2 hero, kodama_2 trio, dusk_world_1 backdrop) loaded off-bundle from public/art/nonet/; parallax sky.

## Blockers
None blocking. NONET is shipped + deployed. Advisory: bundle +2.7 KiB over the 550 charter (flagged, non-fatal). User playtest pending — bugs to be reported next session.

## Pending Backlog
- [ ] PLAYTEST NONET (all 3 modes) on spark-online.space + report bugs
- [ ] Combo order-symmetry fix (Triangle↔Spiral etc.) — own PDR (LOCKED §6 amend)
- [ ] Bundle trim / charter review (+2.7 over 550)
- [ ] NONET: anime SFX + resolve juice + =9-vs-≥9 trigger tuning
- [ ] NONET Phase 2: illustrated Ghibli sprites (off-bundle) + parallax
- [ ] Carry from S92: PLAYTEST S91 Anchor/Spindle feel + the rebalanced pacing; S90 Filament/Diamond/Lattice feel
- [ ] INFRA: /handoff STEP-0 review gate reads a cross-project session — advisory until 2026-07-15 then BLOCKS

## Recent Reflexion (last 2 sessions)
**S93** — NONET shipped (all modes). #netcode-sync-a-host-event-by-mirroring-the-additive-optional-snapshot-pattern (additive-optional snapshot field + seed-only/regen-client + one client INTENT forces 5 tsc/test-enforced surfaces incl. the PROTOCOL_VERSION literal tripwire) · #freeze-a-sim-loop-without-starving-the-network-or-the-clock (an early-continue freeze must replicate the snapshot-send + keep advancing tick; the heavy Pixi view lazy-splits, the core logic can't).
**S92** — HYGIENE Micro (MAGIC_12_KEYS→MAGIC_COMBO_KEYS rename + session15 loop decouple). #tsc-proves-rename-completeness-grep-proves-the-rest · #prove-a-test-loops-contribution-before-rescaling-it.
