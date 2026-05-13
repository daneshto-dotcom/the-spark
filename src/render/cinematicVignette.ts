/**
 * SPARK — counter-window vignette (S22 P3 Battle Ledger row 11, Δ5 flat-color variant).
 *
 * During a godly's 8s sustained-effect window, the opponent (i.e. the player
 * who is NOT in the activeCinematicPlayerId slot) sees a low-alpha full-screen
 * tint signaling "counter window active." Voltkin uses #FFD60A (sprite yellow).
 * The active triggerer does NOT see this — they're watching the cinematic instead.
 *
 * v1 = flat-color α 0.15 Container, no gradient. ~20 LOC per Δ5 budget revision.
 */

import { Application, Container, Graphics } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';

export interface CinematicVignetteHandle {
  readonly container: Container;
  setVisible(visible: boolean): void;
}

export function makeCinematicVignette(app: Application, color: number = 0xffd60a): CinematicVignetteHandle {
  const container = new Container();
  const bg = new Graphics();
  bg.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color, alpha: 0.15 });
  container.addChild(bg);
  container.visible = false;
  app.stage.addChild(container);
  return {
    container,
    setVisible(visible: boolean): void {
      container.visible = visible;
    },
  };
}
