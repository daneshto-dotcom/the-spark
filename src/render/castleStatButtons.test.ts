/**
 * SPARK — S188 P3: **THE CASTLE HP / ATK / DEF / PEN BUTTONS, PRESSED.**
 *
 * > *"For now on, we just have regen and I'm pretty sure we have already spec'd out the upgrade for
 * > the castle health. So wire that in and implement it."* — owner, S188
 *
 * S187 built the four upgrades in the SIM (`castleUpgrades.ts`, `UPGRADE_CASTLE_STAT`) and nothing
 * dispatched them. `castleUpgradesReach.test.ts` proves the reducer; it would stay green with no
 * button anywhere, which is exactly the state S187 shipped in. This file is the other half: a PRESS
 * on the real `CastlePanel` travels to the reducer, spends, levels, and the effect shows up in the
 * REAL host tick.
 *
 * ⚠ HOW A HEADLESS "CLICK" IS DRIVEN, AND WHAT IT DOES AND DOES NOT PROVE.
 *   · The real `CastlePanel` is constructed and `sync`ed. `fitTextToWidth` is stubbed because it
 *     MEASURES a Pixi `Text`, which needs a DOM canvas vitest does not have; it only shrinks two
 *     caption fonts and decides nothing a row does.
 *   · The row is found the way Pixi finds it: the canvas point `getUiPoints()` reports for the key,
 *     tested against each box's Graphics child with `containsPoint` — the exact hit path the file
 *     docblock of `castlePanel.ts` describes. Exactly ONE box may claim the point.
 *   · Its `pointertap` is then emitted. What this does NOT cover is Pixi's EventBoundary and a real
 *     pointer; `e2e/castle-panel.spec.ts` has a castle-HP click case for that (the merge owner runs
 *     e2e — branches do not).
 *   · The handler injected here is main.ts's, character for character (a tripwire below pins the
 *     main.ts line), with `dispatchFn` resolved to its solo/host arm: `dispatch(world, action)`.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Container, Graphics, type Application } from 'pixi.js';

vi.mock('./textFit.ts', () => ({ fitTextToWidth: () => {}, fitTextToBox: () => {} }));

import {
  CASTLE_ATK,
  CASTLE_MAX_HP,
  CASTLE_PEN,
  phaseDurationTicks,
} from '../constants.ts';
import {
  CASTLE_ROW_KEYS,
  CASTLE_STAT_ROWS,
  CastlePanel,
  ROW_DETAIL_FONT_ADVANCE,
  ROW_FONT_ADVANCE,
  ROW_INNER_W,
  castleControlsModel,
  type CastleRowKey,
} from './castlePanel.ts';
import { characterSheetModel } from './characterSheetModel.ts';
import {
  CASTLE_HP_GAIN_BY_BAND,
  CASTLE_UPGRADE_MAX_LEVEL,
  CASTLE_UPGRADE_PRICE,
  castleMaxHpFor,
  castleShotFifthsFor,
  castleUpgradePreview,
  type CastleStat,
} from '../state/castleUpgrades.ts';
import { castleFiresOnTick, castleShotFifths } from '../state/castleGuns.ts';
import { castleRegensOnTick } from '../state/castleRegen.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from '../state/rng.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { attackFifths } from '../state/stats.ts';
import { stampSenderSeat } from '../net/intentStamp.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import type { Controls } from '../input/controls.ts';
import { asPlayerId, asSpawnerId, type CreatureId, type PlayerId } from '../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

/* -------------------------------------------------------------------------------------------- *
 *   fixtures
 * -------------------------------------------------------------------------------------------- */

