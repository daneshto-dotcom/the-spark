# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-25 | Session: S103

## Next Steps
1. **PLAYTEST the S103 TD defenders LIVE** on https://spark-online.space:
   - Build **1 Line + 7 Spirals** (the Line auto-bonded to 7 spiral leaves) → a pencil **laser turret**:
     its lens charges + 5 wind-up rings contract, and every ~30s it fires a red **beam** at the
     nearest enemy chewer (chewer pops with goo; a Voltkin takes 2 → lightning-cloud).
   - Build a **Triangle hub + 3 Spirals (Warped Anchors) + 3 Circles (Stars)** → **HELGA**: she idles,
     breathes, periodically **sips her beer stein**, and when an enemy chewer comes within ~160px she
     **winds up + SLAPS** it dead (articulated puppet — windup→impact→recover, not a gif/twitch).
   - Summon a **Voltkin** near enemy chewers → it **zaps a chewer that wanders within 180px** while
     still marching on the enemy base (bonds stay its primary job); a 2-hit Voltkin death = lightning-cloud.
   - **Tune by eye/ear:** the turret beam/charge, HELGA's look + slap arc, and the laser/slap/zap-burst
     synths are all tunable — say what feels off.
2. **P5 (carry-forward, was YELLOW-gated):** Tier-1 **G4 build-feel juice** — bond-formation juice burst
   + in-world leader crown (pure render, synced-tick deterministic).
3. **Resume Tier-1 roadmap:** G1b MOTION (Council-deferred, needs a mechanical verb) · G2 family traits
   (needs LOCKED_DECISIONS §6 amendment) · G3b Codex silhouettes.
4. **Optional HELGA art enhancement:** she's a deterministic Pixi puppet rig (zero-API). If you want
   painterly texture, layer an imagen-generated original face/texture on the head part (additive,
   must stay replay-safe). See memory `helga-princess-spec`.

## Blockers
None. S103 (#8/#9/#10 + the generic Defender substrate) is LIVE + verified (all deploys SUCCESS).
P5 deferred by the GREEN budget gate (closed at 59.9% YELLOW). E2E fog contract fixed (10→13); the
fix's E2E run was in-flight at close — confirm green next boot via `gh run list --workflow="E2E (2-browser harness)"`.

## Pending Backlog
- [ ] P5 Tier-1 G4 build-feel juice (bond-formation burst + leader crown) — carry-forward.
- [ ] TD recipe-build UX (LOW): defender/spawner recipes are spacing-sensitive + unguided — add an
  in-build affordance (highlight invalid leaf / "connect to the hub" hint / closing-edge ghost). The
  S103 CHECK loosened recipes to tolerate inter-leaf auto-bonds, but the unguided-build gap remains.
- [ ] TD connector visible-damage + multi-chewer stacking (S102 de-scoped): real Bond.hp + damaged-bond render.
- [ ] Defender polish (logged, non-blocking): slapped/beamed creature vanishes same tick (impact VFX at
  lastStrikePos over empty space — same accepted S102 goo tradeoff); register the orphaned PENTAGRAM_RECIPE.
- [ ] Death-VFX fallback watch-item: if playtest shows missed clouds/goo on the 1v1 client, add a synced recentDeaths[] queue.
- [ ] Tier-1: G1b MOTION, G2 traits (LOCKED §6), G3b Codex silhouettes, G4 juice (=P5).

## Recent Reflexion (last 2 sessions)
## 2026-06-25 — Session 103: TD Defenders Bundle — #8 Voltkin-vs-chewer + generic Defender substrate + #9 laser turret + #10 HELGA articulated princess LIVE. vitest 1645/1645, entry 594.3/750 KiB. FULL-tier Council ADOPT-WITH-FIXES (8 MF) + 2 Triumvirate CHECKs. P5 deferred (YELLOW).
- P1 #opportunistic-override-stays-byte-identical-when-population-empty: gate new behavior on a condition absent from the test corpus (enemy creatures) → old replays byte-identical BY CONSTRUCTION, no re-baseline.
- P2 #mirror-the-spawner-substrate: the new synced entity + protocol bump was low-risk by cloning S100's spawner SHAPE; MF1 wire pattern = hold the FIRE state ~12 ticks + SYNC it (the state is the event bus) + synced lastStrikePos; 4/5 CHECK findings were false-positives from not knowing FSM-state durations.
- P3 #consumer-is-just-a-recipe-plus-a-renderer: invest determinism/wire/protocol ONCE in the substrate; each consumer is then cheap. Recipes MUST registerRecipe (pentagram is the never-registered counter-example).
- P4 #a-puppet-rig-IS-the-real-character: HELGA = a PURE deterministic Pixi puppet rig (per-state authored poses, a real windup→impact→recover arc) — chosen over veo for an action character; add a per-entity offset so N instances don't animate in unison; match combo SEMANTICS (Star = {Triangle,Circle} type-set) not lookupCombo direction; tolerate inter-leaf auto-bonds.

## 2026-06-24 — Session 102: TD combat overhaul — shipped 7 of 10 owner playtest items LIVE (P1 buck-teeth/owl-mask/NONET sounds/rebuild · P2 gnaw/melee + unified-HP foundation · P3 RAID-pops-chewer + green-goo). vitest 1594/1594, entry 574.6/750 KiB. Items 8/9/10 deferred → shipped in S103.
- P1 #verify-the-mask-on-the-real-frame: to fix a video-mask fade, look at the actual video under the actual mask (a max-bright projection), not the still keyframe; bespoke per-asset masks are where regressions hide.
- P2 #touch-the-shared-reducer-once: grep for hardcoded constants the per-type config was SUPPOSED to drive before adding systems — the seam is often already half-wired.
- P3 #drive-kill-VFX-from-snapshot-removal: derive "something died" VFX from the entity's REMOVAL at the render layer (prev/curr diff), not a per-kill wire event — reliable on the 1v1 client, zero wire surface.
