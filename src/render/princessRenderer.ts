/**
 * SPARK — S103 P4 (#10) — HELGA princess renderer.
 *
 * Draws every DEFENDER of kind 'princess' as an ORIGINAL articulated puppet (Council-locked rig,
 * NOT a gif / not a twitch): skirt(dirndl) · torso(bodice) · head(braids+face) · beer-arm(stein) ·
 * slap-arm(hand) · two legs — each part posed every frame by the pure `helgaPose(state,ticksInState)`
 * (a real wind-up → impact → recover slap arc + idle breathing + a periodic beer-sip). CtCD-style:
 * thick painterly graphite outlines + flat fills. ORIGINAL character — Bavarian-dirndl + beer-stein
 * VIBE only, no franchise likeness.
 *
 * All motion is derived from SYNCED defender state so host AND the 1v1 client animate identically
 * (Council MF1): the slap arc from `state`/`ticksInState`; the impact star-burst + slap SFX from the
 * `state === 'FIRE'` window at the synced `lastStrikePos`. One shared Graphics, aboveFogLayer (an
 * enemy's HELGA is visible through the fog). RENDER-ONLY; wall-clock used only for the cosmetic
 * impact-burst flicker (the slap TIMING is tick-synced).
 */

import { Application, Container, Graphics } from 'pixi.js';
import type { World } from '../state/world.ts';
import type { DefenderId } from '../types.ts';
import { helgaPose, type HelgaPose } from './helgaPose.ts';
import { playSlapSFX } from './audioManager.ts';

// ── palette (CtCD: thick dark outline, saturated flats) ──
const OUTLINE = 0x241a14; // thick painterly outline
const SKIRT = 0x2e6b4f; // dark Bavarian green dirndl
const SKIRT_TRIM = 0xe8d9a0; // cream trim/apron
const BODICE = 0x6b1f1f; // deep red bodice
const SKIN = 0xf2c9a0;
const SKIN_SHADE = 0xd99a76;
const HAIR = 0xc8922e; // golden braids
const CHEEK = 0xe06a5a;
const STEIN = 0xcfd2d8; // pewter mug
const FOAM = 0xfbf6e6;
const IMPACT = 0xfff0b0; // slap-impact star-burst

const SHO_Y = -50; // shoulder height (local, +y down, origin at feet)
const SHO_X = 9; // shoulder half-width
const ARM_LEN = 20;

export class PrincessRenderer {
  private readonly graphics: Graphics;
  private readonly lastState: Map<DefenderId, string> = new Map();
  private readonly facing: Map<DefenderId, 1 | -1> = new Map();

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
      if (d.kind !== 'princess') continue;
      live.add(d.id);
      // Per-defender offset (its id) desyncs the idle ambient across multiple HELGAs (Council CHECK).
      const pose = helgaPose(d.state, d.ticksInState, world.tick, d.id as unknown as number);
      const firing = d.state === 'FIRE';

      // Face the target (synced strike/target pos), holding the last facing when idle.
      const aimAt = firing ? d.lastStrikePos
        : d.targetCreatureId !== null ? world.creatures.get(d.targetCreatureId)?.pos ?? null
        : null;
      let face = this.facing.get(d.id) ?? 1;
      if (aimAt) face = aimAt.x >= d.pos.x ? 1 : -1;
      this.facing.set(d.id, face);

      // Slap SFX on the FIRE edge.
      const prev = this.lastState.get(d.id);
      if (firing && prev !== 'FIRE') void playSlapSFX({ x: d.pos.x, y: d.pos.y });
      this.lastState.set(d.id, d.state);

