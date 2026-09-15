/**
 * SPARK — S178: **VLAD vs THE ORC WARLORD, MEASURED.** A standing balance probe, not a guard.
 *
 * Owner: *"Vlad and the Warlord were fighting each other. The Warlord literally did, like, what,
 * twenty five percent damage while Vlad killed him. So obviously there's something not equal
 * between them that's not cool."*
 *
 * ⭐ THE LADDER IS NOT WHAT DECIDES THIS FIGHT, AND THE MEASUREMENT IS WHY. On the ×5 ladder they
 * are near-even: Vlad 150/strike into the Warlord's 374 pool = 3 strikes; the Warlord 112/strike
 * into Vlad's 260 = 3 strikes. Run in the real host tick, the duel is **6.1 s and Vlad wins 12/12**:
 *
 *     VLAD    worst damage taken 66%  ->  FINAL 46%   (heals 20% of max back)
 *     WARLORD worst damage taken 80%  ->  dead
 *
 * ⛔ THE ASYMMETRY IS THE ABILITIES, NOT THE STATS.
 *   · Vlad's life-sap (R140) is +20% of max, three uses, below 40% — an effective pool of
 *     260 + 3x52 = **416 fifths, i.e. +60% free health**, and it is a PURE SELF-HEAL with no victim.
 *   · The Warlord's rage is an attack-CADENCE doubling below 25%, which against Vlad can barely
 *     fire: 25% of 374 is 93.5 fifths and Vlad's strike is 150, so the Warlord falls 224 -> 74 in one
 *     blow and skips straight past the window into death.
 *
 * So the owner's *"the Warlord literally did twenty five percent damage while Vlad killed him"* is
 * an accurate reading of the BAR: the Warlord did land ~66%, and Vlad healed most of it back.
 *
 * ⚠ THIS FILE REPORTS, IT DOES NOT GATE. The balance is the owner's to rule on (S178 open question
 * Q1), and a test that pinned "Vlad wins" would go red the moment he retunes — which is the point of
 * retuning. Re-run it after any change to the boss band, the sap or the rage and read the numbers.
 *
 * ⚠ AND THE OUTCOME IS FULLY DETERMINISTIC ACROSS SEEDS, which is correct rather than suspicious:
 * `winsInitiative` is a stateless hash of (both ids, tick), not a draw from the seeded stream, so the
 * `seed` here only varies the Spawner. Two given boss ids resolve their coin-flips identically every
 * match. Varying the IDS, not the seed, is what would vary this result.
 */
import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch, type World } from './world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { makeGameStateExtras } from './gameState.ts';
import { mulberry32 } from './rng.ts';
import { applySpawnCreature } from './creatures/creatureLifecycle.ts';
import { asPlayerId } from '../types.ts';
import type { Controls } from '../input/controls.ts';
import { maxPoolFifths } from './damageOverTime.ts';

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(seed: number): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(seed)),
    controls: stubControls, botManager: null,
    gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}
function make1v1(): World {
  const w = makeWorld(0x9111);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  return w;
}

interface Duel {
  winner: string;
  ticks: number;
  vladLostPct: number;
  warlordLostPct: number;
  vladMinPct: number;
  warlordMinPct: number;
}

function duel(seed: number): Duel {
  const w = make1v1();
  w.creatures.clear();
  // Face to face, well inside melee reach (GOBLIN_ATTACK_RANGE 35).
  applySpawnCreature(w, {
    type: 'SPAWN_CREATURE', creatureType: 't9BossVampires', ownerPlayerId: asPlayerId(0),
    pos: { x: 900, y: 540 }, targetPos: { x: 930, y: 540 }, sourceSpawnerId: null,
  } as never);
  applySpawnCreature(w, {
    type: 'SPAWN_CREATURE', creatureType: 't9BossOrcs', ownerPlayerId: asPlayerId(1),
    pos: { x: 930, y: 540 }, targetPos: { x: 900, y: 540 }, sourceSpawnerId: null,
  } as never);
  const all = [...w.creatures.values()];
  const vlad = all.find((c) => c.type === 't9BossVampires')!;
  const orc = all.find((c) => c.type === 't9BossOrcs')!;
  const vMax = maxPoolFifths('t9BossVampires');
  const oMax = maxPoolFifths('t9BossOrcs');

  const d = deps(seed);
  const st = makeHostTickState(w);
  let vMin = vMax;
  let oMin = oMax;
  let ticks = 0;
  for (let t = 0; t < 3600; t++) {
    runHostTick(w, d, st);
    ticks = t;
    const v = w.creatures.get(vlad.id);
    const o = w.creatures.get(orc.id);
    if (v !== undefined) vMin = Math.min(vMin, v.ehp);
    if (o !== undefined) oMin = Math.min(oMin, o.ehp);
    if (v === undefined || o === undefined) break;
  }
  const v = w.creatures.get(vlad.id);
  const o = w.creatures.get(orc.id);
  const pct = (cur: number | undefined, max: number): number =>
    cur === undefined ? 100 : Math.round(((max - cur) / max) * 100);
  return {
    winner: v === undefined && o === undefined ? 'BOTH' : v === undefined ? 'WARLORD' : o === undefined ? 'VLAD' : 'NEITHER',
    ticks,
    vladLostPct: pct(v?.ehp, vMax),
    warlordLostPct: pct(o?.ehp, oMax),
    vladMinPct: Math.round(((vMax - vMin) / vMax) * 100),
    warlordMinPct: Math.round(((oMax - oMin) / oMax) * 100),
  };
}

describe('S178 PROBE — Vlad vs the Orc Warlord', () => {
  it('runs the duel across many seeds and reports who actually wins and by how much', () => {
    const rows: Duel[] = [];
    for (let s = 1; s <= 12; s++) rows.push(duel(s));
    for (const [i, r] of rows.entries()) {
      // eslint-disable-next-line no-console
      console.log(
        `DUEL seed${i + 1}: winner=${r.winner} secs=${(r.ticks / 60).toFixed(1)} | ` +
        `VLAD worst-damage=${r.vladMinPct}% FINAL-damage=${r.vladLostPct}% ` +
        `(healed back ${r.vladMinPct - r.vladLostPct}%) | WARLORD worst=${r.warlordMinPct}%`,
      );
    }
    const vladWins = rows.filter((r) => r.winner === 'VLAD').length;
    // eslint-disable-next-line no-console
    console.log(
      `DUEL SUMMARY: Vlad won ${vladWins}/${rows.length}; ` +
      `median damage Vlad took = ${rows.map((r) => r.vladMinPct).sort((a, b) => a - b)[Math.floor(rows.length / 2)]}%`,
    );
    expect(rows.length).toBe(12);
  });
});