/** A 1v1 host world, PLAYING, seat 0 local, in a long BUILD (nothing attacks during BUILD). */
function hostWorld(points: number, phase: 'BUILD' | 'FIGHT' = 'BUILD'): World {
  const w = makeWorld(0x188c);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.localPlayerId = P0;
  w.matchPhase = phase;
  w.phaseEndsAtTick = w.tick + phaseDurationTicks(phase) * 4;
  w.creatures.clear();
  w.scoreByPlayer.set(P0, points);
  return w;
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function hostDeps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

/** The real panel, with main.ts's handlers injected against `w`, open on `seat`, synced once. */
function mountPanel(w: World, seat: PlayerId = w.localPlayerId) {
  const stage = new Container();
  const panel = new CastlePanel({ stage } as unknown as Application);
  const sent: Array<{ type: string; stat?: CastleStat }> = [];
  // ⛔ These bodies are main.ts's, with `dispatchFn` resolved to its solo/host arm.
  panel.setCastleRegenHandler(() => {
    sent.push({ type: 'UPGRADE_CASTLE_REGEN' });
    dispatch(w, { type: 'UPGRADE_CASTLE_REGEN', playerId: w.localPlayerId });
  });
  panel.setCastleStatHandler((stat) => {
    sent.push({ type: 'UPGRADE_CASTLE_STAT', stat });
    dispatch(w, { type: 'UPGRADE_CASTLE_STAT', playerId: w.localPlayerId, stat });
  });
  panel.open(seat as unknown as number);
  panel.sync(w);
  return { panel, stage, sent };
}

/**
 * PRESS the row `key`: find the box Pixi would hit at the centre `getUiPoints()` reports, and emit
 * its `pointertap`. Re-syncs first, because `activate` acts on the enabled latch of the LAST sync —
 * the same frame-to-frame order the live client has.
 */
function press(m: ReturnType<typeof mountPanel>, w: World, key: CastleRowKey): void {
  m.panel.sync(w);
  const ui = m.panel.getUiPoints();
  const at = ui.rowCenters.find((r) => r.key === key);
  if (at === undefined) throw new Error(`getUiPoints reports no row ${key}`);
  const root = m.stage.children[0] as Container;
  const hits = root.children.filter((child): child is Container => {
    if (!(child instanceof Container) || child.listenerCount('pointertap') === 0) return false;
    const g = child.children[0];
    if (!(g instanceof Graphics)) return false;
    return g.containsPoint({
      x: at.x - root.position.x - child.position.x,
      y: at.y - root.position.y - child.position.y,
    });
  });
  expect(hits, `exactly one clickable box sits under ${key}'s reported centre`).toHaveLength(1);
  hits[0]!.emit('pointertap', undefined as never);
}

const upgrades = (w: World, seat: PlayerId = P0) => w.players.get(seat)!.castleUpgrades;
const row = (w: World, key: CastleRowKey, seat?: PlayerId) => {
  const r = castleControlsModel(w, seat).find((c) => c.key === key);
  if (r === undefined) throw new Error(`no row ${key}`);
  return r;
};

/** Spawn one ENEMY creature `dist` px along +x from seat 0's keep, with a pool that survives shots. */
function toughEnemyNearSeat0(w: World, dist: number, type: 'chewer' | 'goblinMelee'): CreatureId {
  const a = castleAnchor(0, w.layout);
  const pos = { x: a.x + dist, y: a.y };
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: type, ownerPlayerId: P1, pos, targetPos: { x: a.x, y: a.y },
    sourceSpawnerId: asSpawnerId(1), // ⛔ a sentinel, not null — the B1 latch (castleGuns.test.ts)
  });
  const id = [...w.creatures.keys()].at(-1);
  if (id === undefined) throw new Error('fixture failed to spawn');
  const c = w.creatures.get(id)!;
  // ⚠ FIXTURE: a raised pool, so the measured number is ONE shot / many swings rather than a kill.
  c.ehp = 100_000;
  c.maxEhp = 100_000;
  return id;
}

/**
 * What ONE castle shot takes off a victim, measured through `runHostTick`. The tick is parked one
 * short of seat 0's next fire slot, so the very next host tick is the shot — the victim has no time
 * to walk out of range, and nothing else on an empty board can land on the same tick.
 */
