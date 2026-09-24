# S189 CANON NOTES — `s189/render`

Canon text + constants proposed by this branch, for the merge owner to fold into `SPARK_CANON.md`
(this branch never edits the canon or `src/canon.test.ts`). None of these is a gameplay number, so
none needs a `canon.test.ts` assertion; each is pinned by the test named.

## §7b addendum (next to R183-G) — THE STAGE IS SORTABLE, SO A zIndex OUTRANKS CHILD ORDER (S189 C1)

> *"the spark should be one layer above … it gets highlighted when you mouse over it, but the mouse is
> under it"* — owner, S189, of the upgrade draft panel

- `exitButton.ts` sets `app.stage.sortableChildren = true`; Pixi 8 then sorts the stage by `zIndex`
  every frame (stable). R183-G's "z-order is `addChild` order" therefore holds ONLY among zIndex-0
  children. The S187 draft panel carried `zIndex = 900` and drew over his cruiser even though main.ts
  stages the cruiser last. Fixed by removing the zIndex and staging the panel immediately before
  `avatarRenderer.bringLocalToFront()`.
- ⭐ Rule: **no stage child gets a zIndex**; place it by its staging line. The one standing exception is
  the exit-confirm root (`exitButton.ts`, 900), which still draws over the cruiser — known, unchanged.
- Pinned by `src/render/s189CruiserAboveDraft.test.ts` (real classes through `stage.sortChildren()` and
  Pixi's `EventBoundary`; a mechanical list of every code-level `.zIndex =` in `src/`).

## New section candidate (render) — EVERY PIXI PATH SEGMENT STARTS WITH `moveTo` (S189 C7)

> *"a big line every time they teleport all over the screen … without that weird like laser beam"*
> — owner, S189, of DEEP CURRENT

- Pixi 8 `arc()` / `lineTo()` join the current pen to their start, and after each `fill`/`stroke` the
  pen is re-seated at the finished path's `getLastPoint()` — stale `Point.shared` after a shape,
  `(undefined, undefined)` after an arc. A bare `arc()` after any fill draws a line from elsewhere on
  the board. Shipped twice: S86 P2 (`hazardRing.ts`, "a stray line from screen top-left") and S188
  (the DEEP CURRENT swirl, 928 px wide in the test).
- ⭐ Rule: **`g.moveTo(start).arc(…)`** (or `beginPath()`), never a bare `arc()` on a shared Graphics.
  Remaining offenders are listed as F4 in `S189_PROGRESS_render.md`.
- Pinned for the swirl by `src/render/s189DeepCurrentNoBeam.test.ts` (host + 10 Hz client).
