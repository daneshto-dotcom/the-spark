/**
 * SPARK — S170 P5 — the zombie rot aura and the Kraken sonar wave, pinned.
 *
 * These are DERIVED visuals, and the whole reason they are derived is that a one-shot
 * `world.effects` push is lost ~5/6 of the time (effects sample into snapshots at 10 Hz; the
 * renderer wipes them at 60). That makes the contract worth asserting rather than eyeballing:
 * two peers on the same tick must draw the same thing, and the visual must agree with the SIM about
 * when the ability actually happens. Both failures are silent on one screen.
 */

import { describe, expect, it } from 'vitest';
import type { Graphics } from 'pixi.js';
import { drawBossAuras } from './bossAuras.ts';
import { makeWorld, type World } from '../state/world.ts';
import { T9_BOSS_TYPE } from '../state/t9BossIds.ts';
import { applyStun } from '../state/creatures/creature.ts';
import { KRAKEN_SONAR_INTERVAL_TICKS, PRIMITIVE_MAX_HP } from '../constants.ts';
import { asCreatureId, asPlayerId } from '../types.ts';
import type { Creature } from '../state/creatures/creature.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

/** Records every draw call as a comparable string, so two frames can be diffed exactly. */
function recorder(): { g: Graphics; ops: string[] } {
  const ops: string[] = [];
  const g = {
    circle(x: number, y: number, r: number) { ops.push(`circle ${x.toFixed(3)} ${y.toFixed(3)} ${r.toFixed(3)}`); return g; },
    arc(x: number, y: number, r: number, a0: number, a1: number) { ops.push(`arc ${x.toFixed(3)} ${y.toFixed(3)} ${r.toFixed(3)} ${a0.toFixed(3)} ${a1.toFixed(3)}`); return g; },
    fill(o: { alpha: number }) { ops.push(`fill ${o.alpha.toFixed(3)}`); return g; },
    stroke(o: { alpha: number; width: number }) { ops.push(`stroke ${o.width} ${o.alpha.toFixed(3)}`); return g; },
  } as unknown as Graphics;
  return { g, ops };
}

function put(w: World, id: number, type: string, owner = P0, x = 500, y = 500): Creature {
  const c = {
    id: asCreatureId(id), type, ownerPlayerId: owner,
    pos: { x, y }, prevPos: { x, y },
    state: 'SEEKING', ticksInState: 0, stateEnteredTick: 0, spawnTick: 0,
    despawnAtTick: 1_000_000, ehp: PRIMITIVE_MAX_HP, sourceSpawnerId: null,
    targetBondId: null, targetCreatureId: null, targetPrimitiveId: null,
  } as unknown as Creature;
  w.creatures.set(c.id, c);
  return c;
}

function board(): World {
  const w = makeWorld(7);
  w.gameState = 'PLAYING';
  w.creatures.clear();
  return w;
}

describe('drawBossAuras — the rot aura', () => {
  it('draws for a live zombie boss', () => {
    const w = board();
    put(w, 1, T9_BOSS_TYPE.zombies);
    const { g, ops } = recorder();
    drawBossAuras(g, w);
    expect(ops.length).toBeGreaterThan(0);
  });

  it('⛔ STOPS while the boss is stunned — the visual reads the SAME predicate as the sim', () => {
    /*
     * `runZombieRotAura` returns early for a stunned boss (owner R152 — *"cant do anything"*). An
     * aura that kept boiling would advertise damage that is not being dealt and make the player's
     * only counterplay look like it failed. This is the assertion that keeps the two in step.
     */
    const w = board();
    const boss = put(w, 1, T9_BOSS_TYPE.zombies);
    const before = recorder();
    drawBossAuras(before.g, w);
    expect(before.ops.length).toBeGreaterThan(0);

    applyStun(boss, w.tick + 600);
    const after = recorder();
    drawBossAuras(after.g, w);
    expect(after.ops, 'a stunned zombie boils nothing').toHaveLength(0);
  });

  it('⭐ POSITIVE CONTROL — it comes BACK when the stun expires, so the gate is not a one-way latch', () => {
    const w = board();
    const boss = put(w, 1, T9_BOSS_TYPE.zombies);
    applyStun(boss, w.tick + 10);
    w.tick += 20; // past expiry
    const { g, ops } = recorder();
    drawBossAuras(g, w);
    expect(ops.length).toBeGreaterThan(0);
  });

  it('draws nothing for a boss of another race, or a corpse', () => {
    const w = board();
    put(w, 1, T9_BOSS_TYPE.orcs);
    const a = recorder(); drawBossAuras(a.g, w);
    expect(a.ops).toHaveLength(0);

    const w2 = board();
    const dead = put(w2, 1, T9_BOSS_TYPE.zombies);
    (dead as { ehp: number }).ehp = 0;
    const b = recorder(); drawBossAuras(b.g, w2);
    expect(b.ops).toHaveLength(0);
  });

  it('⛔ DETERMINISM — identical world + tick gives byte-identical draws, and it ANIMATES', () => {
    const w = board();
    put(w, 1, T9_BOSS_TYPE.zombies);
    const a = recorder(); drawBossAuras(a.g, w);
    const b = recorder(); drawBossAuras(b.g, w);
    expect(b.ops, 'two peers must boil identically or the effect is a desync you can see').toEqual(a.ops);

    w.tick += 5;
    const c = recorder(); drawBossAuras(c.g, w);
    expect(c.ops, 'and it must not be a still image').not.toEqual(a.ops);
  });
});

