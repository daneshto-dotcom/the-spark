/**
 * SPARK — S103 P3 (#9) laser-turret renderer.
 *
 * Draws every DEFENDER of kind 'turret' as an ORIGINAL pencil-sketch turret: a squat tripod
 * housing with a glowing lens that CHARGES as the next shot nears, contracting wind-up rings, and a
 * thick red jittery BEAM lancing to the target on fire. One shared Graphics, cleared + redrawn each
 * frame from world.defenders (the ChewerRenderer pattern), parented to aboveFogLayer so an enemy's
 * turret is visible through the fog (cross-player reach, like chewers/Voltkin).
 *
 * Everything is derived from SYNCED defender state so host AND the 1v1 client render identically
 * (Council MF1): the charge + wind-up rings from `nextFireTick - world.tick`; the beam from the
 * `state === 'FIRE'` window drawn to the synced `lastStrikePos` (a fixed endpoint that survives the
 * victim's death). The laser SFX fires when this renderer first observes a turret enter FIRE
 * (per-id state cache) — reliable on both peers, zero wire/effect surface. RENDER-ONLY: reads world,
 * never mutates; wall-clock is used ONLY for cosmetic beam jitter (the fire timing is tick-synced).
 */

import { Application, Container, Graphics } from 'pixi.js';
import type { World } from '../state/world.ts';
import type { DefenderId } from '../types.ts';
import { getDefenderConfig } from '../state/defenders/defender.ts';
import { TURRET_WINDUP_RINGS } from '../constants.ts';
import { playLaserSFX } from './audioManager.ts';

// ── pencil palette ──
const GRAPHITE = 0x2e2f36;
const GRAPHITE_SOFT = 0x4a4c55;
const PAPER_FILL = 0xe9e7df;
const LENS_COLD = 0x6f8cff; // idle lens (cool blue)
const LENS_HOT = 0xff5a3c; // fully-charged / firing lens (hot red-orange)
const BEAM_CORE = 0xfff1e0; // white-hot beam core
const BEAM_EDGE = 0xff3b2e; // red beam edge

const BODY_R = 16; // housing radius

