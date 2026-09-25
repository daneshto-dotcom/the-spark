/**
 * SPARK — S188 audit F2 — **A BOT MUMMY CALLS RA**, through a real bots match tick.
 *
 * The draft deadline hands every bot mummies seat POWER OF RA (and WRATH OF RA at level 10); these
 * tests pin that the bot then USES it — through `runHostTick` with a real `BotManager`, the path a
 * live VS-BOTS match takes — aimed at the enemy, never at nothing, and identically on two runs.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, RA_RITUAL_TICKS } from '../constants.ts';
import { asPlayerId, asSpawnerId, type CreatureId, type PlayerId } from '../types.ts';
import type { Controls } from '../input/controls.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { mulberry32 } from '../state/rng.ts';
import { hashWorldStateFull } from '../state/stateHashFull.ts';
import { BotManager } from './botManager.ts';
import { botRaAction, BOT_RA_EVAL_EVERY_TICKS, BOT_RA_MAX_CANDIDATES } from './botRa.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import type { DraftPick } from '../state/draft.ts';

const HUMAN = asPlayerId(0); // orcs
const BOT = asPlayerId(1); // mummies
const CLUSTER = { x: 900, y: 360 };

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function match(picks: DraftPick[], wave = 1): { w: World; d: HostTickDeps } {
  const w = makeWorld(0xb07a);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0]!, raceId: 'orcs' },
      { seat: 1, color: PLAYER_COLORS[1]!, raceId: 'mummies' },
    ],
    botSeats: [1],
  });
  w.draft = null;
  w.players.get(BOT)!.draftPicks.splice(0, Infinity, ...picks);
  w.waveNumber = wave;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  const d = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)), controls: stubControls,
    botManager: new BotManager(['HARD'], 0x5eed), gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
  return { w, d };
}

let sentinel = 9700;
function enemy(w: World, x: number, y: number, owner: PlayerId = HUMAN): CreatureId {
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: 'chewer', ownerPlayerId: owner,
    pos: { x, y }, targetPos: { x, y }, sourceSpawnerId: asSpawnerId(sentinel++),
  });
  const id = [...w.creatures.keys()].at(-1)!;
  const c = w.creatures.get(id)!;
  c.ehp = 50_000;
  c.maxEhp = 50_000;
  return id;
}
/** Four enemies packed on one spot, so any column over it hits several. */
const cluster = (w: World): CreatureId[] =>
  [[0, 0], [12, 0], [0, 12], [12, 12]].map(([dx, dy]) => enemy(w, CLUSTER.x + dx!, CLUSTER.y + dy!));
/** Hold them still: a creature walks, and the aim is scored on where they stand NOW. */
function pin(w: World, ids: CreatureId[]): void {
  ids.forEach((id, i) => {
    const c = w.creatures.get(id);
    if (c === undefined) return;
    const p = { x: CLUSTER.x + (i % 2) * 12, y: CLUSTER.y + Math.floor(i / 2) * 12 };
    c.pos = { ...p }; c.prevPos = { ...p }; c.targetPos = { ...p };
  });
}
function run(w: World, d: HostTickDeps, ticks: number, ids: CreatureId[] = []): void {
  const s = makeHostTickState(w);
  for (let i = 0; i < ticks; i++) {
    pin(w, ids);
    runHostTick(w, d, s);
  }
}

