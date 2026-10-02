/**
 * SPARK — ⭐ S194 (audit T10 LOW-1): the DEATHS THAT NEVER PASS `damageEntity`, on the stat board.
 *
 * Four real ways a unit leaves the world delete it outright instead of damaging it to zero, so before this
 * audit none of them reached LOST or KILLS. Each is now recorded where the death happens (INERT — read
 * only by the board); and the two SELF-DETONATIONS are deliberately recorded as neither.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asPlayerId, type CreatureId, type PlayerId } from '../types.ts';
import { runArchdemonHell } from './bossSkillsArchdemon.ts';
import { runPharaohRitual } from './bossSkillsPharaohRitual.ts';
import { damageCreature } from './creatures/creatureLifecycle.ts';
import { applyRadialClear } from './potatoLifecycle.ts';
import { T9_BOSS_TYPE } from './t9BossIds.ts';
import { dispatch, makeWorld, type World } from './world.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function fight(): World {
  const w = makeWorld(0x5194d);
  w.isHost = true;
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  return w;
}

let src = 9100;
function spawn(w: World, type: string, owner: PlayerId, x: number, y = 500): CreatureId {
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: type as never, ownerPlayerId: owner,
    pos: { x, y }, targetPos: { x, y }, sourceSpawnerId: src++ as never,
  });
  return [...w.creatures.keys()].sort((a, b) => (b as number) - (a as number))[0]!;
}

const lost = (w: World, seat: PlayerId, type: string): number => w.matchStats.seats.get(seat)?.lost.get(type as never) ?? 0;
const kills = (w: World, seat: PlayerId, type: string): number => w.matchStats.seats.get(seat)?.kills.get(type as never) ?? 0;

describe('⭐ S194 LOW-1 — deaths outside the damage funnel reach LOST / KILLS', () => {
  it('Archdemon HELL: a LOSS for the victim, a KILL for the demon\'s seat', () => {
    const w = fight();
    spawn(w, T9_BOSS_TYPE.demons, P0, 900);
    const victim = spawn(w, 'goblinShield', P1, 940);
    w.creatures.get(victim)!.ehp = 0.5;
    runArchdemonHell(w);
    expect(w.creatures.has(victim), 'fixture: taken to hell').toBe(false);
    expect(lost(w, P1, 'goblinShield')).toBe(1);
    expect(kills(w, P0, 'goblinShield')).toBe(1);
  });

  it('the radial clear credits the seat it is given (the hub owner), and only enemies are kills', () => {
    const w = fight();
    const a = spawn(w, 'goblinMelee', P1, 500);
    const b = spawn(w, 'goblinMelee', P1, 520);
    applyRadialClear(w, 510, 500, 100 * 100, (c) => c.ownerPlayerId !== P0, () => false, P0);
    expect([w.creatures.has(a), w.creatures.has(b)]).toEqual([false, false]);
    expect(lost(w, P1, 'goblinMelee')).toBe(2);
    expect(kills(w, P0, 'goblinMelee')).toBe(2);
  });

  it('a potato\'s clear (no author) is LOST only; a corpse-in-waiting is not counted a second time', () => {
    const w = fight();
    spawn(w, 'goblinMelee', P1, 500);
    const corpse = spawn(w, 'goblinMelee', P1, 505);
    w.creatures.get(corpse)!.ehp = 0; // already lethally struck — `damageEntity` counted that death
    applyRadialClear(w, 500, 500, 100 * 100, () => true, () => false, null);
    expect(lost(w, P1, 'goblinMelee')).toBe(1);
    expect(kills(w, P0, 'goblinMelee')).toBe(0);
  });

  it('the two production callers pass the right credit (source text — the cases above are the REACH)', () => {
    const s = readFileSync('src/state/potatoLifecycle.ts', 'utf8').replace(/\r\n/g, '\n');
    expect(s).toContain('(c) => potatoClearsType(c.type), undefined, null);');
    expect(s).toContain('owner ?? null, // ⭐ S194');
  });

  it('the Pharaoh\'s ritual end is his death: a LOSS for his seat, a kill for nobody', () => {
    const w = fight();
    const ph = spawn(w, T9_BOSS_TYPE.mummies, P0, 500);
    damageCreature(w, ph, 1_000_000); // starts the ritual instead of killing him
    const until = w.creatures.get(ph)!.raRitualUntilTick!;
    expect(until, 'fixture: the ritual began').toBeGreaterThan(w.tick);
    w.tick = until + 1;
    runPharaohRitual(w);
    expect(w.creatures.has(ph), 'fixture: the ritual ended in his death').toBe(false);
    expect(lost(w, P0, T9_BOSS_TYPE.mummies)).toBe(1);
    for (const s of w.matchStats.seats.values()) expect(s.kills.get(T9_BOSS_TYPE.mummies) ?? 0).toBe(0);
  });

  it('⛔ a SELF-DETONATION (suicide goblin, lightning drone) is neither a loss nor a kill', () => {
    for (const [type, action] of [['goblinSuicide', 'SUICIDE_BLAST'], ['lightningDrone', 'DRONE_EXPLODE']] as const) {
      const w = fight();
      const id = spawn(w, type, P1, 700);
      dispatch(w, { type: action, creatureId: id } as never);
      expect(w.creatures.has(id), `fixture: the ${type} is gone`).toBe(false);
      expect(lost(w, P1, type)).toBe(0);
      for (const s of w.matchStats.seats.values()) expect(s.kills.get(type as never) ?? 0).toBe(0);
    }
  });
});
