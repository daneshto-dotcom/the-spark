/**
 * SPARK — S144 P3: the tower you are carrying, drawn under your cursor.
 *
 * Owner ruling: *"then the spark (your cruiser) just drags it to where you want it to be!"* — so once
 * a tower is picked from the build grid it follows the cursor, and the release puts it down.
 *
 * ## WHAT IT DRAWS
 *
 * The armed blueprint's REAL geometry at world scale via `drawBlueprintShape` — the same function the
 * panel tiles use and the same `blueprints.ts` data `applyBuildBlueprint` stamps. So the ghost is not
 * a picture of the tower, it IS the tower's layout, and it cannot drift from what lands.
 *
 * ## LEGAL / ILLEGAL IS THE WHOLE POINT
 *
 * Tinted green when `stampRefusalAt` returns null and red-with-a-reason when it does not, from the
 * SAME predicate the host reducer re-runs on commit. That sharing is the contract `dragPreview.ts`
 * established for single-primitive placement: *"the preview is the same set the release commits"*. A
 * ghost that reads green over a spot the host then refuses teaches the player to distrust it, which is
 * worse than showing nothing.
 *
 * ⚠ ON A JOINER THIS IS BEST-EFFORT, exactly as `computePreviewBonds` documents for its own case: the
 * joiner evaluates legality against a snapshot up to ~100 ms stale, so the host is the authority and
 * a refused build simply no-ops (`applyBuildBlueprint` is NO-OP-never-throw). Stated rather than
 * discovered later.
 */

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { blueprintRadius } from '../state/blueprints.ts';
import { stampRefusalAt } from '../state/blueprintLegality.ts';
import { drawBlueprintShape } from './blueprintGlyph.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import type { World } from '../state/world.ts';
import type { Vec2 } from '../types.ts';

const OK_TINT = 0x5cffa0;
const BAD_TINT = 0xff6b6b;

export class BlueprintGhost {
  private readonly container: Container;
  private readonly art: Graphics;
  private readonly ring: Graphics;
  private readonly reasonText: Text;

  constructor(app: Application) {
    this.container = new Container();
    this.art = new Graphics();
    this.ring = new Graphics();
    this.reasonText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: BAD_TINT }),
    });
    this.reasonText.anchor.set(0.5, 0);
    this.container.addChild(this.ring);
    this.container.addChild(this.art);
    this.container.addChild(this.reasonText);
    // ⚠ NON-INTERACTIVE, and this matters: the ghost sits directly under the pointer, so if it took
    // part in hit-testing it would swallow the very click meant to place it.
    this.container.eventMode = 'none';
    this.container.visible = false;
    app.stage.addChild(this.container);
  }

  /**
   * Repaint for this frame. `armed` null hides everything.
   *
   * Called from the render loop with the live cursor, so the ghost tracks the pointer at frame rate
   * without needing its own listener — `Controls` already maps raw pointer coords into 1920x1080
   * logical space (letterbox-aware), and duplicating that mapping here is exactly the
   * duplicated-coordinate class the geometry getters exist to delete.
   */
  sync(world: World, cursor: Vec2, armed: GodlyId | null): void {
    if (armed === null || world.gameState !== 'PLAYING') {
      this.container.visible = false;
      return;
    }
    this.container.visible = true;
    this.container.position.set(cursor.x, cursor.y);

    const refusal = stampRefusalAt(world, cursor, world.localPlayerId, armed);
    const tint = refusal === null ? OK_TINT : BAD_TINT;

    // FOOTPRINT RING — shows the space the build will actually occupy, which is the one thing a
    // node-only drawing cannot convey. It is also the radius the legality check clears, so the player
    // can see WHY a spot near their own structures is refused.
    const r = blueprintRadius(armed);
    this.ring.clear();
    this.ring.circle(0, 0, r).stroke({ width: 2, color: tint, alpha: 0.35 });

    this.art.clear();
    this.art.alpha = refusal === null ? 0.85 : 0.5;
    drawBlueprintShape(this.art, armed, 0, 0, 1, { tint, bondAlpha: 0.75 });

    // Name the blocker instead of just going red — the same contract the panel honours for a disabled
    // control. "BLOCKED" and "ENEMY GROUND" call for completely different moves by the player.
    this.reasonText.text = refusal ?? '';
    this.reasonText.style.fill = tint;
    this.reasonText.position.set(0, r + 6);
  }
}