function oneShotThroughHostTick(w: World): number {
  const victim = toughEnemyNearSeat0(w, 80, 'chewer');
  let t = w.tick + 1;
  while (!castleFiresOnTick(0, t)) t++;
  w.tick = t - 1;
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  const before = w.creatures.get(victim)!.ehp;
  runHostTick(w, hostDeps(), makeHostTickState(w));
  expect(w.tick, 'the host tick advanced onto the fire slot').toBe(t);
  return before - w.creatures.get(victim)!.ehp;
}

/* -------------------------------------------------------------------------------------------- *
 *   1 · the rows exist, in order, and say what the brief says they say
 * -------------------------------------------------------------------------------------------- */

describe('S188 P3 — four castle-stat rows beside regen, in the model and in the drawn panel', () => {
  it('the model returns exactly CASTLE_ROW_KEYS, in order — the index `activate` latches on', () => {
    expect(castleControlsModel(hostWorld(100)).map((r) => r.key)).toEqual([...CASTLE_ROW_KEYS]);
    expect(CASTLE_STAT_ROWS.map((r) => r.stat)).toEqual(['hp', 'atk', 'def', 'pen']);
  });

  it('the constructed panel DRAWS one clickable row per key (the S165 undrawn-row defect)', () => {
    const w = hostWorld(100);
    const m = mountPanel(w);
    const ui = m.panel.getUiPoints();
    expect(ui.rowCenters.map((r) => r.key)).toEqual([...CASTLE_ROW_KEYS]);
    // …and every reported centre is inside the plate the panel reports.
    for (const r of ui.rowCenters) {
      expect(r.y, `${r.key} below the plate top`).toBeGreaterThan(ui.rect!.y);
      expect(r.y, `${r.key} above the plate bottom`).toBeLessThan(ui.rect!.y + ui.rect!.h);
    }
  });

  it('an affordable row shows LEVEL /10, the PRICE, and what the NEXT point buys', () => {
    const w = hostWorld(100);
    const hp = row(w, 'castleHp');
    expect(hp.enabled).toBe(true);
    expect(hp.label).toBe(`HP 0/${CASTLE_UPGRADE_MAX_LEVEL}  ${CASTLE_UPGRADE_PRICE}`);
    expect(hp.detail).toBe(`NEXT +${CASTLE_HP_GAIN_BY_BAND[0]} HP`);
    // ATK / PEN are +1 POINT on the ladder: 5×(5+3)=40 → 6×8=48 and 5×9=45.
    expect(row(w, 'castleAtk').detail).toBe(
      `NEXT +${attackFifths(CASTLE_ATK + 1, CASTLE_PEN) - attackFifths(CASTLE_ATK, CASTLE_PEN)} DAMAGE`,
    );
    expect(row(w, 'castlePen').detail).toBe(
      `NEXT +${attackFifths(CASTLE_ATK, CASTLE_PEN + 1) - attackFifths(CASTLE_ATK, CASTLE_PEN)} DAMAGE`,
    );
    expect(row(w, 'castleDef').detail).toBe('NEXT -17% TAKEN');
  });

  it('⭐ the HP row shows the CURRENT wave band’s gain — 250 on wave 5, 350 on wave 6', () => {
    const w = hostWorld(100);
    w.waveNumber = 5;
    expect(row(w, 'castleHp').detail).toBe('NEXT +250 HP');
    w.waveNumber = 6;
    expect(row(w, 'castleHp').detail).toBe('NEXT +350 HP');
    w.waveNumber = 21;
    expect(row(w, 'castleHp').detail).toBe('NEXT +650 HP');
    // …and the row's number is the preview S187 wrote, never a second calculator.
    expect(row(w, 'castleHp').detail).toBe(`NEXT ${castleUpgradePreview(upgrades(w), 'hp', 21)}`);
  });

  it('every label and every detail FITS its row, in every reachable state', () => {
    const states: World[] = [];
    const add = (f: (w: World) => void): void => {
      const w = hostWorld(100);
      f(w);
      states.push(w);
    };
    add(() => {});
    add((w) => w.scoreByPlayer.set(P0, 0));
    add((w) => {
      const p = w.players.get(P0)!;
      p.castleUpgrades = { hpLevel: 10, hpBonus: 6500, atkLevel: 10, defLevel: 10, penLevel: 10 };
    });
    add((w) => {
      // the widest DAMAGE strings: ATK +1 at PEN 13 is +18, PEN +1 at ATK 14 is +14
      const p = w.players.get(P0)!;
      p.castleUpgrades = { hpLevel: 9, hpBonus: 5850, atkLevel: 9, defLevel: 9, penLevel: 9 };
      w.waveNumber = 25;
    });
    add((w) => { w.players.get(P0)!.castleHp = 0; });
    add((w) => { w.players.get(P0)!.benchedUntilTick = w.tick + 999; });
    for (const w of states) {
      for (const r of castleControlsModel(w)) {
        expect(r.label.length * ROW_FONT_ADVANCE, `"${r.label}"`).toBeLessThanOrEqual(ROW_INNER_W);
        expect((r.detail ?? '').length * ROW_DETAIL_FONT_ADVANCE, `"${r.detail}"`).toBeLessThanOrEqual(ROW_INNER_W);
      }
    }
    const notYours = castleControlsModel(hostWorld(100), P1);
    for (const r of notYours) {
      expect(r.label.length * ROW_FONT_ADVANCE, `"${r.label}"`).toBeLessThanOrEqual(ROW_INNER_W);
    }
  });

  it('⚠ the three original rows are untouched: no detail line, same labels', () => {
    const w = hostWorld(100);
    for (const key of ['buyGatherer', 'upgradeSpeed', 'castleRegen'] as const) {
      expect(row(w, key).detail, key).toBeUndefined();
    }
    expect(row(w, 'castleRegen').label).toBe('REGEN 0→1  100');
  });
});

