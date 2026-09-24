/**
 * ⭐⭐ S189 (owner R190-I) — `Creature.healedFifths`: EVERY HEAL SITE WRITES IT, EXACTLY, AND IT CROSSES
 * THE WIRE.
 *
 * > *"It has to show -12 and +2 separately, in different colors … it shows every single hit or heal."*
 *
 * The floater can only split a hit from a heal if the counter is exact at every site that raises a
 * creature's pool, so each is driven through its REAL entry point here:
 *   1. BLOOD DEBT outside a strike batch (`applyLifesteal` heals at once);
 *   2. BLOOD DEBT inside the batch (`applyPendingLifesteal` lands the sum);
 *   3. Vlad's LIFE SAP (`runVladLifeSap`);
 *   4. CORPSE EATER (`runCorpseEater`, his bite).
 * Each asserts the counter rose by EXACTLY what the pool gained — including under the max cap, where
 * what landed is less than what was asked. Then the wire: absent while zero (byte-identical to every
 * prior snapshot), carried once set, and validated on the way in.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, VLAD_LIFE_SAP_HEAL_PCT, phaseDurationTicks } from '../constants.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { damageEntity } from './damage.ts';
import { applyLifesteal, applyPendingLifesteal, lifestealFifths, BLOOD_DEBT_LIFESTEAL_PCT } from './racial/lifesteal.ts';
import { runVladLifeSap } from './bossSkills.ts';
import { CORPSE_EATER_TRIGGER_PCT, runCorpseEater } from './racial/corpseEater.ts';
import { asCreatureId, creatureMaxEhp, makeCreature, noteCreatureHeal, type Creature, type CreatureType } from './creatures/creature.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { attackFifths } from './stats.ts';
import { applyNetSnapshot, netSnapshot } from './save.ts';
import { asPlayerId, asSpawnerId } from '../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function board(race: 'vampires' | 'zombies', picks: Array<'racial' | 'hp'>): World {
  const w = makeWorld(0x189f);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT') * 100;
  w.draft = null;
  w.creatures.clear();
  const pl = w.players.get(P0)!;
  pl.raceId = race;
  pl.draftPicks = [...picks];
  return w;
}

function put(w: World, type: CreatureType, owner: typeof P0, x: number, y = 540): Creature {
  const c = makeCreature(getCreatureConfig(type), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: owner, pos: { x, y }, targetPos: { x, y },
    spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(900 + w.creatures.size), clock: w,
  });
  c.state = 'SEEKING';
  w.creatures.set(c.id, c);
  return c;
}

const SWING = 12;

describe('⭐ S189 R190-I — every heal site writes the counter, exactly what landed', () => {
  it('a fresh creature carries no counter (absent = 0; no factory change)', () => {
    const w = board('vampires', ['racial']);
    expect(put(w, 't3Warband', P0, 500).healedFifths).toBeUndefined();
  });

  it('1 · BLOOD DEBT outside a batch: the counter rises by the heal', () => {
    const w = board('vampires', ['racial']);
    const mine = put(w, 't3Warband', P0, 500);
    mine.ehp -= 20;
    applyLifesteal(w, { kind: 'creature', id: mine.id }, SWING);
    expect(mine.healedFifths).toBe(lifestealFifths(SWING, BLOOD_DEBT_LIFESTEAL_PCT));
  });

  it('2 · BLOOD DEBT inside the strike batch: the counter rises by the SUM that landed', () => {
    const w = board('vampires', ['racial']);
    const mine = put(w, 't3Warband', P0, 500);
    const theirs = put(w, 't3Warband', P1, 520);
    w.pendingLifestealFifths = new Map();
    damageEntity(w, { kind: 'creature', id: mine.id }, SWING, 'creature', { kind: 'creature', id: theirs.id });
    damageEntity(w, { kind: 'creature', id: theirs.id }, SWING, 'creature', { kind: 'creature', id: mine.id });
    damageEntity(w, { kind: 'creature', id: theirs.id }, SWING, 'creature', { kind: 'creature', id: mine.id });
    const before = mine.ehp;
    applyPendingLifesteal(w);
    w.pendingLifestealFifths = null;
    expect(mine.healedFifths).toBe(2 * lifestealFifths(SWING, BLOOD_DEBT_LIFESTEAL_PCT));
    expect(mine.healedFifths).toBe(mine.ehp - before);
  });

  it('   … and under the cap it counts only what LANDED, not what was asked', () => {
    const w = board('vampires', ['racial']);
    const mine = put(w, 't3Warband', P0, 500);
    mine.ehp = creatureMaxEhp(mine) - 1; // room for one fifth
    applyLifesteal(w, { kind: 'creature', id: mine.id }, 100); // asks for 20
    expect(mine.healedFifths).toBe(1);
  });

  it('3 · Vlad\'s LIFE SAP: the counter rises by his 20 %', () => {
    const w = board('vampires', []);
    const vlad = put(w, 't9BossVampires', P0, 500);
    const max = creatureMaxEhp(vlad);
    vlad.ehp = Math.floor(max * 0.3); // under the 40 % trigger
    const before = vlad.ehp;
    runVladLifeSap(w, new Map());
    expect(vlad.ehp - before).toBe(Math.floor((max * VLAD_LIFE_SAP_HEAL_PCT) / 100));
    expect(vlad.healedFifths).toBe(vlad.ehp - before);
  });

  it('4 · CORPSE EATER: the counter rises by what each bite healed', () => {
    const w = board('zombies', ['hp', 'racial']);
    const boss = put(w, 't9BossZombies', P0, 960);
    boss.ehp = Math.floor((creatureMaxEhp(boss) * CORPSE_EATER_TRIGGER_PCT) / 100);
    const food = put(w, 't9BossVampires', P1, 980); // big enough to survive a bite
    food.ehp = 1000;
    const before = boss.ehp;
    const bite = attackFifths(getCreatureConfig('t9BossZombies').atk, getCreatureConfig('t9BossZombies').pen);
    for (let i = 0; i <= getCreatureConfig('t9BossZombies').attackFireTick; i++) {
      w.pendingCreatureDeaths = new Set();
      runCorpseEater(w);
      for (const id of w.pendingCreatureDeaths) w.creatures.delete(id);
      w.pendingCreatureDeaths = null;
      w.tick++;
    }
    expect(boss.ehp - before, 'fixture: one bite healed').toBe(bite);
    expect(boss.healedFifths).toBe(bite);
  });

  it('noteCreatureHeal never counts a pool that did not rise', () => {
    const w = board('vampires', []);
    const c = put(w, 't3Warband', P0, 500);
    const before = c.ehp;
    c.ehp -= 5;
    noteCreatureHeal(c, before);
    expect(c.healedFifths).toBeUndefined();
  });
});

describe('⭐ S189 R190-I — the counter on the wire', () => {
  const wireCreature = (w: World, id: Creature['id']): Record<string, unknown> =>
    (netSnapshot(w).creatures ?? []).find((c) => (c as { id: unknown }).id === id) as unknown as Record<string, unknown>;

  it('absent while zero — a never-healed creature is byte-identical to every prior snapshot', () => {
    const w = board('vampires', ['racial']);
    const c = put(w, 't3Warband', P0, 500);
    expect('healedFifths' in wireCreature(w, c.id)).toBe(false);
  });

  it('carried once set, and a joiner reads the same number', () => {
    const w = board('vampires', ['racial']);
    const c = put(w, 't3Warband', P0, 500);
    c.ehp -= 30;
    applyLifesteal(w, { kind: 'creature', id: c.id }, SWING);
    const snap = netSnapshot(w);
    const client = makeWorld(0);
    client.isHost = false;
    applyNetSnapshot(snap, client);
    expect(client.creatures.get(c.id)?.healedFifths).toBe(c.healedFifths);
  });

  it('validated, never trusted: a junk value off the wire reads as no counter', () => {
    const w = board('vampires', ['racial']);
    const c = put(w, 't3Warband', P0, 500);
    const snap = netSnapshot(w);
    const wc = (snap.creatures ?? []).find((x) => (x as { id: unknown }).id === c.id) as unknown as Record<string, unknown>;
    wc.healedFifths = -4;
    const client = makeWorld(0);
    client.isHost = false;
    applyNetSnapshot(snap, client);
    expect(client.creatures.get(c.id)?.healedFifths).toBeUndefined();
  });
});