describe('drawBossAuras — the Kraken sonar wave', () => {
  /** The sim fires when (tick + id) % INTERVAL === 0, so this is the tick a wave starts. */
  function tickOfFire(id: number): number {
    return KRAKEN_SONAR_INTERVAL_TICKS - (id % KRAKEN_SONAR_INTERVAL_TICKS);
  }

  it('⭐⭐ draws right after the sim fires, and NOT in the middle of the interval', () => {
    /*
     * THE DERIVATION THIS WHOLE MODULE RESTS ON. `runKrakenSonar` gates on
     * `(world.tick + bossId) % KRAKEN_SONAR_INTERVAL_TICKS !== 0` — a pure function of two SYNCED
     * values — so the renderer can reconstruct how long ago each Kraken fired with no new wire field
     * and no effect push to lose. If this pair of assertions ever disagrees, the visual has drifted
     * from the mechanic and the wave is lying about where the stun landed.
     */
    const w = board();
    const id = 3;
    put(w, id, T9_BOSS_TYPE.nagas, P0, 500, 500);
    put(w, 99, 'goblinMelee', P1, 620, 500); // a target in reach, or the sim fires no wave either

    w.tick = tickOfFire(id);
    const onFire = recorder(); drawBossAuras(onFire.g, w);
    expect(onFire.ops.length, 'a wave must be visible on the tick it is fired').toBeGreaterThan(0);

    w.tick = tickOfFire(id) + Math.floor(KRAKEN_SONAR_INTERVAL_TICKS / 2);
    const between = recorder(); drawBossAuras(between.g, w);
    expect(between.ops, 'and nothing between waves').toHaveLength(0);
  });

  it('⛔ no target in reach ⇒ no wave, because the sim fires none either', () => {
    const w = board();
    const id = 3;
    put(w, id, T9_BOSS_TYPE.nagas, P0, 500, 500);
    // An enemy far outside KRAKEN_SONAR_RANGE (260).
    put(w, 99, 'goblinMelee', P1, 1800, 1000);
    w.tick = tickOfFire(id);
    const { g, ops } = recorder();
    drawBossAuras(g, w);
    expect(ops).toHaveLength(0);
  });

  it('⛔ never aims at its OWN escort — the cone is enemies-only, same as the sim', () => {
    const w = board();
    const id = 3;
    put(w, id, T9_BOSS_TYPE.nagas, P0, 500, 500);
    put(w, 99, 'goblinMelee', P0, 560, 500); // same owner
    w.tick = tickOfFire(id);
    const { g, ops } = recorder();
    drawBossAuras(g, w);
    expect(ops).toHaveLength(0);
  });

  it('the wave EXPANDS across its visible window', () => {
    const w = board();
    const id = 3;
    put(w, id, T9_BOSS_TYPE.nagas, P0, 500, 500);
    put(w, 99, 'goblinMelee', P1, 620, 500);

    const radiusAt = (offset: number): number => {
      w.tick = tickOfFire(id) + offset;
      const { g, ops } = recorder();
      drawBossAuras(g, w);
      const arcs = ops.filter((o) => o.startsWith('arc')).map((o) => Number(o.split(' ')[3]));
      return Math.max(...arcs);
    };
    expect(radiusAt(6), 'the front must travel outward, or it reads as a flash not a wave')
      .toBeGreaterThan(radiusAt(1));
  });
});
