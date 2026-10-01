/**
 * SPARK — S192 (owner T12) — **CORPSE EATER VISIBLY HEALS.**
 *
 * > *"zombie boss … corpse eating … he's not healing. It should show that he's healing over time …
 * > every tick of healing should show above him."* — owner, S192
 *
 * Two sim changes, both pinned here (the render half — heals drawn straight above — is in
 * `render/damageNumbersHealAbove.test.ts`):
 *   (a) a feed bite skips the S156 P4 initiative coin (`creatureAttack.ts`) — measured S192: under
 *       retaliation every bite was a "mutual collision" and six of six were refused;
 *   (b) each landed bite's heal is BANKED (`Creature.corpseEaterHealBank`) and paid in six pulses ten
 *       ticks apart, each through `noteCreatureHeal` — one green number per pulse.
 */
import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch, type World } from '../world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { mulberry32 } from '../rng.ts';
import { asCreatureId, asPlayerId, type CreatureId, type PlayerId } from '../../types.ts';
import type { Controls } from '../../input/controls.ts';
import type { RaceId } from '../races.ts';
import type { DraftPick } from '../draft.ts';
import { makeCreature, creatureMaxEhp, type Creature, type CreatureType } from '../creatures/creature.ts';
import { applyCreatureAttack, winsInitiative } from '../creatures/creatureAttack.ts';
import { getCreatureConfig } from '../creatures/voltkin-config.ts';
import { attackFifths } from '../stats.ts';
import { snapshot, restore } from '../save.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import {
  CORPSE_EATER_HEAL_PULSES,
  CORPSE_EATER_HEAL_PULSE_TICKS,
  CORPSE_EATER_TICKS,
  CORPSE_EATER_TRIGGER_PCT,
  bankCorpseEaterHeal,
  payCorpseEaterHealPulse,
  runCorpseEater,
} from './corpseEater.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const BOSS: CreatureType = 't9BossZombies';
const CX = 960;
const CY = 540;
const BOSS_CFG = getCreatureConfig(BOSS);
const BITE = attackFifths(BOSS_CFG.atk, BOSS_CFG.pen);

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
    controls: stubControls, botManager: null,
    gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function setSeat(w: World, seat: PlayerId, race: RaceId, picks: DraftPick[]): void {
  const p = w.players.get(seat)!;
  (p as { raceId: RaceId }).raceId = race;
  p.draftPicks.splice(0, p.draftPicks.length, ...picks);
}

function make1v1(picks: DraftPick[] = ['hp', 'racial']): World {
  const w = makeWorld(0x5192);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.draft = null;
  w.creatures.clear();
  setSeat(w, P0, 'zombies', picks);
  setSeat(w, P1, 'orcs', []);
  return w;
}

function put(w: World, type: CreatureType, owner: PlayerId, x: number, y = CY): Creature {
  const id = asCreatureId(w.nextCreatureId++);
  const c = makeCreature(getCreatureConfig(type), {
    id, ownerPlayerId: owner, pos: { x, y }, targetPos: { x, y }, spawnedAtTick: w.tick,
    sourceSpawnerId: null,
  });
  c.state = 'SEEKING';
  w.creatures.set(id, c);
  return c;
}

function bossAtTrigger(w: World): Creature {
  const b = put(w, BOSS, P0, CX);
  b.ehp = Math.floor((creatureMaxEhp(b) * CORPSE_EATER_TRIGGER_PCT) / 100);
  return b;
}

/** One racial-slot call inside an emulated strike batch, then advance the clock. */
function slotTick(w: World): void {
  w.pendingCreatureDeaths = new Set();
  runCorpseEater(w);
  for (const id of w.pendingCreatureDeaths) w.creatures.delete(id);
  w.pendingCreatureDeaths = null;
  w.tick++;
}