/* -------------------------------------------------------------------------------------------- *
 *   2 · REACH — a press → the intent → the reducer → VP spent, level up, effect in the host tick
 * -------------------------------------------------------------------------------------------- */

describe('S188 P3 — REACH: pressing each button spends, levels, and changes the game', () => {
  for (const { key, stat } of CASTLE_STAT_ROWS) {
    it(`pressing ${key} sends UPGRADE_CASTLE_STAT '${stat}', spends ${CASTLE_UPGRADE_PRICE} and levels that axis only`, () => {
      const w = hostWorld(250);
      const m = mountPanel(w);
      press(m, w, key);
      expect(m.sent).toEqual([{ type: 'UPGRADE_CASTLE_STAT', stat }]);
      expect(w.scoreByPlayer.get(P0)).toBe(250 - CASTLE_UPGRADE_PRICE);
      const u = upgrades(w);
      const levels = { hp: u.hpLevel, atk: u.atkLevel, def: u.defLevel, pen: u.penLevel };
      for (const s of ['hp', 'atk', 'def', 'pen'] as const) {
        expect(levels[s], `${s} after pressing ${key}`).toBe(s === stat ? 1 : 0);
      }
      // …and the row reads the new level back on the next frame.
      m.panel.sync(w);
      const word = CASTLE_STAT_ROWS.find((r) => r.key === key)!.word;
      expect(row(w, key).label).toBe(`${word} 1/${CASTLE_UPGRADE_MAX_LEVEL}  ${CASTLE_UPGRADE_PRICE}`);
    });
  }

  it('⛔ each row buys ITS stat — the old index chain would have sent every new row to REGEN', () => {
    const w = hostWorld(1000);
    const m = mountPanel(w);
    for (const { key } of CASTLE_STAT_ROWS) press(m, w, key);
    expect(m.sent.map((s) => s.stat)).toEqual(['hp', 'atk', 'def', 'pen']);
    expect(w.players.get(P0)!.castleRegenLevel, 'no stat press bought regen').toBe(0);
  });

  it('⭐ HP: the pool rises by the BAND gain, and the real host tick heals the keep up to it', () => {
    const measure = (buyHp: boolean, wave: number): number => {
      const w = hostWorld(1000);
      w.waveNumber = wave;
      const m = mountPanel(w);
      press(m, w, 'castleRegen'); // regen is what can heal a keep above where it stands
      if (buyHp) press(m, w, 'castleHp');
      expect(w.players.get(P0)!.castleHp).toBe(CASTLE_MAX_HP);
      const d = hostDeps();
      const st = makeHostTickState(w);
      for (let i = 0; i < 60 * 30; i++) runHostTick(w, d, st); // 30 s — well past the 10–14 s needed
      return w.players.get(P0)!.castleHp;
    };
    expect(measure(false, 1), 'no HP bought: the keep is already at its ceiling').toBe(CASTLE_MAX_HP);
    expect(measure(true, 1), 'wave 1: +250, healed to exactly the new ceiling').toBe(CASTLE_MAX_HP + 250);
    expect(measure(true, 6), 'wave 6: +350 — the band is read on the purchase wave').toBe(CASTLE_MAX_HP + 350);
  });

  it('⭐ ATK: the castle’s shot, measured on the victim through the real host tick, rises 40 → 48', () => {
    const plain = hostWorld(0, 'FIGHT');
    expect(oneShotThroughHostTick(plain)).toBe(castleShotFifths());

    const w = hostWorld(CASTLE_UPGRADE_PRICE, 'FIGHT');
    press(mountPanel(w), w, 'castleAtk');
    expect(upgrades(w).atkLevel).toBe(1);
    expect(oneShotThroughHostTick(w)).toBe(attackFifths(CASTLE_ATK + 1, CASTLE_PEN));
    expect(castleShotFifthsFor(upgrades(w)), 'the helper the gun reads agrees').toBe(48);
  });

  it('⭐ PEN: the same shot on the ladder, 5 × (5 + 4) = 45', () => {
    const w = hostWorld(CASTLE_UPGRADE_PRICE, 'FIGHT');
    press(mountPanel(w), w, 'castlePen');
    expect(upgrades(w).penLevel).toBe(1);
    expect(oneShotThroughHostTick(w)).toBe(attackFifths(CASTLE_ATK, CASTLE_PEN + 1));
  });

  it('⭐ DEF: a goblin’s swings on the keep cost HALF as much at DEF 5, through the real host tick', () => {
    const lossOver = (defPresses: number): number => {
      const w = hostWorld(CASTLE_UPGRADE_PRICE * defPresses, 'FIGHT');
      const m = mountPanel(w);
      for (let i = 0; i < defPresses; i++) press(m, w, 'castleDef');
      expect(upgrades(w).defLevel).toBe(defPresses);
      toughEnemyNearSeat0(w, 20, 'goblinMelee');
      const d = hostDeps();
      const st = makeHostTickState(w);
      for (let i = 0; i < 600; i++) runHostTick(w, d, st);
      return CASTLE_MAX_HP - w.players.get(P0)!.castleHp;
    };
    const plain = lossOver(0);
    const armed = lossOver(5);
    expect(plain, 'the fixture must actually land swings').toBeGreaterThan(0);
    // 12 a swing → floor(12 × 5 / 10) = 6: the SAME swings, each exactly half.
    expect(armed * 2).toBe(plain);
  });
});

