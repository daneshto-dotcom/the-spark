/**
 * ⭐⭐ S192 (owner T12) — **EVERY TICK OF HEALING SHOWS, STRAIGHT ABOVE THE UNIT THAT WAS HEALED.**
 *
 * > *"It should show that he's healing over time … every tick of healing should show above him."*
 *
 * Driven for real: the CORPSE EATER feed through the real `runHostTick` into the real `DamageNumbers`
 * (only Pixi's `Text` is faked — Node has no canvas), and for the JOINER the real
 * `HostSync → ClientSync.receive → interpolateInto` path into a second `DamageNumbers`.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class Container { children: unknown[] = []; addChild(c: unknown): void { this.children.push(c); } removeChild(): void {} }
  class TextStyle { constructor(public o?: { fill?: number }) {} }
  class Text {
    text = ''; style: unknown = null; visible = true; alpha = 1;
    anchor = { set: (): void => {} }; position = { set: (): void => {} }; scale = { set: (): void => {} };
    constructor(o?: { text?: string; style?: unknown }) { this.text = o?.text ?? ''; this.style = o?.style; }
    destroy(): void {}
  }
  return { Container, Text, TextStyle };
});

const { NET_RENDER_DELAY_MS } = await import('../constants.ts');
const { dispatch, makeWorld } = await import('../state/world.ts');
const { makeHostTickState, runHostTick } = await import('../state/hostTick.ts');
const { Spawner, DEFAULT_SPAWNER_CONFIG } = await import('../game/spawner.ts');
const { makeGameStateExtras } = await import('../state/gameState.ts');
const { mulberry32 } = await import('../state/rng.ts');
const { makeCreature, creatureMaxEhp, noteCreatureHeal } = await import('../state/creatures/creature.ts');
const { getCreatureConfig } = await import('../state/creatures/voltkin-config.ts');
const { attackFifths } = await import('../state/stats.ts');
const { HostSync, ClientSync } = await import('../net/sync.ts');
const { asCreatureId, asPlayerId } = await import('../types.ts');
const { DamageNumbers, healAnchor, damageAnchor, DAMAGE_LIFT_PX } = await import('./damageNumbers.ts');
const { CORPSE_EATER_HEAL_PULSES, CORPSE_EATER_TRIGGER_PCT } = await import('../state/racial/corpseEater.ts');

/* eslint-disable @typescript-eslint/no-explicit-any */
const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const BOSS_CFG = getCreatureConfig('t9BossZombies');
const BITE = attackFifths(BOSS_CFG.atk, BOSS_CFG.pen);

type Placed = { x: number; y: number; amount: number; kind: 'damage' | 'heal'; drift: number };

/** Record every floater `place` puts on screen (they age out of `live`, so it is spied, not read). */
function recorder(dn: any): Placed[] {
  const out: Placed[] = [];
  const orig = dn.place.bind(dn);
  dn.place = (at: { x: number; y: number }, amount: number, kind: 'damage' | 'heal'): void => {
    orig(at, amount, kind);
    const f = dn.live[dn.live.length - 1];
    out.push({ x: at.x, y: at.y, amount, kind, drift: f.drift });
  };
  return out;
}

function deps(): any {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
    controls: { state: { kind: 'Idle' }, applyPerSubstep() {} }, botManager: null,
    gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  };
}

function world(): any {
  const w: any = makeWorld(0x5192);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.draft = null;
  w.creatures.clear();
  const p = w.players.get(P0);
  p.raceId = 'zombies';
  p.draftPicks.splice(0, p.draftPicks.length, 'hp', 'racial');
  return w;
}

function put(w: any, type: string, owner: any, x: number, y = 540): any {
  const c = makeCreature(getCreatureConfig(type as never), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: owner, pos: { x, y }, targetPos: { x, y },
    spawnedAtTick: w.tick, sourceSpawnerId: null,
  });
  c.state = 'SEEKING';
  w.creatures.set(c.id, c);
  return c;
}