describe('S192 T12 — the pulse arithmetic (MINE: six pulses, ten ticks apart)', () => {
  it('⭐ one pulse schedule is exactly one of his bite cycles', () => {
    expect(CORPSE_EATER_HEAL_PULSES * CORPSE_EATER_HEAL_PULSE_TICKS).toBe(BOSS_CFG.attackCadenceTicks);
    // above the joiner's 10 Hz snapshot spacing, so two pulses never merge into one number on a peer
    expect(CORPSE_EATER_HEAL_PULSE_TICKS).toBeGreaterThan(6);
  });

  it('⭐⭐ a 104 bite pays 17, 17, 17, 17, 18, 18 — integers that sum to EXACTLY the bite', () => {
    const w = make1v1();
    const b = put(w, BOSS, P0, CX);
    b.ehp = 10;
    bankCorpseEaterHeal(w, b, 104);
    const pays: number[] = [];
    for (let t = 0; t <= 70; t++) {
      const before = b.ehp;
      payCorpseEaterHealPulse(w, b);
      if (b.ehp !== before) pays.push(b.ehp - before);
      w.tick++;
    }
    expect(pays).toEqual([17, 17, 17, 17, 18, 18]);
    expect(pays.reduce((a, x) => a + x, 0)).toBe(104);
    expect(b.corpseEaterHealBank, 'paid off — the field is gone').toBeUndefined();
    expect(b.healedFifths, 'every pulse counted for the floater').toBe(104);
  });

  it('a bank smaller than six still sums exactly (zero pulses print nothing)', () => {
    for (const owed of [1, 5, 6, 7, 13, 105, 312]) {
      const w = make1v1();
      const b = put(w, BOSS, P0, CX);
      b.ehp = 10;
      bankCorpseEaterHeal(w, b, owed);
      for (let t = 0; t <= 70; t++) { payCorpseEaterHealPulse(w, b); w.tick++; }
      expect(b.ehp - 10, `owed ${owed}`).toBe(owed);
    }
  });

  it('⭐ a pulse never overheals — capped at his own max, and the bank still drains', () => {
    const w = make1v1();
    const b = put(w, BOSS, P0, CX);
    b.ehp = creatureMaxEhp(b) - 20;
    bankCorpseEaterHeal(w, b, 104);
    for (let t = 0; t <= 70; t++) { payCorpseEaterHealPulse(w, b); w.tick++; }
    expect(b.ehp).toBe(creatureMaxEhp(b));
    expect(b.corpseEaterHealBank).toBeUndefined();
    expect(b.healedFifths, 'only what landed is counted').toBe(20);
  });

  it('a second bite mid-schedule adds to the bank and restarts it — nothing is lost', () => {
    const w = make1v1();
    const b = put(w, BOSS, P0, CX);
    b.ehp = 10;
    bankCorpseEaterHeal(w, b, 104);
    for (let t = 0; t < 25; t++) { payCorpseEaterHealPulse(w, b); w.tick++; }
    bankCorpseEaterHeal(w, b, 104);
    for (let t = 0; t <= 70; t++) { payCorpseEaterHealPulse(w, b); w.tick++; }
    expect(b.ehp - 10).toBe(208);
  });

  it('negative: a bank whose schedule ran out unpaid (the FIGHT ended) is FORFEITED, never paid later', () => {
    const w = make1v1();
    const b = put(w, BOSS, P0, CX);
    b.ehp = 10;
    bankCorpseEaterHeal(w, b, 104);
    w.tick += 5400; // a whole BUILD later — this slot never ran
    payCorpseEaterHealPulse(w, b);
    expect(b.ehp).toBe(10);
    expect(b.corpseEaterHealBank).toBeUndefined();
  });

  it('negative: a corpse-in-waiting is paid nothing', () => {
    const w = make1v1();
    const b = put(w, BOSS, P0, CX);
    b.ehp = 10;
    bankCorpseEaterHeal(w, b, 104);
    w.pendingCreatureDeaths = new Set([b.id]);
    for (let t = 0; t <= 70; t++) { payCorpseEaterHealPulse(w, b); w.tick++; }
    expect(b.ehp).toBe(10);
  });
});

