/**
 * ⭐ S191 C-8 (owner R190-I, on the castle) — `Player.castleHealedHp`, THE KEEP'S HEAL COUNTER, AT ITS FOUR
 * SITES: the factory (0), the two places a keep's HP RISES (regen, an HP purchase), the carry-FSM rebuilds
 * that must not reset it, the save / wire round trip, the wide hash, and the `?worker=1` INIT.
 *
 * It is presentational: `damageNumbers.ts` reads it to split a hit from a heal (`creaturePoolChange`), and
 * nothing any sim computes reads it. Monotonic: only ever grows, by exactly what the keep GAINED (after the
 * cap), so the split is exact.
 */
import { describe, expect, it } from 'vitest';
import { PHYSICS_HZ, PLAYER_COLORS, SparkType } from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { drop, makeIdlePlayer, pickup } from '../game/player.ts';
import { asPlayerId, asSparkId } from '../types.ts';
import { castleRegenPerSecond, castleRegenTick } from './castleRegen.ts';
import { applyUpgradeCastleStat, castleMaxHpFor } from './castleUpgrades.ts';
import { damageEntity } from './damage.ts';
import { mulberry32 } from './rng.ts';
import { applyNetSnapshot, netSnapshot, restore, snapshot } from './save.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { makeWorkerSim } from './workerSim.ts';
import { dispatch, makeWorld, type World } from './world.ts';

const P0 = asPlayerId(0);

function match(): World {
  const w = makeWorld(0x191c9);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0]! }, { seat: 1, color: PLAYER_COLORS[1]! }],
  });
  w.gameState = 'PLAYING';
  return w;
}

/** Regenerate seat 0 once, on its real beat. */
function regenOnce(w: World): void {
  while (w.tick % PHYSICS_HZ !== 0) w.tick++;
  castleRegenTick(w);
}

describe('S191 C-8 — Player.castleHealedHp', () => {
  it('a new seat starts at 0', () => {
    expect(makeIdlePlayer(P0, PLAYER_COLORS[0]!).castleHealedHp).toBe(0);
    expect(match().players.get(P0)!.castleHealedHp).toBe(0);
  });

  it('REGEN counts exactly what the keep gained — and only that, at the cap', () => {
    const w = match();
    const p = w.players.get(P0)!;
    p.castleRegenLevel = 1;
    const max = castleMaxHpFor(p.castleUpgrades);
    const gain = castleRegenPerSecond(1, max);
    p.castleHp = max - 400;
    regenOnce(w);
    expect(p.castleHealedHp).toBe(gain);
    p.castleHp = max - 3; // closer to the ceiling than one beat heals
    w.tick += 1;
    regenOnce(w);
    expect(p.castleHp).toBe(max);
    expect(p.castleHealedHp, 'the capped beat counts 3, not the whole gain').toBe(gain + 3);
  });

  it('an HP PURCHASE counts what it healed; a HIT never moves the counter', () => {
    const w = match();
    const p = w.players.get(P0)!;
    w.scoreByPlayer.set(P0, 10_000);
    const before = p.castleHp;
    applyUpgradeCastleStat(w, { type: 'UPGRADE_CASTLE_STAT', playerId: P0, stat: 'hp' }, (seat, amount) => {
      w.scoreByPlayer.set(seat, (w.scoreByPlayer.get(seat) ?? 0) - amount);
    });
    const gained = p.castleHp - before;
    expect(gained, 'anti-vacuity: the purchase healed').toBeGreaterThan(0);
    expect(p.castleHealedHp).toBe(gained);
    damageEntity(w, { kind: 'castle', seat: P0 }, 40, 'player', null, 'physical');
    expect(p.castleHealedHp).toBe(gained);
  });

  it('⛔ the carry-FSM rebuilds (pickup / drop) keep it — they rebuild the player wholesale', () => {
    const p = makeIdlePlayer(P0, PLAYER_COLORS[0]!);
    p.castleHealedHp = 77;
    const carrying = pickup(p, asSparkId(5));
    expect(carrying.castleHealedHp).toBe(77);
    expect(drop(carrying).castleHealedHp).toBe(77);
  });

  it('the save and the wire carry it; an unhealed keep emits NO key (byte-identical to before)', () => {
    const w = match();
    const snap0 = snapshot(w);
    expect(snap0.players?.every((sp) => !('castleHealedHp' in sp))).toBe(true);
    w.players.get(P0)!.castleHealedHp = 123;
    const r = makeWorld(1);
    restore(JSON.parse(JSON.stringify(snapshot(w))), r);
    expect(r.players.get(P0)!.castleHealedHp).toBe(123);
    const joiner = makeWorld(2);
    joiner.isHost = false;
    applyNetSnapshot(JSON.parse(JSON.stringify(netSnapshot(w))), joiner);
    expect(joiner.players.get(P0)!.castleHealedHp).toBe(123);
    // A malformed value crosses no trust boundary as garbage.
    const bad = JSON.parse(JSON.stringify(snapshot(w)));
    bad.players[0].castleHealedHp = -9.5;
    const r2 = makeWorld(3);
    restore(bad, r2);
    expect(r2.players.get(P0)!.castleHealedHp).toBe(0);
  });

  it('it moves the WIDE hash, and a `?worker=1` INIT adopts it bit-exact', () => {
    const w = match();
    const before = hashWorldStateFull(w);
    w.players.get(P0)!.castleHealedHp = 50;
    expect(hashWorldStateFull(w)).not.toBe(before);
    const sp = new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1));
    const sim = makeWorkerSim({ type: 'INIT', saveJson: JSON.stringify(snapshot(w, { spawnerState: sp.getState() })), hostSeats: [], localPlayerId: 0 });
    expect(sim.world.players.get(P0)!.castleHealedHp).toBe(50);
    expect(hashWorldStateFull(sim.world)).toBe(hashWorldStateFull(w));
    void SparkType;
  });
});