/* -------------------------------------------------------------------------------------------- *
 *   3 · a negative test per disabled reason — the row SAYS why, a press sends NOTHING, and the
 *       sim refuses it too where the sim has its own gate
 * -------------------------------------------------------------------------------------------- */

describe('S188 P3 — every disabled state names its reason and buys nothing', () => {
  /** Press every stat row on `w` and assert nothing was sent and nothing was spent or levelled. */
  const pressAllAndExpectNothing = (w: World, seat?: PlayerId): void => {
    const score = w.scoreByPlayer.get(P0);
    const before = { ...upgrades(w) };
    const m = mountPanel(w, seat);
    for (const { key } of CASTLE_STAT_ROWS) press(m, w, key);
    expect(m.sent, 'a disabled row dispatches nothing').toEqual([]);
    expect(w.scoreByPlayer.get(P0)).toBe(score);
    expect(upgrades(w)).toEqual(before);
  };

  it(`CAN'T AFFORD — 'NEED ${CASTLE_UPGRADE_PRICE}', and it still shows what the point would buy`, () => {
    const w = hostWorld(CASTLE_UPGRADE_PRICE - 1);
    for (const { key } of CASTLE_STAT_ROWS) {
      expect(row(w, key).enabled).toBe(false);
      expect(row(w, key).reason).toBe(`NEED ${CASTLE_UPGRADE_PRICE}`);
      expect(row(w, key).detail).toMatch(/^NEXT /);
    }
    pressAllAndExpectNothing(w);
    // the reducer refuses it on its own, too
    dispatch(w, { type: 'UPGRADE_CASTLE_STAT', playerId: P0, stat: 'hp' });
    expect(upgrades(w).hpLevel).toBe(0);
    expect(w.scoreByPlayer.get(P0)).toBe(CASTLE_UPGRADE_PRICE - 1);
  });

  it('CAP — ten on an axis says MAX, the others stay live', () => {
    const w = hostWorld(10_000);
    w.players.get(P0)!.castleUpgrades = { hpLevel: 0, hpBonus: 0, atkLevel: 10, defLevel: 0, penLevel: 0 };
    const atk = row(w, 'castleAtk');
    expect(atk.enabled).toBe(false);
    expect(atk.reason).toBe('MAX');
    expect(atk.label).toBe(`ATK 10/${CASTLE_UPGRADE_MAX_LEVEL}  MAX`);
    expect(atk.detail).toBe('');
    expect(row(w, 'castleHp').enabled, 'a capped axis does not lock the others').toBe(true);
    const m = mountPanel(w);
    press(m, w, 'castleAtk');
    expect(m.sent).toEqual([]);
    expect(w.scoreByPlayer.get(P0)).toBe(10_000);
    dispatch(w, { type: 'UPGRADE_CASTLE_STAT', playerId: P0, stat: 'atk' });
    expect(upgrades(w).atkLevel, 'the reducer holds the cap too').toBe(10);
  });

  it('BENCHED — LOCKED (the regen template), and the host’s bench gate denies the intent', () => {
    const w = hostWorld(1000);
    w.players.get(P0)!.benchedUntilTick = w.tick + 600;
    for (const { key } of CASTLE_STAT_ROWS) expect(row(w, key).reason).toBe('LOCKED');
    pressAllAndExpectNothing(w);
    dispatch(w, { type: 'UPGRADE_CASTLE_STAT', playerId: P0, stat: 'def' });
    expect(upgrades(w).defLevel, 'benchGate denies UPGRADE_CASTLE_STAT at dispatch').toBe(0);
    expect(w.scoreByPlayer.get(P0)).toBe(1000);
  });

  it('A NONET TRIAL — LOCKED, like every other row in the panel', () => {
    const w = hostWorld(1000);
    w.sudoku = {} as unknown as typeof w.sudoku;
    for (const { key } of CASTLE_STAT_ROWS) expect(row(w, key).reason).toBe('LOCKED');
  });

  it('ELIMINATED — CASTLE LOST (R131), and the reducer refuses a fallen keep', () => {
    const w = hostWorld(1000);
    w.players.get(P0)!.castleHp = 0;
    for (const { key } of CASTLE_STAT_ROWS) {
      expect(row(w, key).reason).toBe('CASTLE LOST');
      expect(row(w, key).detail, 'no amount of points buys this').toBe('');
    }
    pressAllAndExpectNothing(w);
    dispatch(w, { type: 'UPGRADE_CASTLE_STAT', playerId: P0, stat: 'hp' });
    expect(upgrades(w).hpLevel).toBe(0);
  });

  it('NOT YOUR CASTLE — a panel open on another seat’s keep offers no castle purchase', () => {
    const w = hostWorld(1000);
    for (const { key } of CASTLE_STAT_ROWS) {
      expect(row(w, key, P1).enabled).toBe(false);
      expect(row(w, key, P1).reason).toBe('NOT YOURS');
    }
    pressAllAndExpectNothing(w, P1);
    expect(upgrades(w, P1)).toEqual({ hpLevel: 0, hpBonus: 0, atkLevel: 0, defLevel: 0, penLevel: 0 });
  });

  it('NOT YOUR CASTLE, on the wire — an intent claiming another seat buys for the SENDER only', () => {
    const w = hostWorld(1000);
    w.scoreByPlayer.set(P1, 1000);
    // What the host does to every remote INTENT before it dispatches (`hostHandlers.ts`).
    const stamped = stampSenderSeat({ type: 'UPGRADE_CASTLE_STAT', playerId: P1, stat: 'hp' }, P0);
    dispatch(w, stamped);
    expect(upgrades(w, P1).hpLevel, 'the named seat is untouched').toBe(0);
    expect(w.scoreByPlayer.get(P1)).toBe(1000);
    expect(upgrades(w, P0).hpLevel, 'the sender paid for its own keep').toBe(1);
  });

  it('a seat with no player at all (a mirror before its roster) is NOT YOURS, not a price', () => {
    const w = hostWorld(1000);
    w.localPlayerId = asPlayerId(7);
    for (const { key } of CASTLE_STAT_ROWS) expect(row(w, key).reason).toBe('NOT YOURS');
  });
});