describe('S192 T12 — the bite is the same, the heal arrives in pulses (racial slot)', () => {
  it('⭐⭐ one bite → six green pulses across the next cycle, summing to the bite', () => {
    const w = make1v1();
    const b = bossAtTrigger(w);
    const food = put(w, 't9BossVampires', P1, CX + 20); // an enemy that survives a bite
    food.ehp = 1000;
    const pulses: { tick: number; amount: number }[] = [];
    const before = b.ehp;
    for (let i = 0; i < BOSS_CFG.attackFireTick + 61; i++) {
      const h = b.healedFifths ?? 0;
      const t = w.tick;
      slotTick(w);
      const d = (b.healedFifths ?? 0) - h;
      if (d > 0) pulses.push({ tick: t, amount: d });
    }
    expect(1000 - food.ehp, 'one bite landed').toBeGreaterThanOrEqual(BITE);
    const firstCycle = pulses.slice(0, CORPSE_EATER_HEAL_PULSES);
    expect(firstCycle.map((p) => p.amount)).toEqual([17, 17, 17, 17, 18, 18]);
    for (let i = 1; i < firstCycle.length; i++) {
      expect(firstCycle[i]!.tick - firstCycle[i - 1]!.tick).toBe(CORPSE_EATER_HEAL_PULSE_TICKS);
    }
    expect(b.ehp - before).toBeGreaterThanOrEqual(BITE);
  });
});

describe('S192 T12 — REACH: every feed bite lands, through the real host tick', () => {
  /**
   * The S192 research scene: the boss at 20 % holding `zombies.l5`, four enemy goblins at his feet
   * that fight him (so under retaliation every bite is a mutual collision). The goblins are made too
   * tough to die, so every cycle has food and the count of bites is the count of cycles.
   */
  function scene(): { w: World; boss: Creature; food: Creature[] } {
    const w = make1v1();
    const boss = bossAtTrigger(w);
    const food = [
      put(w, 'goblinMelee', P1, CX + 25, CY),
      put(w, 'goblinMelee', P1, CX - 25, CY),
      put(w, 'goblinMelee', P1, CX, CY + 25),
      put(w, 'goblinMelee', P1, CX, CY - 25),
    ];
    for (const g of food) {
      g.ehp = 1_000_000;
      g.targetCreatureId = boss.id; // they are fighting him
    }
    return { w, boss, food };
  }

  function run(w: World, boss: Creature, food: Creature[], ticks: number): { bites: number; mutual: number } {
    const d = deps();
    const st = makeHostTickState(w);
    const keep = new Set<CreatureId>([boss.id, ...food.map((f) => f.id)]);
    const pins = food.map((f) => ({ x: f.pos.x, y: f.pos.y }));
    let bites = 0;
    let mutual = 0;
    for (let t = 0; t < ticks; t++) {
      const before = food.map((f) => f.ehp);
      const targetingHim = food.map((f) => f.targetCreatureId === boss.id);
      runHostTick(w, d, st);
      for (const id of [...w.creatures.keys()]) if (!keep.has(id)) w.creatures.delete(id);
      food.forEach((f, i) => {
        const lost = before[i]! - f.ehp;
        if (lost >= BITE) { // a goblin swing on its own never takes a boss bite's worth
          bites++;
          if (targetingHim[i]) mutual++;
        }
        f.pos.x = pins[i]!.x; f.pos.y = pins[i]!.y; f.prevPos.x = pins[i]!.x; f.prevPos.y = pins[i]!.y;
      });
      boss.ehp = Math.min(boss.ehp, Math.floor(creatureMaxEhp(boss) / 2)); // never capped: every pulse lands
      if (boss.ehp < 1) boss.ehp = 1;
    }
    return { bites, mutual };
  }

  it('⭐⭐ eight bites in the eight-second window — one per cycle, mutual collisions included', () => {
    const { w, boss, food } = scene();
    const { bites, mutual } = run(w, boss, food, CORPSE_EATER_TICKS + 5);
    expect(boss.corpseEaterUntilTick, 'the feed armed through runHostTick').toBeDefined();
    expect(bites).toBe(CORPSE_EATER_TICKS / BOSS_CFG.attackCadenceTicks);
    expect(mutual, 'the bites the coin used to eat are in the count').toBeGreaterThan(0);
  });

  it('⭐ and each landed bite becomes six separate heal pulses on the creature', () => {
    const { w, boss, food } = scene();
    const d = deps();
    const st = makeHostTickState(w);
    const keep = new Set<CreatureId>([boss.id, ...food.map((f) => f.id)]);
    let pulseTicks = 0;
    for (let t = 0; t < CORPSE_EATER_TICKS + 70; t++) {
      const h = boss.healedFifths ?? 0;
      runHostTick(w, d, st);
      for (const id of [...w.creatures.keys()]) if (!keep.has(id)) w.creatures.delete(id);
      for (const f of food) f.ehp = 1_000_000;
      if ((boss.healedFifths ?? 0) > h) pulseTicks++;
      boss.ehp = Math.min(boss.ehp, Math.floor(creatureMaxEhp(boss) / 2));
    }
    expect(pulseTicks).toBe(8 * CORPSE_EATER_HEAL_PULSES);
  });
});

