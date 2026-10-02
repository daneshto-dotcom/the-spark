/**
 * S194 T6 — ENTROPY TAX, PHASE 1 RESEARCH (no mechanic built). Reproduces the owner's two numbers
 * through the REAL `damageConnector` / `severWithCarry` / `SEVER_BOND` path and measures what 20
 * melee goblins do to each lattice in one 60 s fight. Option arithmetic for the owner is printed.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType, FIGHT_PHASE_TICKS, GOBLIN_ATTACK_CADENCE_TICKS, GOBLIN_MELEE_ATK, GOBLIN_MELEE_PEN } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import type { Primitive } from '../game/primitive.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId } from '../types.ts';
import { damageConnector, severWithCarry } from './damage.ts';
import { attackFifths, structurePoolFifths } from './stats.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { componentOf } from '../game/structure.ts';
import { mix32 } from './rng.ts';
import { ALL_BLUEPRINT_IDS } from './blueprints.ts';
import { recipeConnectorCount } from './towerUnit.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

/** A freeform lattice of `shapes` shapes on a triangular grid with exactly `connectors` bonds, all seat 0. */
function lattice(shapes: number, connectors: number): { w: World; bondIds: BondId[] } {
  const w = makeWorld(0x194e7);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  const cols = Math.ceil(Math.sqrt(shapes));
  const ps: Primitive[] = [];
  for (let i = 0; i < shapes; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const x = 400 + c * 40 + (r % 2) * 20, y = 300 + r * 35;
    const id = asPrimitiveId(1 + i);
    const p = { id, type: SparkType.Dot, placerColor: PLAYER_COLORS[0]!, placedBy: P0, createdTick: 0,
      pos: { x, y }, prevPos: { x, y }, bonds: new Set<BondId>(), ownerColor: PLAYER_COLORS[0]!,
      lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null } as unknown as Primitive;
    w.primitives.set(id, p);
    ps.push(p);
  }
  // every pair, nearest first (spanning chain first so the lattice is ONE component)
  const pairs: Array<[number, number, number]> = [];
  for (let i = 0; i < shapes; i++) for (let j = i + 1; j < shapes; j++) {
    const dx = ps[i]!.pos.x - ps[j]!.pos.x, dy = ps[i]!.pos.y - ps[j]!.pos.y;
    pairs.push([dx * dx + dy * dy, i, j]);
  }
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const have = new Set<string>();
  const bondIds: BondId[] = [];
  const add = (i: number, j: number) => {
    const k = `${i},${j}`;
    if (have.has(k)) return;
    have.add(k);
    const id = asBondId(1000 + bondIds.length);
    const a = ps[i]!, b = ps[j]!;
    w.bonds.set(id, { id, aId: a.id, bId: b.id, a, b, restLength: 40, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0 } as never);
    a.bonds.add(id); b.bonds.add(id);
    bondIds.push(id);
  };
  for (let i = 1; i < shapes; i++) add(i - 1, i);
  for (const [, i, j] of pairs) { if (bondIds.length >= connectors) break; add(i, j); }
  expect(bondIds.length).toBe(connectors);
  return { w, bondIds };
}

function compSize(w: World): { n: number; s: number } {
  const any = [...w.primitives.values()][0]!;
  const c = componentOf(any, w.primitives, w.bonds);
  return { n: c.bondIds.size, s: c.primitiveIds.size };
}

/** 20 goblins × one fight, all swinging at the lowest-id standing bond (focus fire). */
function oneFight(shapes: number, connectors: number, goblins = 20): { felled: number; swingsForFirst: number } {
  const { w } = lattice(shapes, connectors);
  const hit = attackFifths(GOBLIN_MELEE_ATK, GOBLIN_MELEE_PEN);
  const swings = goblins * Math.floor(FIGHT_PHASE_TICKS / GOBLIN_ATTACK_CADENCE_TICKS);
  let felled = 0, swingsForFirst = -1;
  for (let k = 0; k < swings && w.bonds.size > 0; k++) {
    const target = [...w.bonds.keys()].sort((a, b) => Number(a) - Number(b))[0]!;
    if (damageConnector(w, target, hit, null, 'physical')) {
      felled += severWithCarry(w, target, (id) => dispatch(w, { type: 'SEVER_BOND', bondId: id, playerId: P1, cause: 'unit' }));
      if (swingsForFirst < 0) swingsForFirst = k + 1;
    }
  }
  return { felled, swingsForFirst };
}

