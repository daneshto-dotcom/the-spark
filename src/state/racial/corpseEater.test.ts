/**
 * SPARK — S188 P7 — CORPSE EATER (zombies level 5): the arithmetic, the rules, the wire, and that
 * it REACHES the boss through the real host tick.
 *
 * Owner: *"once he reaches 20% HP, he starts eating everyone around him … the same damage as he would
 * by attacking, but he has 100% life steal … for like eight seconds … he moves only in a tiny radius
 * … enemy units first, obviously. But then if there's no enemy units, he eats his own units and heals."*
 */
import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch, type World } from '../world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { mulberry32 } from '../rng.ts';
import { asCreatureId, asPlayerId, type CreatureId, type PlayerId, type Vec2 } from '../../types.ts';
import type { Controls } from '../../input/controls.ts';
import type { RaceId } from '../races.ts';
import type { DraftPick } from '../draft.ts';
import {
  makeCreature,
  isCorpseEaterFeeding,
  applyStun,
  creatureMaxEhp,
  type Creature,
  type CreatureType,
} from '../creatures/creature.ts';
import { getCreatureConfig } from '../creatures/voltkin-config.ts';
import { attackFifths } from '../stats.ts';
import { snapshot, restore } from '../save.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import { KRAKEN_SONAR_KNOCKBACK, KRAKEN_SONAR_STUN_TICKS, PHASE_DURATION_TICKS, PHYSICS_HZ, PHYSICS_SUBSTEPS } from '../../constants.ts';
import {
  CORPSE_EATER_HEAL_PCT,
  CORPSE_EATER_LEASH_RADIUS,
  CORPSE_EATER_TICKS,
  CORPSE_EATER_TRIGGER_PCT,
  runCorpseEater,
  corpseEaterOwnStepPx,
} from './corpseEater.ts';
import { RACIAL_PERK_BUILT, racialPerkFor } from '../racialPerks.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const BOSS: CreatureType = 't9BossZombies';
const CX = 960;
const CY = 540;

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