describe('S192 T12 — negative: the coin still decides an ordinary duel', () => {
  it('⭐ a zombie boss NOT feeding loses a mutual collision on a losing tick; feeding, he lands it', () => {
    const w = make1v1();
    const boss = put(w, BOSS, P0, CX);
    const foe = put(w, 'goblinMelee', P1, CX + 20);
    foe.ehp = 1000;
    boss.state = 'ATTACKING';
    boss.targetCreatureId = foe.id;
    foe.targetCreatureId = boss.id;
    let t = 0;
    while (winsInitiative(boss.id, foe.id, t)) t++;
    w.tick = t;
    applyCreatureAttack(w, { type: 'CREATURE_ATTACK', creatureId: boss.id, bondId: null, targetCreatureId: foe.id });
    expect(foe.ehp, 'not feeding: the coin refused his swing').toBe(1000);
    boss.corpseEaterUntilTick = t + 100; // feeding now
    applyCreatureAttack(w, { type: 'CREATURE_ATTACK', creatureId: boss.id, bondId: null, targetCreatureId: foe.id });
    expect(foe.ehp, 'feeding: the bite lands on the same losing tick').toBe(1000 - BITE);
  });
});

describe('S192 T12 — the bank is sim state: wire, hash, restore', () => {
  it('⭐⭐ survives a save/load round-trip, copied rather than aliased; absent when nothing is owed', () => {
    const w = make1v1();
    const b = put(w, BOSS, P0, CX);
    const plain = put(w, BOSS, P1, CX + 300);
    bankCorpseEaterHeal(w, b, 104);
    const json = JSON.stringify(snapshot(w));
    expect(json.match(/corpseEaterHealBank/g)?.length, 'only the boss that is owed carries it').toBe(1);
    const w2 = makeWorld(1);
    restore(JSON.parse(json), w2);
    const b2 = w2.creatures.get(b.id)!;
    expect(b2.corpseEaterHealBank).toEqual(b.corpseEaterHealBank);
    expect(b2.corpseEaterHealBank).not.toBe(b.corpseEaterHealBank);
    expect(w2.creatures.get(plain.id)!.corpseEaterHealBank).toBeUndefined();
  });

  it('⭐ it CONTRIBUTES to the wide hash — owed and schedule independently', () => {
    const w = make1v1();
    const b = put(w, BOSS, P0, CX);
    const h0 = hashWorldStateFull(w);
    bankCorpseEaterHeal(w, b, 104);
    const h1 = hashWorldStateFull(w);
    expect(h1).not.toBe(h0);
    b.corpseEaterHealBank = { fifths: 103, untilTick: b.corpseEaterHealBank!.untilTick };
    expect(hashWorldStateFull(w)).not.toBe(h1);
    const h2 = hashWorldStateFull(w);
    b.corpseEaterHealBank = { fifths: 103, untilTick: b.corpseEaterHealBank.untilTick + 1 };
    expect(hashWorldStateFull(w)).not.toBe(h2);
  });

  it('⭐⭐ snapshot → restore MID-PAYOUT continues pulse for pulse (the successor / worker path)', () => {
    const w = make1v1();
    const b = bossAtTrigger(w);
    // At its own max (a restore clamps a pool above it), and big enough to outlast two bites.
    put(w, 't9BossOrcs', P1, CX + 20);
    for (let i = 0; i < BOSS_CFG.attackFireTick + 25; i++) slotTick(w);
    expect(b.corpseEaterHealBank, 'mid-payout').toBeDefined();
    const w2 = makeWorld(1);
    restore(JSON.parse(JSON.stringify(snapshot(w))), w2);
    for (let i = 0; i < 90; i++) {
      slotTick(w);
      slotTick(w2);
      expect(hashWorldStateFull(w2), `tick ${w.tick}`).toBe(hashWorldStateFull(w));
    }
    expect(w2.creatures.get(b.id)!.ehp).toBe(b.ehp);
  });
});