/** Option A arithmetic — per-mille chance per connector per wave. ⚠ MINE coefficients. */
const FREE = 10;
const chanceA = (n: number) => Math.min(250, Math.max(0, n - FREE)); // 0.1 % per connector past 10, cap 25 %
/** Option B — DEF stops growing past 10: pool = n × (5 + min(n, 10)). */
const poolB = (n: number) => n * (5 + Math.min(n, FREE));

describe('S194 T6 entropy — research', () => {
  it('reproduces the owner numbers and the "cannot fell one connector" fight', () => {
    const lines: string[] = [];
    for (const [s, n] of [[65, 145], [24, 54], [6, 5]] as const) {
      const { w } = lattice(s, n);
      const sz = compSize(w);
      expect(sz).toEqual({ n, s });
      const pool = structurePoolFifths(n);
      let total = 0; for (let k = 1; k <= n; k++) total += structurePoolFifths(k);
      const f = oneFight(s, n);
      lines.push(`${n}c/${s}s: pool(first connector)=${pool} fifths, fell-everything=${total}, 20 goblins x 60 s fells ${f.felled} (first after ${f.swingsForFirst} swings)`);
    }
    expect(structurePoolFifths(145)).toBe(21750);
    expect(structurePoolFifths(54)).toBe(3186);
    // Option A expected loss per wave, measured with the real mix32 over 200 seeds.
    for (const n of [5, 9, 20, 30, 54, 100, 145]) {
      let lost = 0;
      for (let seed = 1; seed <= 200; seed++) for (let b = 0; b < n; b++) {
        if (mix32(mix32(seed, 1), 1000 + b) % 1000 < chanceA(n)) lost++;
      }
      lines.push(`A n=${n}: chance ${chanceA(n) / 10}% per connector per wave, mean loss/wave ${(lost / 200).toFixed(1)}`);
    }
    for (const n of [5, 10, 20, 54, 145]) lines.push(`B n=${n}: pool ${structurePoolFifths(n)} -> ${poolB(n)}`);
    // Option C — one roll per wave at (n - 10)% (max 90%); a hit crumbles the ceil(n/20) OUTERMOST shapes.
    for (const [s, n] of [[65, 145], [24, 54], [12, 20]] as const) {
      const { w } = lattice(s, n);
      const ps = [...w.primitives.values()];
      const cx = ps.reduce((a, p) => a + p.pos.x, 0) / ps.length, cy = ps.reduce((a, p) => a + p.pos.y, 0) / ps.length;
      const k = Math.ceil(n / 20);
      const outer = ps.map((p) => ({ p, d: (p.pos.x - cx) ** 2 + (p.pos.y - cy) ** 2 })).sort((a, b) => b.d - a.d || Number(a.p.id) - Number(b.p.id)).slice(0, k);
      const gone = new Set<BondId>();
      for (const o of outer) for (const b of o.p.bonds) gone.add(b);
      const chance = Math.min(90, Math.max(0, n - FREE));
      lines.push(`C ${n}c/${s}s: roll ${chance}%/wave, a hit drops ${k} shapes + ${gone.size} connectors -> pool ${structurePoolFifths(n)} -> ${structurePoolFifths(n - gone.size)}; mean connectors/wave ${(chance / 100 * gone.size).toFixed(1)}`);
    }
    let maxRecipe = 0;
    for (const id of ALL_BLUEPRINT_IDS) maxRecipe = Math.max(maxRecipe, recipeConnectorCount(id));
    lines.push(`max recipe connectors = ${maxRecipe}`);
    console.log(lines.join('\n'));
  });
});