describe('S192 T12 — a heal sits straight above the healed unit (pure placement)', () => {
  it('⭐⭐ heal: no lean toward the enemy and no sideways fling; a hit keeps R185-D', () => {
    const w = world();
    const me = put(w, 't3Warband', P0, 500);
    put(w, 't3Warband', P1, 540); // an enemy 40 px to his right
    expect(healAnchor(me.pos.x, me.pos.y)).toEqual({ x: 500, y: 540 - DAMAGE_LIFT_PX });
    expect(damageAnchor(w, me.id, me.pos.x, me.pos.y).x, 'a hit still leans toward the enemy').toBeGreaterThan(500);

    const dn: any = new DamageNumbers();
    const placed = recorder(dn);
    dn.sync(w);
    me.ehp -= 5; // a hit
    dn.sync(w);
    const before = me.ehp;
    me.ehp += 3;
    noteCreatureHeal(me, before); // a heal
    dn.sync(w);
    const heal = placed.find((p) => p.kind === 'heal')!;
    const hit = placed.find((p) => p.kind === 'damage')!;
    expect(heal.x, 'straight above him').toBe(500);
    expect(heal.drift, 'rises straight up').toBe(0);
    expect(hit.x).toBeGreaterThan(500);
    expect(hit.drift).not.toBe(0);
  });
});

describe('S192 T12 — REACH: the feed prints one green number per pulse, above him', () => {
  /** The boss at 20 % eating his own warband (one bite, no retaliation), through the real host tick. */
  function feed(each: (w: any, boss: any) => void): { boss: any } {
    const w = world();
    const boss = put(w, 't9BossZombies', P0, 960);
    boss.ehp = Math.floor((creatureMaxEhp(boss) * CORPSE_EATER_TRIGGER_PCT) / 100);
    const food = put(w, 't3Warband', P0, 980);
    const d = deps();
    const st = makeHostTickState(w);
    for (let t = 0; t < BOSS_CFG.attackFireTick + 80; t++) {
      runHostTick(w, d, st);
      for (const id of [...w.creatures.keys()]) if (id !== boss.id && id !== food.id) w.creatures.delete(id);
      if (w.creatures.has(food.id)) { food.pos.x = 980; food.pos.y = 540; food.prevPos.x = 980; food.prevPos.y = 540; }
      each(w, boss);
    }
    return { boss };
  }

  it('⭐⭐ HOST: six green numbers, 17 17 17 17 18 18, each straight above the boss', () => {
    const dn: any = new DamageNumbers();
    const placed = recorder(dn);
    let at: { x: number; y: number }[] = [];
    const { boss } = feed((w, b) => {
      at.push({ x: b.pos.x, y: b.pos.y });
      dn.sync(w);
    });
    void boss;
    const heals = placed.filter((p) => p.kind === 'heal');
    expect(heals.map((h) => h.amount)).toEqual([17, 17, 17, 17, 18, 18]);
    expect(heals.length).toBe(CORPSE_EATER_HEAL_PULSES);
    expect(heals.reduce((a, h) => a + h.amount, 0)).toBe(BITE);
    for (const h of heals) {
      expect(h.drift).toBe(0);
      expect(at.some((p) => p.x === h.x && p.y - DAMAGE_LIFT_PX === h.y), 'above the boss').toBe(true);
    }
    at = [];
  });

  it('⭐⭐ JOINER: the same six numbers off 10 Hz snapshots — ten ticks apart, so none merge', () => {
    const host = new HostSync();
    const client = new ClientSync();
    const cw: any = makeWorld(0);
    cw.isHost = false;
    cw.gameMode = '1v1';
    cw.gameState = 'LOBBY';
    const dn: any = new DamageNumbers();
    const placed = recorder(dn);
    let now = 1000;
    feed((w) => {
      if (w.tick % 6 !== 0) return; // the host's 10 Hz snapshot cadence
      now += 100;
      client.receive(host.buildSnapshotMessage(w), now);
      client.interpolateInto(cw, now, NET_RENDER_DELAY_MS);
      dn.sync(cw);
    });
    const heals = placed.filter((p) => p.kind === 'heal');
    expect(heals.map((h) => h.amount)).toEqual([17, 17, 17, 17, 18, 18]);
    for (const h of heals) expect(h.drift).toBe(0);
  });
});
