/**
 * SPARK — S158 A3 (owner): **a raid hits anything.**
 *
 * Owner, reviewing the batch: *"a raid should hit anything, it holds a certain attack strenght and
 * stats of its own — again ive already explained it when we worked the unit and tower stats. look
 * back at what i said."*
 *
 * They had explained it. `constants.ts` has published the R78 kill table since S152:
 *
 * > it one-shots chewer(5), ranged goblin(6), melee goblin(7), hound(5), flying goblin(10),
 * > sapper(10) and drone(10); it does NOT one-shot shield goblin(16, needs 2), **HELGA(54, needs 6)**
 * > or voltkin(64, needs 7).
 *
 * ⛔ AND TWO OF THOSE ROWS WERE UNREACHABLE. Nothing new is decided here; two shipped rulings are
 * finally connected to their own table:
 *
 * 1. **HELGA** — the reducer had no defender arm, because S151 P2 removed the defender damage
 *    substrate wholesale. S158 P7 restored it (scoped to unit-class defenders), so the arm is now
 *    expressible.
 * 2. ⭐ **VOLTKIN and the free goblins** — S152 P1 removed the chewers-only restriction from the
 *    REDUCER, writing *"R78 says units"*, and left it standing in the PICKER. The rule was widened
 *    where it is enforced and not where it is aimed, so the published "voltkin needs 7 raids" could
 *    never have had its first raid spent. A half-widened rule is worse than an un-widened one,
 *    because the record says it shipped.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch, type World } from './world.ts';
import { makeDefender } from './defenders/defender.ts';
import { applySpawnCreature } from './creatures/creatureLifecycle.ts';
import { attackFifths, unitPoolFifths } from './stats.ts';
import { asDefenderId, asPlayerId, asPrimitiveId } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';
import {
  PRIMITIVE_MAX_HP,
  PRINCESS_DEF,
  PRINCESS_HP,
  RAID_ATK,
  RAID_PEN,
  SparkType,
} from '../constants.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const RAID = attackFifths(RAID_ATK, RAID_PEN);
const HELGA_POOL = unitPoolFifths(PRINCESS_HP, PRINCESS_DEF);

function make1v1(): World {
  const w = makeWorld(0x8158);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.creatures.clear();
  // Raid points are earned in play; this is a unit test of the SPEND, so the wallet is seeded.
  w.players.get(P0)!.raidPoints = 20;
  return w;
}

function addPrimAt(w: World, seat: 0 | 1, x: number, y: number): Primitive {
  const player = w.players.get(asPlayerId(seat))!;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const prim: Primitive = {
    id, type: SparkType.Square, placerColor: player.color, placedBy: player.id,
    createdTick: w.tick, pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
    ownerColor: player.color, lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, prim);
  return prim;
}

function plant(w: World, kind: 'princess' | 'turret', seat: 0 | 1, x: number, y: number) {
  const anchor = addPrimAt(w, seat, x, y);
  const d = makeDefender({
    id: asDefenderId(w.nextDefenderId++),
    kind,
    ownerPlayerId: asPlayerId(seat),
    anchorPrimitiveId: anchor.id,
    recipeId: kind === 'princess' ? 'helga' : 'laserTurret',
    pos: { x, y },
    registeredAtTick: w.tick,
  });
  w.defenders.set(d.id, d);
  return d;
}

function raidDefender(w: World, id: ReturnType<typeof asDefenderId>) {
  dispatch(w, { type: 'RAID_TARGET', target: { kind: 'defender', id }, playerId: P0 });
}

describe('S158 A3 — a raid hits HELGA, at exactly the published rate', () => {
  it('⭐ one raid costs one point and lands 10 fifths on her', () => {
    const w = make1v1();
    const h = plant(w, 'princess', 1, 500, 500);
    const before = w.players.get(P0)!.raidPoints;
    raidDefender(w, h.id);
    expect(w.defenders.get(h.id)!.ehp).toBe(HELGA_POOL - RAID);
    expect(w.players.get(P0)!.raidPoints).toBe(before - 1);
  });

  it('⭐ SIX RAIDS KILL HER — the number constants.ts has published since S152', () => {
    const w = make1v1();
    const h = plant(w, 'princess', 1, 500, 500);
    expect(Math.ceil(HELGA_POOL / RAID), 'the published arithmetic itself').toBe(6);
    for (let i = 0; i < 5; i++) raidDefender(w, h.id);
    expect(w.defenders.has(h.id), 'five is not enough').toBe(true);
    raidDefender(w, h.id);
    expect(w.defenders.has(h.id), 'the sixth finishes her').toBe(false);
  });

  it('emits a RAIDED cloud in the RAIDER’s colour, flagged killed on the blow that lands it', () => {
    const w = make1v1();
    const h = plant(w, 'princess', 1, 500, 500);
    w.effects.length = 0;
    raidDefender(w, h.id);
    const first = w.effects.filter((e) => e.kind === 'RAIDED');
    expect(first).toHaveLength(1);
    expect((first[0] as { killed: boolean }).killed).toBe(false);
    expect((first[0] as { color: number }).color).toBe(w.players.get(P0)!.color);
    for (let i = 0; i < 4; i++) raidDefender(w, h.id);
    w.effects.length = 0;
    raidDefender(w, h.id);
    expect((w.effects.filter((e) => e.kind === 'RAIDED')[0] as { killed: boolean }).killed).toBe(true);
  });

  it('⛔ a TOWER refuses the raid AND KEEPS THE POINT — R75 is not reopened, and you are not charged', () => {
    const w = make1v1();
    const t = plant(w, 'turret', 1, 500, 500);
    const before = w.players.get(P0)!.raidPoints;
    raidDefender(w, t.id);
    expect(w.defenders.has(t.id), 'towers still die by recipe-break').toBe(true);
    expect(
      w.players.get(P0)!.raidPoints,
      'paid-but-got-nothing must be unrepresentable — the atomicity rule every other arm holds',
    ).toBe(before);
  });

  it('never your OWN princess, and the point is not spent', () => {
    const w = make1v1();
    const mine = plant(w, 'princess', 0, 500, 500);
    const before = w.players.get(P0)!.raidPoints;
    raidDefender(w, mine.id);
    expect(w.defenders.get(mine.id)!.ehp).toBe(HELGA_POOL);
    expect(w.players.get(P0)!.raidPoints).toBe(before);
  });

  it('a raid with no points left changes nothing', () => {
    const w = make1v1();
    w.players.get(P0)!.raidPoints = 0;
    const h = plant(w, 'princess', 1, 500, 500);
    raidDefender(w, h.id);
    expect(w.defenders.get(h.id)!.ehp).toBe(HELGA_POOL);
  });
});

describe('S158 A3 — and the PICKER stopped excluding what the reducer already allowed', () => {
  /**
   * The reducer arm for creatures has been unrestricted since S152 P1. The picker was not, so the
   * two disagreed for six sessions and the published voltkin row was unreachable. These pin the
   * REDUCER half; the picker half is a DOM-bound `pickCreature` and is pinned by the source guard
   * below rather than by a fake pointer event.
   */
  it('⭐ a VOLTKIN takes a raid — 7 of them, exactly as published', () => {
    const w = make1v1();
    applySpawnCreature(w, {
      type: 'SPAWN_CREATURE', creatureType: 'voltkin', ownerPlayerId: P1,
      pos: { x: 500, y: 500 }, targetPos: { x: 500, y: 500 }, sourceSpawnerId: null,
    });
    const v = [...w.creatures.values()].at(-1)!;
    expect(Math.ceil(v.ehp / RAID), 'the published arithmetic').toBe(7);
    for (let i = 0; i < 6; i++) {
      dispatch(w, { type: 'RAID_TARGET', target: { kind: 'creature', id: v.id }, playerId: P0 });
    }
    expect(w.creatures.has(v.id), 'six is not enough for a voltkin').toBe(true);
    dispatch(w, { type: 'RAID_TARGET', target: { kind: 'creature', id: v.id }, playerId: P0 });
    expect(w.creatures.has(v.id)).toBe(false);
  });

  it('⭐ the PICKER no longer filters to spawner-sourced creatures (the six-session gap)', async () => {
    // A source guard rather than a behavioural one: `pickCreature` reads `this.cursor` and the live
    // pointer state, so exercising it needs the whole DOM input rig. What CAN be pinned cheaply is
    // that the chewers-only line is gone — and that line is the entire defect.
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('../input/controls.ts', import.meta.url)), 'utf8');
    const picker = src.slice(src.indexOf('private pickCreature('), src.indexOf('private pickRaidableDefender('));
    expect(picker).not.toMatch(/if \(c\.sourceSpawnerId === null\) continue;/);
    expect(picker, 'enemy-only must survive the widening').toMatch(/c\.ownerPlayerId === this\.playerId/);
  });

  it('the defender picker refuses a tower, so a point can never be aimed at one', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('../input/controls.ts', import.meta.url)), 'utf8');
    const picker = src.slice(src.indexOf('private pickRaidableDefender('));
    expect(picker.slice(0, 600)).toMatch(/d\.ehp === null\) continue;/);
  });
});