/** Lerp two 0xRRGGBB colors by t in [0,1]. */
function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export class TurretRenderer {
  private readonly graphics: Graphics;
  /** Per-turret last-seen FSM state — fire the laser SFX on the IDLE/WINDUP→FIRE edge. */
  private readonly lastState: Map<DefenderId, string> = new Map();

  constructor(app: Application, parent: Container = app.stage) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
  }

  sync(world: World): void {
    const g = this.graphics;
    g.clear();
    const nowSec = performance.now() / 1000;
    const live = new Set<DefenderId>();

    for (const d of world.defenders.values()) {
      if (d.kind !== 'turret') continue;
      live.add(d.id);
      const config = getDefenderConfig('turret');
      // Charge progress 0..1 (0 = just fired, 1 = about to fire), derived from synced nextFireTick.
      const remaining = d.nextFireTick - world.tick;
      const charge = Math.max(0, Math.min(1, 1 - remaining / config.fireIntervalTicks));
      const firing = d.state === 'FIRE';

      // SFX on the fire edge.
      const prev = this.lastState.get(d.id);
      if (firing && prev !== 'FIRE') void playLaserSFX({ x: d.pos.x, y: d.pos.y });
      this.lastState.set(d.id, d.state);

      // Aim angle: toward the strike/target if we have one, else point up.
      let aim = -Math.PI / 2;
      const aimAt = firing ? d.lastStrikePos
        : d.targetCreatureId !== null ? world.creatures.get(d.targetCreatureId)?.pos ?? null
        : null;
      if (aimAt) aim = Math.atan2(aimAt.y - d.pos.y, aimAt.x - d.pos.x);

      this.drawTurret(g, d.pos.x, d.pos.y, charge, firing, aim, nowSec);
      if (firing && d.lastStrikePos !== null) {
        this.drawBeam(g, d.pos.x, d.pos.y, d.lastStrikePos.x, d.lastStrikePos.y, nowSec);
      }
    }

    // Drop SFX-edge state for turrets that despawned (recipe-break) so a rebuild re-arms cleanly.
    if (this.lastState.size > live.size) {
      for (const id of [...this.lastState.keys()]) if (!live.has(id)) this.lastState.delete(id);
    }
  }

  private drawTurret(g: Graphics, x: number, y: number, charge: number, firing: boolean, aim: number, nowSec: number): void {
    // Tripod legs (3 splayed pencil strokes).
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i - 1) * 0.9;
      g.moveTo(x, y + 2)
        .lineTo(x + Math.cos(a + Math.PI / 2) * (BODY_R + 12), y + BODY_R + 12)
        .stroke({ color: GRAPHITE, width: 2.4, alpha: 0.9 });
    }
    // Ground shadow.
    g.ellipse(x, y + BODY_R + 13, BODY_R * 0.9, 4).fill({ color: 0x000000, alpha: 0.18 });
    // Housing (paper fill + graphite outline).
    g.circle(x, y, BODY_R).fill({ color: PAPER_FILL, alpha: 0.95 }).stroke({ color: GRAPHITE, width: 2.2 });
    g.circle(x, y, BODY_R * 0.7).stroke({ color: GRAPHITE_SOFT, width: 1.2, alpha: 0.7 });

    // Barrel aiming toward the target.
    const bx = x + Math.cos(aim) * (BODY_R + 10);
    const by = y + Math.sin(aim) * (BODY_R + 10);
    g.moveTo(x + Math.cos(aim) * BODY_R * 0.4, y + Math.sin(aim) * BODY_R * 0.4)
      .lineTo(bx, by).stroke({ color: GRAPHITE, width: 4.5, alpha: 0.95 });

    // Charging lens — color + glow ramp with charge; flares white-hot on fire.
    const lensColor = firing ? BEAM_CORE : lerpColor(LENS_COLD, LENS_HOT, charge);
    const glowR = BODY_R * (0.42 + charge * 0.35) + (firing ? 4 : 0);
    g.circle(x, y, glowR + 5).fill({ color: lensColor, alpha: 0.18 + charge * 0.22 });
    g.circle(x, y, glowR).fill({ color: lensColor, alpha: 0.6 + charge * 0.35 });

    // Wind-up rings: up to TURRET_WINDUP_RINGS contracting toward the lens as charge → 1.
    for (let i = 0; i < TURRET_WINDUP_RINGS; i++) {
      const ringThreshold = i / TURRET_WINDUP_RINGS;
      if (charge < ringThreshold) continue; // ring i appears once charge passes its slot
      const local = (charge - ringThreshold) / (1 - ringThreshold + 1e-6); // 0..1 within the ring's life
      const rr = BODY_R + 26 - local * 22 + Math.sin(nowSec * 6 + i) * 1.2; // contracts inward
      g.circle(x, y, rr).stroke({ color: lerpColor(LENS_COLD, LENS_HOT, charge), width: 1.4, alpha: 0.5 * (1 - local) + 0.15 });
    }
  }

  private drawBeam(g: Graphics, x0: number, y0: number, x1: number, y1: number, nowSec: number): void {
    // Thick red beam with a white-hot core + a slight cosmetic jitter (render-only wall-clock).
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len; // unit normal for the jitter offset
    const midJit = Math.sin(nowSec * 40) * 3;
    const mx = (x0 + x1) / 2 + nx * midJit, my = (y0 + y1) / 2 + ny * midJit;
    // outer red glow
    g.moveTo(x0, y0).quadraticCurveTo(mx, my, x1, y1).stroke({ color: BEAM_EDGE, width: 9, alpha: 0.4 });
    g.moveTo(x0, y0).quadraticCurveTo(mx, my, x1, y1).stroke({ color: BEAM_EDGE, width: 5, alpha: 0.7 });
    // white-hot core
    g.moveTo(x0, y0).quadraticCurveTo(mx, my, x1, y1).stroke({ color: BEAM_CORE, width: 2, alpha: 0.95 });
    // muzzle flash + impact burst
    g.circle(x0, y0, 6).fill({ color: BEAM_CORE, alpha: 0.8 });
    g.circle(x1, y1, 9).fill({ color: BEAM_EDGE, alpha: 0.5 });
    g.circle(x1, y1, 4).fill({ color: BEAM_CORE, alpha: 0.9 });
  }

  clear(): void {
    this.graphics.clear();
    this.lastState.clear();
  }
}
