/**
 * SPARK — GOBLIN renderer (S139 P2). Procedural, no atlas.
 *
 * ## Why this file is mandatory rather than polish
 *
 * Both shipped creature renderers are EXCLUSION filters — `creatureRenderer` draws only Voltkin and
 * drones (`if (!isVoltkin && !isDrone) continue`), `chewerRenderer` only chewers
 * (`if (c.type !== 'chewer') continue`) — and there is no renderer registry to register into. There
 * is also no `switch` anywhere over `CreatureType`, so a new member produces NO compile error. The
 * consequence, measured in the S139 A.0 sweep: a new creature type simulates, walks, strikes, kills
 * and dies with **nothing drawn**. That is the same class of defect as S139 P1's dead dispatcher —
 * present, correct, and invisible — so the renderer lands in the same priority as the behaviour, not
 * after it.
 *
 * ## Why procedural and not a veo atlas
 *
 * A.0 measured the atlas path as ~326 LOC of near-duplicate renderer per character, with the loader
 * (`ensureAtlas`, 40 LOC) having ZERO test coverage, against only 28.6 KiB of quiet entry-bundle
 * headroom before the charter's WARN band. `turretRenderer.ts` is a complete procedural defender in
 * 153 LOC with no texture, no manifest, no async load and no fallback branch. Atlas art for the
 * goblins is a later, art-focused session; this is a real, legible unit in the meantime.
 *
 * ## The animation channel
 *
 * Everything animated here is derived from state that RIDES THE WIRE — `state`, `ticksInState`, `hp`,
 * `pos` — never from `performance.now()` for anything mechanical. That matters because a one-shot
 * `world.effects` push is lost ~5/6 of the time (the 10 Hz snapshot samples effects while the
 * renderer wipes them every frame), so the swing has to be readable from held state alone. Wall-clock
 * is used ONLY for cosmetic idle bob, which is allowed to differ per peer.
 */

import { Application, Container, Graphics } from 'pixi.js';
import type { World } from '../state/world.ts';
import type { CreatureId } from '../types.ts';
import { getCreatureConfig } from '../state/creatures/voltkin-config.ts';
import { PLAYER_COLORS } from '../constants.ts';
import { multiplierFifths } from '../state/stats.ts';

const OUTLINE = 0x2b2b2b;
const SKIN = 0x7fae4e;
const SKIN_SHADE = 0x5f8c37;
const EYE = 0xfff3c4;
const BLADE = 0xd8dde3;
const BLADE_EDGE = 0xf2f6fa;
const LOIN = 0x8a5a34;

const BODY_R = 7.5;

export class GoblinRenderer {
  private readonly graphics: Graphics;
  /** Previous position per goblin — the facing source (movement direction, not target direction). */
  private readonly lastSeenPos: Map<CreatureId, { x: number; y: number }> = new Map();
  private readonly facing: Map<CreatureId, 1 | -1> = new Map();

