/**
 * SPARK — S121 P1 (B3): KEYSTONE TELEGRAPH renderer.
 *
 * Makes the S118 symbiotic-chaining conferrals VISIBLE. Two hub types emit a traveling pulse
 * along the MAGIC bonds branched off their endpoint primitives:
 *   - an un-fouled ANCHOR (Dot↔Square) → a GOLD pulse   (rigidity keystone — state/keystoneAnchor.ts)
 *   - an un-fouled FILAMENT (Dot↔Line) → a GREEN pulse   (income keystone   — state/scoring.ts, S121 P2)
 * so the player SEES which structures a keystone is feeding, and learns that WHERE you branch your
 * magic (build order / topology) is the geometric-builder decision.
 *
 * CROSS-PEER BY CONSTRUCTION: the physics conferral rides ephemeral, un-synced state
 * (bond.stiffnessMultiplier for rigidity; a scoring-time count for income), so a JOINER cannot read
 * the actual conferral. This renderer instead derives the STRUCTURAL relationship (un-fouled hub +
 * magic neighbor sharing an endpoint prim) from fully-SYNCED graph state (primitives / bonds / types /
 * fouledPrimitives) and animates the pulse phase off world.tick (also synced) — so host and joiner draw
 * an identical telegraph with ZERO extra wire/save bytes and zero determinism impact (pure cosmetic).
 *
 * ALWAYS-ON, SUBTLE (owner taste, S121; Council Q2 ratified): the pulse fires wherever the keystone
 * LINK exists, not only where rigidity is actively rescuing a sagged bond in enemy territory (that would
 * need a host-only per-tick territory pass, unavailable on joiners). It reads as "these bonds are
 * keystone-LINKED" — true everywhere — kept low-alpha so it never screams "shielded now". A magic bond
 * linked to BOTH an Anchor and a Filament shows both colours (blessed on both axes), by design.
 */

import { Application, Graphics } from 'pixi.js';
import { isAnchorCombo, isFilamentCombo, isMagical } from '../combos.ts';
import { KEYSTONE_INCOME_MAX_NEIGHBORS } from '../constants.ts';
import type { World } from '../state/world.ts';

export const KEYSTONE_RIGIDITY_PULSE_COLOR = 0xffd873; // gold — Anchor rigidity conferral
export const KEYSTONE_INCOME_PULSE_COLOR = 0x74e0a4; // green — Filament income conferral
const PULSE_PERIOD_TICKS = 42; // ~0.7s at 60 Hz — one hub→neighbor sweep
const PULSE_RADIUS = 3;
const PULSE_ALPHA = 0.55; // subtle
const LINK_TINT_ALPHA = 0.1; // faint persistent link line under the pulse

/**
 * One traveling pulse: from a hub's shared endpoint prim (fromX,fromY) out to the far end of the blessed
 * magic neighbor bond (toX,toY), in the hub's colour. `phase` staggers pulses (derived from the synced,
 * deterministic hub bond id) so they don't all fire in lockstep — identical on both peers.
 */
export interface KeystonePulse {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly color: number;
  readonly phase: number;
}

/**
 * Pure fn of synced world state — the SAME endpoint-neighbor scan as applyKeystoneAnchor, generalized to
 * both hub types. Exported for unit tests (no Pixi). For each un-fouled Anchor/Filament hub, walk its two
 * endpoint prims' incident bonds and emit a pulse for each un-fouled MAGIC neighbor (excluding the hub
 * itself). Order-independent (emits a bounded list; the renderer draws all).
 */
export function computeKeystonePulses(world: World): KeystonePulse[] {
  const pulses: KeystonePulse[] = [];
  const fouled = world.fouledPrimitives;
  for (const hub of world.bonds.values()) {
    const ha = world.primitives.get(hub.aId);
    if (ha === undefined) continue;
    const hb = world.primitives.get(hub.bId);
    if (hb === undefined) continue;
    const rigidity = isAnchorCombo(ha.type, hb.type);
    const income = isFilamentCombo(ha.type, hb.type);
    if (!rigidity && !income) continue; // not a keystone hub
    // A fouled hub stops conferring (parity with keystoneAnchor.ts + the "fouled structure earns zero" rule).
    if (fouled.has(hub.aId) || fouled.has(hub.bId)) continue;
    const color = rigidity ? KEYSTONE_RIGIDITY_PULSE_COLOR : KEYSTONE_INCOME_PULSE_COLOR;
    const phase = hub.id % PULSE_PERIOD_TICKS;
    // S122 P3 (B3 polish) — VISUAL HONESTY: the income keystone PAYS at most
    // KEYSTONE_INCOME_MAX_NEIGHBORS (scoring.ts per-Filament cap, Council S121 Q1), so the
    // green pulse now stops at the same budget, counted in the SAME deterministic scan order
    // scoring uses ([fa,fb] endpoints, then each prim's bonds array — both synced, so host
    // and joiner cap the identical first-3). Rigidity (gold) stays uncapped — the physics
    // conferral has no neighbor cap.
    let incomeBudget = income ? KEYSTONE_INCOME_MAX_NEIGHBORS : Number.POSITIVE_INFINITY;

    for (const shared of [ha, hb]) {
      for (const neighborBondId of shared.bonds) {
        if (neighborBondId === hub.id) continue; // the hub is not its own neighbor
        const nb = world.bonds.get(neighborBondId);
        if (nb === undefined) continue;
        const na = world.primitives.get(nb.aId);
        if (na === undefined) continue;
        const nbEnd = world.primitives.get(nb.bId);
        if (nbEnd === undefined) continue;
        if (!isMagical(na.type, nbEnd.type)) continue; // only magic neighbors are blessed
        // A fouled magic neighbor receives nothing (foul-skip parity).
        if (fouled.has(nb.aId) || fouled.has(nb.bId)) continue;
        if (incomeBudget <= 0) continue; // income cap reached — remaining neighbors unpaid, unlit
        incomeBudget--;
        const far = nb.aId === shared.id ? nbEnd : na; // the neighbor endpoint away from the hub
        pulses.push({
          fromX: shared.pos.x,
          fromY: shared.pos.y,
          toX: far.pos.x,
          toY: far.pos.y,
          color,
          phase,
        });
      }
    }
  }
  return pulses;
}

/**
 * Draws the keystone telegraph each frame. One Graphics, clear + redraw (the effectsRenderer/
 * structureRenderer convention). No world mutation, no wire/save cost.
 */
export class KeystoneTelegraphRenderer {
  private readonly graphics: Graphics;

  constructor(app: Application) {
    this.graphics = new Graphics();
    app.stage.addChild(this.graphics);
  }

  sync(world: World): void {
    const g = this.graphics;
    g.clear();
    const tick = world.tick;
    for (const p of computeKeystonePulses(world)) {
      // Faint persistent link line so the keystone relationship reads even between pulse sweeps.
      g.moveTo(p.fromX, p.fromY)
        .lineTo(p.toX, p.toY)
        .stroke({ width: 1, color: p.color, alpha: LINK_TINT_ALPHA });
      // Traveling pulse dot: hub endpoint → neighbor far end, fading as it travels outward.
      const t = ((tick + p.phase) % PULSE_PERIOD_TICKS) / PULSE_PERIOD_TICKS;
      const x = p.fromX + (p.toX - p.fromX) * t;
      const y = p.fromY + (p.toY - p.fromY) * t;
      g.circle(x, y, PULSE_RADIUS).fill({ color: p.color, alpha: PULSE_ALPHA * (1 - t * 0.5) });
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