/** A 1v1 in FIGHT with the phase edge far away, an empty board, and seat 0 = zombies holding L5. */
function make1v1(picks: DraftPick[] = ['hp', 'racial'], race: RaceId = 'zombies'): World {
  const w = makeWorld(0x5188);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.draft = null;
  w.creatures.clear();
  setSeat(w, P0, race, picks);
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

/** The boss at exactly his trigger line (20 % of his own max). */
function bossAtTrigger(w: World, x = CX): Creature {
  const b = put(w, BOSS, P0, x);
  b.ehp = Math.floor((creatureMaxEhp(b) * CORPSE_EATER_TRIGGER_PCT) / 100);
  return b;
}

/** One slot call inside an emulated strike batch, then advance the clock — the arithmetic harness. */
function slotTick(w: World): void {
  w.pendingCreatureDeaths = new Set();
  runCorpseEater(w);
  for (const id of w.pendingCreatureDeaths) w.creatures.delete(id);
  w.pendingCreatureDeaths = null;
  w.tick++;
}

const BITE = attackFifths(getCreatureConfig(BOSS).atk, getCreatureConfig(BOSS).pen);
const FIRST_BITE_TICK = getCreatureConfig(BOSS).attackFireTick; // feed-clock tick of the first bite

describe('S188 CORPSE EATER — the constants are his', () => {
  it('⭐ 20 % trigger, 8 s = 480 ticks, 100 % life steal; the leash is MINE', () => {
    expect(CORPSE_EATER_TRIGGER_PCT).toBe(20);
    expect(CORPSE_EATER_TICKS).toBe(8 * PHYSICS_HZ);
    expect(CORPSE_EATER_TICKS).toBe(480);
    expect(CORPSE_EATER_HEAL_PCT).toBe(100);
    expect(CORPSE_EATER_LEASH_RADIUS).toBeGreaterThan(0);
  });

  it('⚠ a feed window can never straddle into the NEXT fight — BUILD is longer than the window', () => {
    // If it could, the leash would yank a boss that `recallArmies` had just sent home back across
    // the board to where he sat down in the previous fight.
    expect(PHASE_DURATION_TICKS).toBeGreaterThan(CORPSE_EATER_TICKS);
  });

  it('⭐ zombies.l5 is BUILT, so the draft offers it at level 5', () => {
    expect(RACIAL_PERK_BUILT['zombies.l5']).toBe(true);
    expect(racialPerkFor('zombies', 1)).toBe('zombies.l5');
  });
});

describe('S188 CORPSE EATER — the trigger and the once-per-life latch', () => {
  it('⭐ fires at exactly 20 %, not one fifth above it; stamps tick + 480 and the anchor', () => {
    const w = make1v1();
    const b = put(w, BOSS, P0, CX);
    const max = creatureMaxEhp(b);
    b.ehp = Math.floor((max * CORPSE_EATER_TRIGGER_PCT) / 100) + 1;
    slotTick(w);
    expect(b.corpseEaterUntilTick, 'one fifth above the line: not yet').toBeUndefined();
    b.ehp -= 1;
    const t = w.tick;
    slotTick(w);
    expect(b.corpseEaterUntilTick).toBe(t + CORPSE_EATER_TICKS);
    expect(b.corpseEaterAnchor).toEqual({ x: CX, y: CY });
  });

  it('⭐⭐ ONCE PER LIFE — after the window, dropping under the line again does not re-arm it', () => {
    const w = make1v1();
    const b = bossAtTrigger(w);
    slotTick(w);
    const first = b.corpseEaterUntilTick!;
    w.tick = first + 100;
    b.ehp = 1;
    slotTick(w);
    expect(b.corpseEaterUntilTick, 'the stamp is the latch and is never cleared').toBe(first);
    expect(isCorpseEaterFeeding(b, w.tick)).toBe(false);
  });

  it('⭐ the window is exactly 480 ticks (strictly <), and the last tick releases him', () => {
    const w = make1v1();
    const b = bossAtTrigger(w);
    const t0 = w.tick;
    slotTick(w);
    expect(isCorpseEaterFeeding(b, t0)).toBe(true);
    expect(isCorpseEaterFeeding(b, t0 + CORPSE_EATER_TICKS - 1)).toBe(true);
    expect(isCorpseEaterFeeding(b, t0 + CORPSE_EATER_TICKS)).toBe(false);
    // An own unit at his feet keeps him ATTACKING until the last feeding tick releases him.
    put(w, 't3Scarab', P0, CX + 20).ehp = 1_000_000;
    while (w.tick < t0 + CORPSE_EATER_TICKS - 1) slotTick(w);
    expect(b.state).toBe('ATTACKING');
    slotTick(w); // the last feeding tick
    expect(b.state, 'handed back to the ordinary pipeline').toBe('SEEKING');
    expect(b.targetCreatureId, 'with no own unit left in his sights').toBeNull();
  });

  it('negative: a zombie seat WITHOUT the level-5 pick never feeds', () => {
    for (const picks of [[], ['racial'], ['racial', 'def']] as DraftPick[][]) {
      const w = make1v1(picks);
      const b = bossAtTrigger(w);
      slotTick(w);
      expect(b.corpseEaterUntilTick, JSON.stringify(picks)).toBeUndefined();
    }
  });

  it('negative: ANOTHER race with the racial pick never feeds — even with a zombie boss', () => {
    const w = make1v1(['hp', 'racial'], 'orcs');
    const b = bossAtTrigger(w);
    slotTick(w);
    expect(b.corpseEaterUntilTick).toBeUndefined();
  });

  it('negative: only the ZOMBIE boss has the skill', () => {
    const w = make1v1();
    const v = put(w, 't9BossVampires', P0, CX);
    v.ehp = 1;
    slotTick(w);
    expect(v.corpseEaterUntilTick).toBeUndefined();
  });
});

describe('S188 CORPSE EATER — heal = damage, capped at max', () => {
  it('⭐⭐ every bite heals EXACTLY what it took, and uses his ordinary strike', () => {
    const w = make1v1();
    const b = bossAtTrigger(w);
    const own = put(w, 't9BossVampires', P1, CX + 20); // an enemy big enough to survive one bite
    own.ehp = 1000;
    const bossBefore = b.ehp;
    for (let i = 0; i <= FIRST_BITE_TICK; i++) slotTick(w);
    const lost = 1000 - own.ehp;
    expect(lost, 'one bite, the ordinary attackFifths(atk, pen)').toBe(BITE);
    expect(b.ehp - bossBefore, 'healed exactly what the bite took').toBe(lost);
  });

  it('⭐ an overkill bite still heals the WHOLE hit — "for as much as he attacks"', () => {
    const w = make1v1();
    const b = bossAtTrigger(w);
    put(w, 't3Scarab', P0, CX + 20); // 28 fifths, far under one bite
    const before = b.ehp;
    for (let i = 0; i <= FIRST_BITE_TICK; i++) slotTick(w);
    expect(b.ehp - before).toBe(BITE);
  });

  it('⭐ the heal is capped at his OWN max', () => {
    const w = make1v1();
    const b = bossAtTrigger(w);
    put(w, 't3Scarab', P0, CX + 20);
    slotTick(w); // arm the feed at 20 %
    b.ehp = creatureMaxEhp(b) - 3;
    for (let i = 1; i <= FIRST_BITE_TICK; i++) slotTick(w);
    expect(b.ehp).toBe(creatureMaxEhp(b));
  });

  it('⭐ he bites on HIS cadence — one bite per attackCadenceTicks across the window', () => {
    const w = make1v1();
    bossAtTrigger(w);
    // His OWN unit, so no retaliation and no initiative roll — the cadence alone is measured.
    const food = put(w, 't3Scarab', P0, CX + 20);
    food.ehp = 1_000_000;
    const t0 = w.tick;
    while (w.tick < t0 + CORPSE_EATER_TICKS) slotTick(w);
    const bites = (1_000_000 - food.ehp) / BITE;
    expect(bites).toBe(CORPSE_EATER_TICKS / getCreatureConfig(BOSS).attackCadenceTicks);
  });
});

describe('S188 CORPSE EATER — enemy units first, then his own', () => {
  it('⭐⭐ with an enemy AND an own unit in reach, the enemy is eaten even if the own unit is nearer', () => {
    const w = make1v1();
    bossAtTrigger(w);
    const mine = put(w, 't3Scarab', P0, CX + 10);
    const theirs = put(w, 't3Scarab', P1, CX + 30);
    for (let i = 0; i <= FIRST_BITE_TICK; i++) slotTick(w);
    expect(w.creatures.has(theirs.id), 'the enemy is eaten').toBe(false);
    expect(w.creatures.get(mine.id)?.ehp, 'his own unit is untouched').toBe(creatureMaxEhp(mine));
  });

  it('⭐ with no enemy in reach, he eats his OWN unit — and never another boss', () => {
    const w = make1v1();
    bossAtTrigger(w);
    const ownBoss = put(w, 't9BossVampires', P0, CX + 10);
    const mine = put(w, 't3Scarab', P0, CX + 25);
    put(w, 't3Scarab', P1, CX + 400); // an enemy far out of reach does not count
    for (let i = 0; i <= FIRST_BITE_TICK; i++) slotTick(w);
    expect(w.creatures.has(mine.id), 'his own unit is eaten').toBe(false);
    expect(ownBoss.ehp, 'a boss is not food').toBe(creatureMaxEhp(ownBoss));
  });

  it('with nothing in reach he eats nothing and heals nothing', () => {
    const w = make1v1();
    const b = bossAtTrigger(w);
    const far = put(w, 't3Scarab', P0, CX + 300);
    const before = b.ehp;
    for (let i = 0; i <= FIRST_BITE_TICK + 60; i++) slotTick(w);
    expect(b.ehp).toBe(before);
    expect(far.ehp).toBe(creatureMaxEhp(far));
  });
});

describe('S188 CORPSE EATER — the stun gate (R152)', () => {
  it('⭐ a STUNNED boss under the line does not start feeding — and starts when it wears off', () => {
    const w = make1v1();
    const b = bossAtTrigger(w);
    applyStun(b, w.tick + 5);
    for (let i = 0; i < 5; i++) slotTick(w);
    expect(b.corpseEaterUntilTick).toBeUndefined();
    slotTick(w);
    expect(b.corpseEaterUntilTick).toBeDefined();
  });

  it('⭐⭐ a boss stunned mid-feed takes no bite, heals nothing and is not leashed', () => {
    const w = make1v1();
    const b = bossAtTrigger(w);
    const food = put(w, 't3Scarab', P0, CX + 20);
    slotTick(w);
    applyStun(b, w.tick + 10_000);
    b.pos.x = CX + CORPSE_EATER_LEASH_RADIUS + 20; // knocked out of the leash while stunned
    const before = b.ehp;
    for (let i = 0; i <= FIRST_BITE_TICK + 60; i++) slotTick(w);
    expect(food.ehp, 'no bite').toBe(creatureMaxEhp(food));
    expect(b.ehp, 'no heal').toBe(before);
    expect(b.pos.x, 'a stunned boss is not moved by the leash').toBe(CX + CORPSE_EATER_LEASH_RADIUS + 20);
  });
});

describe('S188 CORPSE EATER — REACHES the boss through the real host tick', () => {
  function runFor(w: World, ticks: number, each?: (w: World) => void): void {
    const d = deps();
    const st = makeHostTickState(w);
    for (let t = 0; t < ticks; t++) {
      runHostTick(w, d, st);
      each?.(w);
    }
  }
  /** Castle-emitted soldiers are not part of these scenes; keep the board to what the test put there. */
  function keepOnly(ids: Set<CreatureId>): (w: World) => void {
    return (w) => {
      for (const id of [...w.creatures.keys()]) if (!ids.has(id)) w.creatures.delete(id);
    };
  }

  it('⭐⭐ holding the perk: he sits down, eats his own units and heals — the full window', () => {
    const w = make1v1();
    const b = bossAtTrigger(w);
    const a = put(w, 't3Scarab', P0, CX + 20);
    const c = put(w, 't3Scarab', P0, CX - 20);
    const before = b.ehp;
    // Food that stays where it was put — his own units would otherwise march off toward the enemy.
    const scene = (ww: World): void => {
      keepOnly(new Set([b.id, a.id, c.id]))(ww);
      for (const [f, x] of [[a, CX + 20], [c, CX - 20]] as const) {
        f.pos.x = x; f.pos.y = CY; f.prevPos.x = x; f.prevPos.y = CY;
      }
    };
    runFor(w, 5, scene);
    expect(b.corpseEaterUntilTick, 'armed through runHostTick → racialTick slot').toBeDefined();
    runFor(w, CORPSE_EATER_TICKS, scene);
    expect(w.creatures.has(a.id) || w.creatures.has(c.id), 'both own units eaten').toBe(false);
    expect(b.ehp, 'two bites of heal').toBe(Math.min(creatureMaxEhp(b), before + 2 * BITE));
  });

  it('control: WITHOUT the perk, the same scene leaves his own units alone and heals nothing', () => {
    const w = make1v1(['hp', 'def']);
    const b = bossAtTrigger(w);
    const a = put(w, 't3Scarab', P0, CX + 20);
    const before = b.ehp;
    runFor(w, CORPSE_EATER_TICKS, keepOnly(new Set([b.id, a.id])));
    expect(b.corpseEaterUntilTick).toBeUndefined();
    expect(w.creatures.get(a.id)?.ehp).toBe(creatureMaxEhp(a));
    expect(b.ehp).toBe(before);
  });

  it('⭐⭐ THE LEASH — chasing an enemy at the edge of his reach, he never leaves the tiny radius', () => {
    const w = make1v1();
    const b = bossAtTrigger(w);
    // Inside leash + attack range of the anchor, outside his arm: he must shuffle, not walk off.
    const e = put(w, 't3Scarab', P1, CX + CORPSE_EATER_LEASH_RADIUS + 30);
    e.ehp = 1_000_000;
    const far = put(w, 't3Scarab', P1, CX - 400);
    let worst = 0;
    let moved = 0;
    runFor(w, CORPSE_EATER_TICKS - 5, (ww) => {
      keepOnly(new Set([b.id, e.id, far.id]))(ww);
      // pin the prey so the scene is about the boss's legs, not the scarab's
      e.pos.x = CX + CORPSE_EATER_LEASH_RADIUS + 30; e.pos.y = CY; e.prevPos.x = e.pos.x; e.prevPos.y = CY;
      const a = b.corpseEaterAnchor;
      if (a === undefined) return;
      const d = Math.hypot(b.pos.x - a.x, b.pos.y - a.y);
      worst = Math.max(worst, d);
      moved = Math.max(moved, b.pos.x - a.x);
    });
    expect(moved, 'he does move toward it').toBeGreaterThan(CORPSE_EATER_LEASH_RADIUS / 2);
    expect(worst, 'and never past the leash').toBeLessThanOrEqual(CORPSE_EATER_LEASH_RADIUS + 1e-9);
    expect(e.ehp, 'and bites it from the leash edge').toBeLessThan(1_000_000);
  });
});

describe('S188 CORPSE EATER — the wire and the wide hash', () => {
  it('⭐⭐ both fields survive a save/load round-trip, copied rather than aliased', () => {
    const w = make1v1();
    const b = bossAtTrigger(w);
    slotTick(w);
    const fresh = makeWorld(0);
    restore(snapshot(w), fresh);
    const r = fresh.creatures.get(b.id)!;
    expect(r.corpseEaterUntilTick).toBe(b.corpseEaterUntilTick);
    expect(r.corpseEaterAnchor).toEqual(b.corpseEaterAnchor);
    expect(r.corpseEaterAnchor).not.toBe(b.corpseEaterAnchor);
    expect(hashWorldStateFull(fresh), 'host and a restored mirror agree').toBe(hashWorldStateFull(w));
  });

  it('⭐ an unfed creature carries neither field on the wire (additive-optional)', () => {
    const w = make1v1();
    put(w, BOSS, P0, CX);
    const json = JSON.stringify(snapshot(w));
    expect(json.includes('corpseEater')).toBe(false);
  });

  it('⭐ each field CONTRIBUTES to the wide hash — deadline and anchor independently', () => {
    const w = make1v1();
    const b = put(w, BOSS, P0, CX);
    const h0 = hashWorldStateFull(w);
    b.corpseEaterUntilTick = 1000;
    const h1 = hashWorldStateFull(w);
    expect(h1).not.toBe(h0);
    b.corpseEaterUntilTick = 1001;
    expect(hashWorldStateFull(w)).not.toBe(h1);
    b.corpseEaterUntilTick = 1000;
    b.corpseEaterAnchor = { x: 1, y: 2 };
    const h2 = hashWorldStateFull(w);
    expect(h2).not.toBe(h1);
    b.corpseEaterAnchor = { x: 1, y: 3 };
    expect(hashWorldStateFull(w)).not.toBe(h2);
  });
});

describe('S188 CORPSE EATER — audit F1: a knocked-back boss is RE-ANCHORED, never snapped back', () => {
  /** The Kraken's own shove and stun, applied to a feeding boss (bossSkillsKraken.ts). */
  function sonar(b: Creature, w: World): void {
    applyStun(b, w.tick + KRAKEN_SONAR_STUN_TICKS);
    b.prevPos.x -= KRAKEN_SONAR_KNOCKBACK; // outward along +x, exactly the sonar's prevPos shove
  }
  function runScene(knock: boolean): {
    jumps: number[]; edge: { jump: number; slide: number } | null; b: Creature; anchorAtStun: Vec2 | undefined; w: World;
  } {
    const w = make1v1();
    const b = bossAtTrigger(w);
    const d = deps();
    const st = makeHostTickState(w);
    const tick = (): void => {
      runHostTick(w, d, st);
      for (const id of [...w.creatures.keys()]) if (id !== b.id) w.creatures.delete(id);
    };
    for (let i = 0; i < 5; i++) tick();
    expect(isCorpseEaterFeeding(b, w.tick), 'feeding before the shove').toBe(true);
    const anchorAtStun = b.corpseEaterAnchor === undefined ? undefined : { ...b.corpseEaterAnchor };
    if (knock) sonar(b, w);
    const stunEnds = b.stunnedUntilTick ?? w.tick;
    const jumps: number[] = [];
    let edge: { jump: number; slide: number } | null = null;
    while (isCorpseEaterFeeding(b, w.tick + 1)) {
      const before = { x: b.pos.x, y: b.pos.y };
      // The most the Kraken's slide can move him this tick: his velocity now, over every substep.
      const slide = Math.hypot(b.pos.x - b.prevPos.x, b.pos.y - b.prevPos.y) * PHYSICS_SUBSTEPS;
      tick();
      const jump = Math.hypot(b.pos.x - before.x, b.pos.y - before.y);
      // ⚠ The FIRST acting tick (w.tick === stunEnds) is the one the old clamp snapped him on. Its
      // physics still ran stunned (the slide), so it is bounded by the slide, not by his own step.
      if (w.tick === stunEnds) edge = { jump, slide };
      else if (w.tick > stunEnds) jumps.push(jump);
    }
    return { jumps, edge, b, anchorAtStun, w };
  }

  it('⭐⭐ after the stun ends he moves no more than his own speed per tick — no ~860 px snap', () => {
    const { jumps, edge, b, anchorAtStun } = runScene(true);
    const own = corpseEaterOwnStepPx(b);
    expect(edge, 'the stun ended inside the window').not.toBeNull();
    expect(edge!.jump, 'the first acting tick moves no further than the slide carried him — no snap back')
      .toBeLessThanOrEqual(edge!.slide + own + 1e-6);
    expect(jumps.length).toBeGreaterThan(100);
    expect(Math.max(...jumps), `own step ${own.toFixed(2)} px/tick`).toBeLessThanOrEqual(own + 1e-6);
    // He really was flung — the anchor moved to where he landed, far from where he first sat down.
    const a = b.corpseEaterAnchor!;
    expect(Math.hypot(a.x - anchorAtStun!.x, a.y - anchorAtStun!.y)).toBeGreaterThan(CORPSE_EATER_LEASH_RADIUS * 3);
    expect(Math.hypot(b.pos.x - a.x, b.pos.y - a.y), 'and he stays leashed to the NEW anchor')
      .toBeLessThanOrEqual(CORPSE_EATER_LEASH_RADIUS + 1e-9);
  });

  it('⭐ his own step bound is small — the backstop cannot mistake a real shove for a shuffle', () => {
    const w = make1v1();
    const b = bossAtTrigger(w);
    expect(corpseEaterOwnStepPx(b)).toBeGreaterThan(0.5);
    expect(corpseEaterOwnStepPx(b)).toBeLessThan(5);
  });

  it('control: WITHOUT a shove the anchor never moves — ordinary feeding stays inside 60 px of it', () => {
    const { b, anchorAtStun } = runScene(false);
    expect(b.corpseEaterAnchor).toEqual(anchorAtStun);
    const a = b.corpseEaterAnchor!;
    expect(Math.hypot(b.pos.x - a.x, b.pos.y - a.y)).toBeLessThanOrEqual(CORPSE_EATER_LEASH_RADIUS + 1e-9);
  });
});

describe('S188 CORPSE EATER — audit F5: a window that straddles the FIGHT→BUILD whistle', () => {
  it('⭐⭐ is CUT SHORT: he is recalled home, released, and bites nothing in BUILD (real runHostTick)', () => {
    const w = make1v1();
    const b = bossAtTrigger(w);
    const food = put(w, 't3Scarab', P0, CX + 20);
    food.ehp = 1_000_000;
    const d = deps();
    const st = makeHostTickState(w);
    // Food pinned at his feet WHEREVER he is, so any bite the sim lands in BUILD would show.
    const tick = (): void => {
      runHostTick(w, d, st);
      for (const id of [...w.creatures.keys()]) if (id !== b.id && id !== food.id) w.creatures.delete(id);
      food.pos.x = b.pos.x + 20; food.pos.y = b.pos.y; food.prevPos.x = food.pos.x; food.prevPos.y = food.pos.y;
    };
    for (let i = 0; i < 5; i++) tick();
    expect(isCorpseEaterFeeding(b, w.tick)).toBe(true);
    const sat = { ...b.corpseEaterAnchor! };
    w.phaseEndsAtTick = w.tick + 60; // the whistle blows mid-feed
    while (w.matchPhase === 'FIGHT') tick();
    expect(isCorpseEaterFeeding(b, w.tick), 'the scenario is real: the window straddles the edge').toBe(true);
    expect(Math.hypot(b.pos.x - sat.x, b.pos.y - sat.y), 'recallArmies sent him home').toBeGreaterThan(CORPSE_EATER_LEASH_RADIUS);
    expect(b.state, 'released').not.toBe('ATTACKING');
    const [foodAtEdge, bossAtEdge] = [food.ehp, b.ehp];
    const home = { x: b.pos.x, y: b.pos.y };
    while (isCorpseEaterFeeding(b, w.tick)) tick();
    expect(w.matchPhase, 'the window expired inside BUILD').toBe('BUILD');
    expect(food.ehp, 'no bite in BUILD').toBe(foodAtEdge);
    expect(b.ehp, 'no heal in BUILD').toBe(bossAtEdge);
    expect(b.pos, 'and the leash did not drag him back to the fight').toEqual(home);
  });
});