/* -------------------------------------------------------------------------------------------- *
 *   4 · the character sheet reads the purchases
 * -------------------------------------------------------------------------------------------- */

describe('S188 P3 — the castle card shows the upgraded HP / ATK / DEF / PEN', () => {
  it('after one press on each: bar max 2750, ATK 6 at 48 a shot, PEN 4, DEF 1', () => {
    const w = hostWorld(1000);
    const m = mountPanel(w);
    const defPromise = row(w, 'castleDef').detail!; // what the DEF button promised
    for (const { key } of CASTLE_STAT_ROWS) press(m, w, key);
    const view = characterSheetModel(w, P0, { kind: 'castle', seat: P0 })!;
    expect(view.health.max).toBe(CASTLE_MAX_HP + CASTLE_HP_GAIN_BY_BAND[0]!);
    expect(view.health.max).toBe(castleMaxHpFor(upgrades(w)));
    const stat = (label: string) => view.stats.find((r) => r.label === label)!;
    expect(stat('ATK').points).toBe(CASTLE_ATK + 1);
    expect(stat('ATK').derived).toBe(`${castleShotFifthsFor(upgrades(w))} a shot`);
    expect(stat('PEN').points).toBe(CASTLE_PEN + 1);
    expect(stat('DEF').points).toBe(1);
    // ⭐ the card says, lower-cased, exactly what the button said "NEXT" would be bought
    expect(stat('DEF').derived).toBe(defPromise.replace(/^NEXT /, '').toLowerCase());
  });

  it('the DEF readout agrees with the button’s promise at EVERY level, 1–10', () => {
    for (let lvl = 1; lvl <= CASTLE_UPGRADE_MAX_LEVEL; lvl++) {
      const w = hostWorld(0);
      const p = w.players.get(P0)!;
      p.castleUpgrades = { ...p.castleUpgrades, defLevel: lvl - 1 };
      const promised = castleUpgradePreview(p.castleUpgrades, 'def', 1);
      p.castleUpgrades = { ...p.castleUpgrades, defLevel: lvl };
      const view = characterSheetModel(w, P0, { kind: 'castle', seat: P0 })!;
      expect(view.stats.find((r) => r.label === 'DEF')!.derived, `level ${lvl}`).toBe(promised.toLowerCase());
    }
  });

  it('an ENEMY keep’s card shows ITS purchases, not the viewer’s', () => {
    const w = hostWorld(0);
    w.players.get(P1)!.castleUpgrades = { hpLevel: 1, hpBonus: 350, atkLevel: 2, defLevel: 0, penLevel: 0 };
    const view = characterSheetModel(w, P0, { kind: 'castle', seat: P1 })!;
    expect(view.health.max).toBe(CASTLE_MAX_HP + 350);
    expect(view.stats.find((r) => r.label === 'ATK')!.points).toBe(CASTLE_ATK + 2);
    const mine = characterSheetModel(w, P0, { kind: 'castle', seat: P0 })!;
    expect(mine.health.max).toBe(CASTLE_MAX_HP);
  });

  it('the merged castle window (card + panel) still fits the canvas for every seat', () => {
    for (const layout of ['PITCH_2P', 'QUADRANTS_4P'] as const) {
      const w = hostWorld(0);
      w.layout = layout;
      const seats = layout === 'PITCH_2P' ? [0, 1] : [0, 1, 2, 3];
      for (const s of seats) {
        const seat = asPlayerId(s);
        // the bottom 4P keeps (y = 950) are the case that clamps, so they are seated, not skipped
        if (!w.players.has(seat)) w.players.set(seat, makeIdlePlayer(seat, 0x9fc4e8, { x: 0, y: 0 }));
        const view = characterSheetModel(w, seat, { kind: 'castle', seat })!;
        const m = mountPanel(w, seat);
        m.panel.setDock(view.rect);
        m.panel.sync(w);
        const rect = m.panel.getUiPoints().rect!;
        expect(view.rect.y, `${layout} seat ${s} card top`).toBeGreaterThanOrEqual(0);
        expect(rect.y, `${layout} seat ${s}: the panel docks flush under the card`).toBe(view.rect.y + view.rect.h);
        expect(rect.y + rect.h, `${layout} seat ${s} panel bottom`).toBeLessThanOrEqual(1080);
      }
    }
  });
});

