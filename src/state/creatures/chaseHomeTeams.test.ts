/**
 * SPARK — ⭐ S195 (audit LOW-1, teams × N11) — **THE 2v1 SOLO'S SECOND ZONE IS HOME FOR CHASING.**
 *
 * On the mapped 2v1 board (`QUADRANTS_4P:2012`) the solo (seat 2) owns NW (his home) and the empty SW (B-29).
 * `creatureAI`'s chase "home" test asks `isHomeZone` — any zone the seat owns — so in his SW a pathless drone is
 * engaged as at home (N11), a moving one that cannot be cut off is still dropped, and a pair seat standing
 * there is abroad. Written by the independent auditor; adopted here.
 */
import { describe, expect, it } from 'vitest';
import { GOBLIN_UNIT_ACQUIRE_RADIUS, GOBLIN_UNIT_LEASH_RADIUS, PLAYER_COLORS } from '../../constants.ts';
import { pickNavUnit } from './creatureAI.ts';
import { makeCreature, type Creature, type CreatureType } from './creature.ts';
import { CREATURE_CONFIGS } from './voltkin-config.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asCreatureId, asPlayerId, asSpawnerId, type Vec2 } from '../../types.ts';
import { zoneOf, zoneOwner } from '../zones.ts';
const ACQ = GOBLIN_UNIT_ACQUIRE_RADIUS ** 2, LEASH = GOBLIN_UNIT_LEASH_RADIUS ** 2;
function board(): World {
  const w = makeWorld(0x76); w.gameState = 'TITLE';
  dispatch(w, { type: 'START_GAME', mode: 'bots', isHost: true, botSeats: [1, 2],
    roster: [{ seat: 0, color: PLAYER_COLORS[0], team: 0 }, { seat: 1, color: PLAYER_COLORS[1], team: 0 }, { seat: 2, color: PLAYER_COLORS[2] }] } as never);
  w.gameState = 'PLAYING'; w.isHost = true; w.matchPhase = 'FIGHT'; w.phaseEndsAtTick = w.tick + 1e6; w.creatures.clear();
  return w;
}
function put(w: World, seat: number, type: CreatureType, pos: Vec2, targetPos: Vec2 = pos): Creature {
  const id = asCreatureId(w.nextCreatureId++);
  const c = makeCreature(CREATURE_CONFIGS[type], { id, ownerPlayerId: asPlayerId(seat), pos: { ...pos }, targetPos: { ...targetPos },
    spawnedAtTick: type === 'lightningDrone' ? w.tick : w.tick - 1000, sourceSpawnerId: asSpawnerId(1), clock: w });
  c.state = 'SEEKING'; w.creatures.set(c.id, c); return c;
}
describe('S195 audit LOW-1 — N11 × teams: the 2v1 solo second zone is home', () => {
  it('2v1 solo (seat 2): SW is home ground — pathless drone engaged; moving-away drone dropped (N11)', () => {
    const w = board();
    expect(w.layout).toBe('QUADRANTS_4P:2012');
    expect(zoneOwner(2, w.layout)).toBe(0);
    const at = { x: 500, y: 860 };
    expect(zoneOf(at, w.layout)).toBe(3);
    const me = put(w, 2, 'goblinMelee', at);
    const q = put(w, 0, 'lightningDrone', { x: at.x + 200, y: at.y });
    expect(zoneOf(q.pos, w.layout)).toBe(3);
    expect(pickNavUnit(w, me, null, ACQ, LEASH), 'pathless drone in his SECOND zone = home').toBe(q.id);
    w.creatures.delete(q.id);
    put(w, 0, 'lightningDrone', { x: at.x + 200, y: at.y + 30 }, { x: 940, y: at.y + 30 });
    expect(pickNavUnit(w, me, null, ACQ, LEASH), 'N11: moving drone that cannot be cut off is dropped even at home').toBeNull();
  });
  it('control: pair seat 0 (NE) standing in SW is abroad — pathless drone dropped', () => {
    const w = board();
    const at = { x: 500, y: 860 };
    const me = put(w, 0, 'goblinMelee', at);
    put(w, 2, 'lightningDrone', { x: at.x + 200, y: at.y });
    expect(pickNavUnit(w, me, null, ACQ, LEASH)).toBeNull();
  });
});