describe('S188 audit F2 — a bot mummy casts POWER OF RA in a real bots match', () => {
  it('⭐⭐ it calls Ra on the enemy cluster, once, and the columns land on it', () => {
    const { w, d } = match(['racial']);
    const ids = cluster(w);
    run(w, d, BOT_RA_EVAL_EVERY_TICKS * 3, ids);
    const strikes = w.players.get(BOT)!.raStrikes;
    expect(strikes, 'the bot called Ra').toHaveLength(1);
    expect(Math.hypot(strikes[0]!.x - CLUSTER.x, strikes[0]!.y - CLUSTER.y), 'aimed at the cluster')
      .toBeLessThanOrEqual(20);

    run(w, d, RA_RITUAL_TICKS + 5, ids);
    const hurt = ids.filter((id) => (w.creatures.get(id)?.ehp ?? 0) < 50_000).length;
    expect(hurt, 'the columns reached the enemy').toBeGreaterThan(0);
    expect(w.players.get(BOT)!.raStrikes, 'and it was the only cast this fight').toHaveLength(1);
  });

  it('⛔ nothing to hit → no cast; one lone enemy with the fight young → no cast', () => {
    const empty = match(['racial']);
    run(empty.w, empty.d, BOT_RA_EVAL_EVERY_TICKS * 4);
    expect(empty.w.players.get(BOT)!.raStrikes).toHaveLength(0);

    const lone = match(['racial']);
    const id = enemy(lone.w, CLUSTER.x, CLUSTER.y);
    run(lone.w, lone.d, BOT_RA_EVAL_EVERY_TICKS * 4, [id]);
    expect(lone.w.players.get(BOT)!.raStrikes, 'one unit is not worth the strike yet').toHaveLength(0);
  });

  it('⭐ …but as the fight ends it spends the charge on whatever is there', () => {
    const { w, d } = match(['racial']);
    const id = enemy(w, CLUSTER.x, CLUSTER.y);
    w.phaseEndsAtTick = w.tick + RA_RITUAL_TICKS + 60;
    run(w, d, BOT_RA_EVAL_EVERY_TICKS * 2, [id]);
    expect(w.players.get(BOT)!.raStrikes).toHaveLength(1);
  });

  it('⭐ a WRATH bot casts again only after its previous strike has finished', () => {
    const { w, d } = match(['racial', 'hp', 'racial'], 11);
    const ids = cluster(w);
    run(w, d, BOT_RA_EVAL_EVERY_TICKS * 2, ids);
    expect(w.players.get(BOT)!.raStrikes).toHaveLength(1);
    run(w, d, RA_RITUAL_TICKS - BOT_RA_EVAL_EVERY_TICKS * 2, ids);
    expect(w.players.get(BOT)!.raStrikes, 'no second cast while the first is still falling').toHaveLength(1);
    run(w, d, BOT_RA_EVAL_EVERY_TICKS * 3, ids);
    expect(w.players.get(BOT)!.raStrikes, 'the second charge').toHaveLength(2);
  });

  it('⛔ a bot WITHOUT the perk never casts, and a benched one is refused before it looks', () => {
    const { w, d } = match(['hp']);
    const ids = cluster(w);
    run(w, d, BOT_RA_EVAL_EVERY_TICKS * 3, ids);
    expect(w.players.get(BOT)!.raStrikes).toHaveLength(0);

    const b = match(['racial']);
    cluster(b.w);
    b.w.players.get(BOT)!.benchedUntilTick = b.w.tick + 100_000;
    for (let t = 0; t < BOT_RA_EVAL_EVERY_TICKS; t++) {
      b.w.tick++;
      expect(botRaAction(b.w, BOT)).toBeNull();
    }
  });

  it('⛔ DETERMINISM — two identical matches make the identical cast and the identical world', () => {
    const once = (): { strikes: string; hash: number } => {
      sentinel = 9700;
      const { w, d } = match(['racial']);
      const ids = cluster(w);
      run(w, d, BOT_RA_EVAL_EVERY_TICKS * 3 + RA_RITUAL_TICKS, ids);
      return { strikes: JSON.stringify(w.players.get(BOT)!.raStrikes), hash: hashWorldStateFull(w) };
    };
    const a = once();
    expect(a.strikes).not.toBe('[]');
    expect(once()).toEqual(a);
  });
});

/*
 * ⭐ S190 (audit WRATH-L1-06) — THE CANDIDATE CAP MUST NOT EXCLUDE THE WAVE THAT IS ATTACKING.
 * Candidates were the 64 OLDEST enemy creatures (ids ascending), so on a crowded late board the
 * newest units — the ones marching on the bot — were never an aim point.
 */
describe('S190 L1-06 — on a crowded board the bot still aims at the newest cluster at its gate', () => {
  it('⭐ 66 older lone enemies far away + a NEWER cluster near its castle → it strikes the cluster', () => {
    const { w, d } = match(['racial']);
    const home = castleAnchor(BOT as unknown as number, w.layout);
    // The cluster: 8 units stacked beside the bot's castle, spawned LAST (the highest ids).
    const near = { x: home.x + (home.x < 960 ? 160 : -160), y: home.y };
    // The old ones: a 145 px grid (a 70 px-radius column can hold at most one), none nearer the
    // castle than the cluster and none a column's reach (150 + 70) from it, spawned FIRST.
    const spots = new Map<CreatureId, { x: number; y: number }>();
    const far: { x: number; y: number }[] = [];
    for (let y = 40; y <= 980 && far.length < 66; y += 145) {
      for (let x = 40; x <= 1880 && far.length < 66; x += 145) {
        if (Math.hypot(x - home.x, y - home.y) < 350 || Math.hypot(x - near.x, y - near.y) < 350) continue;
        far.push({ x, y });
      }
    }
    expect(far, 'anti-vacuity: enough old enemies to overflow the cap').toHaveLength(66);
    for (const p of far) spots.set(enemy(w, p.x, p.y), p);
    const clusterIds: CreatureId[] = [];
    for (let i = 0; i < 8; i++) {
      const p = { x: near.x + (i % 4) * 4, y: near.y + Math.floor(i / 4) * 4 };
      const id = enemy(w, p.x, p.y);
      clusterIds.push(id);
      spots.set(id, p);
    }
    expect(spots.size, 'anti-vacuity: more enemies than the candidate cap').toBeGreaterThan(BOT_RA_MAX_CANDIDATES);
    const oldest = [...spots.keys()].sort((a, b) => Number(a) - Number(b)).slice(0, BOT_RA_MAX_CANDIDATES);
    expect(clusterIds.some((id) => oldest.includes(id)), 'the cluster is NOT among the 64 oldest').toBe(false);

    const s = makeHostTickState(w);
    for (let t = 0; t < BOT_RA_EVAL_EVERY_TICKS * 3; t++) {
      for (const [id, p] of spots) {
        const c = w.creatures.get(id);
        if (c !== undefined) { c.pos = { ...p }; c.prevPos = { ...p }; c.targetPos = { ...p }; }
      }
      runHostTick(w, d, s);
    }
    const strikes = w.players.get(BOT)!.raStrikes;
    expect(strikes, 'the bot called Ra').toHaveLength(1);
    expect(Math.hypot(strikes[0]!.x - near.x, strikes[0]!.y - near.y), 'aimed at the new cluster').toBeLessThanOrEqual(20);
  });
});
