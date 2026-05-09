# Session 4 PDR — Spec-Alignment Pass

**Status:** APPROVED (user explicit-go: "draft session 4 pdr fixing all of the recommendation ... then fix and implement")
**Tier:** Standard (~20-25K tokens, 5+ files)
**Deliberation:** Waived per Rule 17 user-path (`unlock_source: user`)
**Generated:** 2026-05-09 Session 4 of 10

---

## OBJECTIVE

Realign Phase-1 prototype with the user's clarified semantics — which were latent in the v0.5 spec but silently violated by 3 prior sessions. The "all colored circles" issue is a category of related bugs masquerading as cosmetics.

## SCOPE

### P1 — Render 6 distinct shape geometries [CORE FIX]
- Replace single circle texture in `renderer.ts` with **6 type-specific shape textures** generated from the spec § IV table
- Each free-floating building block must visually communicate its type via SHAPE alone
- Specs:
  - **Dot:** small filled circle, 4 px
  - **Line:** thin rod, 24 px long × 3 px thick
  - **Triangle:** equilateral, 16 px side
  - **Square:** filled square, 14 px
  - **Circle:** hollow ring, 18 px diameter, 2 px stroke
  - **Spiral:** tight 1.5-turn spiral, 20 px diameter

### P2 — Free shapes are colorless [SPEC AMENDMENT]
- Free-floating sparks render in **neutral white/silver** (no type color tint)
- The `SPARK_COLORS` table is preserved but no longer applied to free sparks
- Type identity is communicated by SHAPE only (P1 dependency)

### P3 — Placed primitives inherit player color
- `structureRenderer.ts` switches from `SPARK_COLORS[prim.type]` → `prim.placerColor`
- Bond gradients between two primitives use both endpoints' player colors (works automatically once primitives use player colors)
- This makes color = ownership only, the user's clarified rule

### P4 — Player avatar render
- Add a small glowing dot at cursor location, tinted in the player's color
- Phase-1 single-player: shows P1 color (`#ff3b6b`)
- Architecturally seams Phase-2 multi-player (each player's view will render their own avatar prominently)

### P5 — No-build zone enforcement
- `PLACE_PRIMITIVE` dispatch: reject if cursor position is inside `SPAWNER_RADIUS` of `SPAWNER_CENTER`
- The carry slot is preserved (no spark loss); the player must drag the carried shape outside the zone before committing
- Connect-drag preview turns RED and shows a "no-build" cursor when invalid

### P6 — Spec amendment to v0.5.1
- Update `SPARK_Blueprint.md`:
  - § IV "Color override" rule: free sparks are colorless; placed primitives inherit player color
  - § IX (new) "No build inside zone" — explicit rule
- Update `LOCKED_DECISIONS.md` § 5: clarify color application rules
- Bump version to v0.5.1 (patch — no Phase-1 schema change, just rendering + one rule)

---

## TESTING

- All existing 102 tests must continue to pass (no schema changes)
- New tests:
  - `gameState.test.ts`: PLACE_PRIMITIVE in-zone is rejected (carry preserved)
  - Render smoke (visual verify): each of 6 types renders with distinct shape
- Browser verify via Claude Preview MCP:
  - Spawn 30+ free sparks, confirm 6 distinct shapes
  - Pick one up, drop in zone → rejection (visual feedback, carry preserved)
  - Drop outside zone → primitive renders in player color (`#ff3b6b`)
  - Cursor avatar visible and tracks mouse

---

## NON-GOALS

- NOT touching: physics, combo table, sever logic, energy formula, save/load schema, strain thresholds, audio
- NOT addressing: real-browser 60 Hz playtest (deferred; user-driven)
- NOT changing: any LOCKED_DECISIONS § 4 (bond physics) or § 6 (combo schema) numbers

---

## RISKS

1. **Pixi v8 ParticleContainer per-particle texture** — if API limits us to one texture per container, fall back to plain `Sprite` instances in a regular Container (auto-batched in v8). With ~80 entities max in Phase 1, perf is fine either way.
2. **Bond gradient with player colors** — when only 1 player exists, bonds are monochrome (both endpoints have the same color). Looks identical, not a regression.
3. **In-zone placement attempt UX** — rejecting silently is bad. The connect-drag preview must turn red so the player understands. Solved in P5.

---

## OPEN ISSUES (carry-forward for future sessions)

- **Effects active list hard cap** (S3 PRIME-AUDIT) — still bounded only by lifetime, not count
- **Strain auto-sever tuning** — needs real-browser playtest data
- **Real-browser playtest @ 60 Hz** — Session 4B once 4A lands

---

## ESTIMATED TOKENS

~20-25K. PDR approved by user explicit-go; same-turn flag-write + execution permitted.
