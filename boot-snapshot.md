# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-22 | Session: S96 (autonomous overnight, explicit full-batch pre-approval)

## ⭐ HEADLINE — NONET realm is now ALIVE with real video
The procedural "PowerPoint-spin" sprite twitch is GONE. All 4 original NONET spirits (kami, owl-a,
owl-b, moss-b) are now veo-3.1 image-to-video loops + there's a dusk-forest ambient backdrop video,
composited with feathered alpha masks behind the board. Live-verified + deployed (639b140). Watch it:
trigger NONET on https://spark-online.space/ — 4 living spirits frame the board over a drifting dusk
forest. Pipeline + scripts: `assets-source/nonet-video/` (make_keyframe.py · process.sh). Source loops:
`public/art/nonet/*.webm` + `spirit-mask.png`. Code: `src/render/sudokuOverlay.ts` (buildGuardian /
makeVideoSprite / loadBackdropVideo / setVideosPlaying).

## Next Steps
1. ⭐ DECIDE the combo order-symmetry option — read `docs/combo-order-symmetry-PDR.md` (full symmetry
   map + 3 options + recommendation). It was NOT auto-changed (LOCKED §V.1 amend + the Triangle→Circle
   Wheel/Star dual-magic would be destroyed + scoring rebalance needed). Pick A/B/C → a session executes.
2. Re-playtest NONET live (board + 4 video spirits + backdrop) AND reconfirm Voltkin (4sq+4tri) — you
   hadn't checked Voltkin yet; likely fine post-S95 NONET-hang fix.
3. TRUE 2-peer NONET WebRTC playtest (round-trip is unit-covered; the 2 version E2E tests now pass).
4. (optional P1 polish) gentle parallax drift of spirits across the margin; a veo-STANDARD re-shoot of
   the hero kami for max fidelity; a "realm brightens" beat on solve. All deliberately deferred.

## Blockers
None blocking. P2 (combo symmetry) is BLOCKED-ON-USER (design + balance decision). All S96 code shipped
+ deployed (tsc 0, vitest 1488/1488, entry flat 553.6/560, Deploy CI green). veo spend $2.10/$10 cap.

## Pending Backlog
- [ ] Combo order-symmetry — user picks an option from docs/combo-order-symmetry-PDR.md (then execute + rebalance)
- [ ] Voltkin live-recheck (user-side) + true 2-peer NONET playtest (user-side)
- [ ] (optional) NONET video polish: parallax drift / veo-standard hero / solve-cheer beat
- [ ] USER DISCUSSION (deferred): combinatorial depth 6^6 ≈ 46k

## Recent Reflexion (last 2 sessions)
**S96 (06-22)** — #image-to-video-beats-procedural-twitch (Pillow keyframe → veo i2v → ffmpeg seamless
VP9 → Pixi feathered mask; calibrate 1 clip before fanning out; pivot off broken libvpx-alpha to
render-time masking; verify motion empirically) · #a-flagged-bug-can-be-a-locked-design-decision (combo
order-symmetry is LOCKED §V.1 + Wheel/Star dual-magic; surfaced a PDR, didn't auto-gut it) ·
#a-version-bump-breaks-more-tests-than-the-one-flagged (S93 8→9 broke 2 version E2E tests; verify by running them).
**S95 (06-22)** — #shipped-an-IP-look-alike-then-got-flagged-live (self-check generated art for franchise
resemblance) · #procedural-life-on-static-sprites-is-cheap (the S96 video work supersedes this for the
guardians) · #verify-animation-by-state-sampling-not-one-screenshot.