/* -------------------------------------------------------------------------------------------- *
 *   5 · the mechanical guards: the fill enumeration, and the main.ts wire
 * -------------------------------------------------------------------------------------------- */

describe('⛔ the S182 fill enumeration, applied to castlePanel.ts', () => {
  /**
   * Every opaque `.fill({` in the module, and what hit-tests it. S188 P3 added FOUR ROWS and ZERO
   * fills: the new rows are drawn by the row loop's existing plate, so they inherit its hit-test
   * (the box's Graphics child) — and `press()` above proves each one is reached through it.
   */
  const FILLS: ReadonlyArray<{ what: string; hitTest: string }> = [
    { what: 'the panel plate', hitTest: 'CastlePanel.isOverPanel — controls.ts swallows the click' },
    { what: 'a bank / inventory slot', hitTest: 'slot box pointertap -> pull()' },
    { what: 'a build tile (grid disabled since S149 P5)', hitTest: 'tile box pointertap -> armTile()' },
    { what: 'a control row — all seven, castle stats included', hitTest: 'row box pointertap -> activate()' },
  ];

  it('the module contains exactly the enumerated opaque fills, and no more', () => {
    const src = readFileSync(new URL('./castlePanel.ts', import.meta.url), 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    const fills = code.match(/\.fill\(\{/g) ?? [];
    expect(
      fills.length,
      'A new opaque surface appeared in castlePanel.ts. Add it to FILLS with the hit-test it pairs ' +
        'with, or say in writing that it is decorative.',
    ).toBe(FILLS.length);
  });
});

describe('⛔ the main.ts wire (a tripwire — a dropped patch here breaks no behaviour test)', () => {
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');

  it('main.ts injects the UPGRADE_CASTLE_STAT dispatch for the local seat, through dispatchFn', () => {
    const at = main.indexOf('castlePanel.setCastleStatHandler((stat) => {');
    expect(at, 'the handler is injected').toBeGreaterThan(-1);
    expect(main.slice(at, at + 200)).toContain(
      "dispatchFn({ type: 'UPGRADE_CASTLE_STAT', playerId: world.localPlayerId, stat });",
    );
  });

  it('⛔ and it is NOT optimistically predicted (the regen rule)', () => {
    const start = main.indexOf('const PREDICTABLE_ACTIONS');
    const set = main.slice(start, main.indexOf(']);', start));
    expect(set).not.toContain('UPGRADE_CASTLE_STAT');
  });
});