      this.drawHelga(g, d.pos.x, d.pos.y, face, pose);
      if (firing && d.lastStrikePos !== null) {
        // S109 P3 — the screen-spanning slap-shockwave streak (drawSlapReach) is REMOVED: with the
        // range cut to a local 380px (no more whole-screen reach) it only ever read as a cross-map
        // laser, which is the owner's actual complaint (#3). Just the close-range impact star-burst
        // at the (now always-nearby) strike point remains.
        this.drawImpact(g, d.lastStrikePos.x, d.lastStrikePos.y, d.ticksInState, nowSec);
      }
    }

    if (this.lastState.size > live.size) {
      for (const id of [...this.lastState.keys()]) if (!live.has(id)) { this.lastState.delete(id); this.facing.delete(id); }
    }
  }

  /** Draw the full puppet. (lx,ly)=feet anchor; `face` mirrors X; `pose` supplies the per-part angles. */
  private drawHelga(g: Graphics, lx: number, ly: number, face: 1 | -1, pose: HelgaPose): void {
    const X = (x: number) => lx + face * x; // local-x → world-x with facing
    const Y = (y: number) => ly + y + pose.bodyBobY;
    const O = { color: OUTLINE, width: 3.2, alpha: 1 } as const;
    const Othin = { color: OUTLINE, width: 2, alpha: 0.9 } as const;

    // Ground shadow.
    g.ellipse(lx, ly + 2, 16, 4).fill({ color: 0x000000, alpha: 0.2 });

    // Legs (two stubby graphite strokes under the skirt).
    for (const s of [-1, 1]) {
      g.moveTo(X(s * 5), Y(-16)).lineTo(X(s * 5), Y(-2)).stroke({ color: OUTLINE, width: 4.5 });
    }

    // Skirt (dirndl bell) — trapezoid waist→hem, swaying.
    const sway = pose.skirtSway;
    const hemL = X(-17 + sway * 14), hemR = X(17 + sway * 14);
    g.moveTo(X(-8), Y(-36)).lineTo(hemL, Y(-15)).lineTo(hemR, Y(-15)).lineTo(X(8), Y(-36)).closePath()
      .fill({ color: SKIRT }).stroke(O);
    // Apron/trim band along the hem.
    g.moveTo(hemL, Y(-15)).lineTo(hemR, Y(-15)).stroke({ color: SKIRT_TRIM, width: 4, alpha: 0.95 });
    g.moveTo(X(-4), Y(-34)).lineTo(X(-6), Y(-16)).stroke({ color: SKIRT_TRIM, width: 5, alpha: 0.8 }); // apron front

    // Torso/bodice.
    g.moveTo(X(-8), Y(-36)).lineTo(X(-9), Y(-52)).lineTo(X(9), Y(-52)).lineTo(X(8), Y(-36)).closePath()
      .fill({ color: BODICE }).stroke(O);
    g.moveTo(X(0), Y(-50)).lineTo(X(0), Y(-37)).stroke({ color: SKIRT_TRIM, width: 1.6, alpha: 0.8 }); // lacing

    // BEER ARM (back arm) — holds a stein, raises toward the mouth as sip→1.
    const ba = pose.beerArmAngle;
    const bSho = { x: X(-SHO_X), y: Y(SHO_Y) };
    const bHand = { x: bSho.x - face * Math.sin(ba) * ARM_LEN, y: bSho.y + Math.cos(ba) * ARM_LEN - pose.sip * 8 };
    g.moveTo(bSho.x, bSho.y).lineTo(bHand.x, bHand.y).stroke({ color: SKIN, width: 6 }).stroke(Othin);
    // Stein (mug + foam) in the hand.
    g.roundRect(bHand.x - 4, bHand.y - 6, 8, 11, 1.5).fill({ color: STEIN }).stroke(O);
    g.ellipse(bHand.x, bHand.y - 6, 5, 2.4).fill({ color: FOAM }).stroke(Othin);

    // SLAP ARM (front arm) — the business hand; angle from straight-down, + = across the front.
    const sa = pose.slapArmAngle;
    const sSho = { x: X(SHO_X), y: Y(SHO_Y) };
    const reach = ARM_LEN + pose.slapReach;
    const sHand = { x: sSho.x + face * Math.sin(sa) * reach, y: sSho.y + Math.cos(sa) * reach };
    g.moveTo(sSho.x, sSho.y).lineTo(sHand.x, sHand.y).stroke({ color: SKIN, width: 6 }).stroke(Othin);
    // Open slapping hand (a fan of stubby fingers).
    g.circle(sHand.x, sHand.y, 5).fill({ color: SKIN }).stroke(Othin);
    g.circle(sHand.x + face * 2, sHand.y - 2, 2).fill({ color: SKIN_SHADE });

    // Head + golden braids + determined face.
    const hx = X(0 + pose.leanAngle * 10), hy = Y(-62);
    // braids (two thick golden ropes down the sides)
    for (const s of [-1, 1]) {
      g.moveTo(hx + face * s * 8, hy + 2).lineTo(hx + face * s * 11, hy + 16).stroke({ color: HAIR, width: 5 }).stroke(Othin);
    }
    g.circle(hx, hy, 11).fill({ color: SKIN }).stroke(O);
    // hair top + a tiny braid crown
    g.moveTo(hx - 11, hy - 2).quadraticCurveTo(hx, hy - 16, hx + 11, hy - 2).stroke({ color: HAIR, width: 5 }).stroke(Othin);
    // rosy cheeks
    g.circle(hx - face * 5, hy + 3, 2.4).fill({ color: CHEEK, alpha: 0.8 });
    g.circle(hx + face * 5, hy + 3, 2.4).fill({ color: CHEEK, alpha: 0.8 });
    // eyes (look toward the target) + a determined brow
    const eo = face * 1.5;
    g.circle(hx - face * 3 + eo, hy - 1, 1.6).fill({ color: OUTLINE });
    g.circle(hx + face * 3 + eo, hy - 1, 1.6).fill({ color: OUTLINE });
    g.moveTo(hx - face * 6, hy - 5).lineTo(hx - face * 1, hy - 4).stroke({ color: OUTLINE, width: 1.4 });
    g.moveTo(hx + face * 1, hy - 4).lineTo(hx + face * 6, hy - 5).stroke({ color: OUTLINE, width: 1.4 });
    // mouth: open shout when slapping, small smirk otherwise
    if (pose.slapReach > 1) g.circle(hx + face * 1, hy + 6, 2.6).fill({ color: 0x7a2b2b });
    else g.moveTo(hx - face * 3, hy + 6).quadraticCurveTo(hx + face * 1, hy + 8, hx + face * 4, hy + 6).stroke({ color: OUTLINE, width: 1.6 });
  }

  /** A quick cartoon star-burst at the slap point (cosmetic flicker via wall-clock). */
  private drawImpact(g: Graphics, x: number, y: number, ticksInState: number, nowSec: number): void {
    const t = Math.min(1, ticksInState / 8); // burst pops then fades over the first ~8 FIRE ticks
    const alpha = 1 - t;
    if (alpha <= 0) return;
    const r = 8 + t * 16;
    const spin = nowSec * 8;
    g.circle(x, y, r * 0.5).fill({ color: IMPACT, alpha: 0.5 * alpha });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + spin;
      const x1 = x + Math.cos(a) * r, y1 = y + Math.sin(a) * r;
      g.moveTo(x, y).lineTo(x1, y1).stroke({ color: IMPACT, width: 2.5 * alpha + 0.5, alpha: 0.9 * alpha });
    }
  }

  clear(): void {
    this.graphics.clear();
    this.lastState.clear();
    this.facing.clear();
  }
}