  constructor(app: Application, parent: Container = app.stage) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
    void app;
  }

  sync(world: World): void {
    const g = this.graphics;
    g.clear();
    const nowSec = performance.now() / 1000;
    const live = new Set<CreatureId>();

    for (const c of world.creatures.values()) {
      if (c.type !== 'goblinMelee') continue;
      live.add(c.id);

      // Facing from actual movement, with a dead-zone so a jittering idle unit does not flip-flop.
      const prev = this.lastSeenPos.get(c.id);
      let face = this.facing.get(c.id) ?? 1;
      if (prev !== undefined) {
        const dx = c.pos.x - prev.x;
        if (dx > 0.25) face = 1;
        else if (dx < -0.25) face = -1;
      }
      this.facing.set(c.id, face);
      this.lastSeenPos.set(c.id, { x: c.pos.x, y: c.pos.y });

      const owner = world.players.get(c.ownerPlayerId);
      const tint =
        owner?.color ?? PLAYER_COLORS[c.ownerPlayerId as unknown as number] ?? PLAYER_COLORS[0]!;

      // SPAWNING materialize: fade in over the config window so a granted goblin does not pop.
      const cfg = getCreatureConfig(c.type);
      const alpha =
        c.state === 'SPAWNING' ? Math.min(1, c.ticksInState / Math.max(1, cfg.spawnTicks)) : 1;

      this.drawGoblin(g, c.pos.x, c.pos.y, face, alpha, tint, this.swing(c.state, c.ticksInState), nowSec, c.id);
      this.drawHpPips(g, c.pos.x, c.pos.y, c.ehp, cfg.hp, cfg.def, alpha);
    }

    // Drop bookkeeping for goblins that died, so the Maps cannot grow without bound across a match.
    for (const id of [...this.lastSeenPos.keys()]) {
      if (!live.has(id)) {
        this.lastSeenPos.delete(id);
        this.facing.delete(id);
      }
    }
  }

  /**
   * Arm angle in radians, driven entirely by the SYNCED FSM. Reads as: wind the cleaver back through
   * the first half of the cycle, snap it through the target at the fire tick, then drift back to rest.
   * `attackFireTick` is read from config rather than hardcoded so retuning the cadence cannot desync
   * the animation from the actual hit.
   */
  private swing(state: string, ticksInState: number): number {
    if (state !== 'ATTACKING') return -0.35; // rest, cleaver low
    const fire = getCreatureConfig('goblinMelee').attackFireTick;
    if (ticksInState <= fire) {
      const t = ticksInState / Math.max(1, fire); // 0 → 1 windup
      return -0.35 - t * 1.5; // rotate back and up
    }
    const t = Math.min(1, (ticksInState - fire) / Math.max(1, fire)); // 0 → 1 recovery
    return 1.5 - t * 1.85; // snapped through, easing back to rest
  }

  private drawGoblin(
    g: Graphics,
    x: number,
    y: number,
    face: 1 | -1,
    alpha: number,
    tint: number,
    swing: number,
    nowSec: number,
    id: CreatureId,
  ): void {
    // Cosmetic-only idle bob. Phase-offset per id so a cluster of goblins does not pulse in lockstep.
    const bob = Math.sin(nowSec * 4 + (id as unknown as number)) * 0.6;
    const cy = y + bob;

    g.ellipse(x, y + BODY_R + 3, BODY_R * 0.85, 2.6).fill({ color: 0x000000, alpha: 0.18 * alpha });

    // Legs
    g.moveTo(x - 2.5, cy + BODY_R - 1).lineTo(x - 3.5, cy + BODY_R + 3.5)
      .stroke({ color: OUTLINE, width: 1.8, alpha });
    g.moveTo(x + 2.5, cy + BODY_R - 1).lineTo(x + 3.5, cy + BODY_R + 3.5)
      .stroke({ color: OUTLINE, width: 1.8, alpha });

    // Body + owner sash (the only tinted element — whose goblin this is must be readable at a glance)
    g.circle(x, cy, BODY_R).fill({ color: SKIN, alpha }).stroke({ color: OUTLINE, width: 1.6, alpha });
    g.circle(x + face * 1.6, cy + 1.6, BODY_R * 0.55).fill({ color: SKIN_SHADE, alpha: 0.5 * alpha });
    g.moveTo(x - BODY_R * 0.8, cy + 1).lineTo(x + BODY_R * 0.8, cy + 3)
      .stroke({ color: tint, width: 2.2, alpha });
    g.ellipse(x, cy + BODY_R * 0.75, 2.6, 1.8).fill({ color: LOIN, alpha: 0.9 * alpha });

    // Head: pointed ears + one big eye, offset toward the facing direction
    const hx = x + face * 1.2;
    const hy = cy - BODY_R * 0.9;
    g.circle(hx, hy, BODY_R * 0.62).fill({ color: SKIN, alpha }).stroke({ color: OUTLINE, width: 1.4, alpha });
    for (const s of [-1, 1] as const) {
      g.poly([
        hx + s * 3.2, hy - 0.6,
        hx + s * 7.0, hy - 3.4,
        hx + s * 3.4, hy + 1.8,
      ]).fill({ color: SKIN, alpha }).stroke({ color: OUTLINE, width: 1, alpha });
    }
    g.circle(hx + face * 1.5, hy - 0.3, 1.5).fill({ color: EYE, alpha });
    g.circle(hx + face * 1.9, hy - 0.3, 0.7).fill({ color: OUTLINE, alpha });

    // Arm + cleaver, rotated by the swing. Kept as one rigid unit: the S137 art spike found veo
    // repeatedly detaching the blade mid-swing, and the owner ruling is that a melee unit never
    // releases its weapon — trivially guaranteed here because the blade is drawn FROM the hand.
    const shoulderX = x + face * 2.2;
    const shoulderY = cy - 1.5;
    const a = swing * face;
    const handX = shoulderX + Math.cos(a) * face * 7.5;
    const handY = shoulderY + Math.sin(a) * 7.5;
    g.moveTo(shoulderX, shoulderY).lineTo(handX, handY)
      .stroke({ color: SKIN_SHADE, width: 2.4, alpha });
    const tipX = handX + Math.cos(a - face * 0.5) * face * 8.5;
    const tipY = handY + Math.sin(a - face * 0.5) * 8.5;
    g.moveTo(handX, handY).lineTo(tipX, tipY).stroke({ color: BLADE, width: 3.4, alpha });
    g.moveTo(handX, handY).lineTo(tipX, tipY)
      .stroke({ color: BLADE_EDGE, width: 1.2, alpha: 0.9 * alpha });
  }

  /**
   * HP pips above the head — one pip per HP POINT, filled by how many points remain.
   *
   * ⭐ S151 P2 — THIS USED TO READ `GOBLIN_MELEE_HP` AS ITS DENOMINATOR, which made the renderer the
   * third consumer of the goblin-as-backbone defect (owner R72) and, worse, hard-coded ONE unit's
   * toughness into a function drawing ANY unit. Now every number comes from the drawn creature's own
   * config, so the six goblin kinds arriving with the goblin tower each get a correct bar for free.
   *
   * `ehp` is in FIFTHS; one HP point is `5 + def` fifths, so remaining points is that division
   * rounded UP — a unit on its last sliver still shows one pip rather than reading as already dead.
   */
  private drawHpPips(
    g: Graphics,
    x: number,
    y: number,
    ehp: number,
    hpPoints: number,
    def: number,
    alpha: number,
  ): void {
    const perPoint = multiplierFifths(def);
    const remaining = Math.ceil(ehp / perPoint);
    if (remaining >= hpPoints) return; // undamaged: no clutter
    const total = hpPoints;
    const w = 1.6;
    const gap = 0.9;
    const span = total * w + (total - 1) * gap;
    const x0 = x - span / 2;
    const py = y - BODY_R * 2.5;
    for (let i = 0; i < total; i++) {
      const filled = i < remaining;
      g.rect(x0 + i * (w + gap), py, w, 2.4).fill({
        color: filled ? 0x8ce06a : 0x000000,
        alpha: (filled ? 0.95 : 0.28) * alpha,
      });
    }
  }

  clear(): void {
    this.graphics.clear();
    this.lastSeenPos.clear();
    this.facing.clear();
  }
}
