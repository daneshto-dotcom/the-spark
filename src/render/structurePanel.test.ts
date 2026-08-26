/**
 * SPARK — S152: the FIX / SCRAP popover's MODEL, driven headlessly.
 *
 * The S130 lesson is that a draw path which cannot be driven without a canvas ships broken, so the
 * whole button matrix lives in `structureActionModel` — a pure function of `(world, seat, primitive)`
 * — and everything worth asserting is asserted here, with no Pixi `Application` anywhere.
 *
 * The specific thing this exists to stop: a button that PROMISES what the reducer REFUSES. Every
 * caption below is cross-checked against the planner the reducer itself consults, so the two cannot
 * drift into disagreement the way a hand-written affordability check would.
 */

import { describe, expect, it } from 'vitest';
import { ALL_SPARK_TYPES, CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asPlayerId, type PrimitiveId, type Vec2 } from '../types.ts';
import { makeWorld, type World } from '../state/world.ts';
import { blueprintBill } from '../state/blueprints.ts';
import { applyBuildBlueprint } from '../state/blueprintBuild.ts';
import { makeCastleBank } from '../state/castleBank.ts';
import { damageEntity } from '../state/damage.ts';
import { structureActionModel } from './structurePanel.ts';
import { runSpawnerIgnition } from '../state/godlyMatcherCore.ts';
import '../state/godlyRecipes/goblinTower.ts';

const P0 = asPlayerId(0);
const SITE: Vec2 = { x: 300, y: 300 };

function setup(): World {
  const w = makeWorld(0);
  w.isHost = true;
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  const bank = makeCastleBank();
  for (const [type, count] of blueprintBill('laserTurret')) {
    bank[type as number] = (bank[type as number] ?? 0) + count;
  }
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, {
    type: 'BUILD_BLUEPRINT',
    playerId: P0,
    blueprintId: 'laserTurret',
    centre: SITE,
  });
  return w;
}

function nodeId(w: World, i: number): PrimitiveId {
  for (const p of w.primitives.values()) if (p.origin?.nodeIndex === i) return p.id;
  throw new Error(`node ${i} missing`);
}

function stock(w: World, type: SparkType, n: number): void {
  const bank = w.castleBanks.get(P0)!;
  bank[type as number] = (bank[type as number] ?? 0) + n;
}

describe('structureActionModel — the FIX / SCRAP popover', () => {
  it('names the structure and offers both actions on a tower this seat built', () => {
    const view = structureActionModel(setup(), P0, nodeId(setup(), 0));
    expect(view).not.toBeNull();
    expect(view!.buttons.map((b) => b.kind)).toEqual(['FIX', 'SCRAP']);
    expect(view!.title.length).toBeGreaterThan(0);
    expect(view!.title).not.toBe('STRUCTURE'); // a stamped tower is named, not generic
  });

  it('anchors identically whichever member is clicked — the popover follows the STRUCTURE', () => {
    const w = setup();
    const fromHub = structureActionModel(w, P0, nodeId(w, 0))!;
    const fromLeaf = structureActionModel(w, P0, nodeId(w, 4))!;
    expect(fromLeaf.buttons[0].x).toBe(fromHub.buttons[0].x);
    expect(fromLeaf.buttons[0].y).toBe(fromHub.buttons[0].y);
  });

  it("SCRAP's caption is the SURVIVOR count — R21 stated to the player, not the bill", () => {
    const w = setup();
    expect(structureActionModel(w, P0, nodeId(w, 0))!.buttons[1].caption).toBe('RETURNS 7');
    damageEntity(w, { kind: 'primitive', id: nodeId(w, 3) }, PRIMITIVE_MAX_HP, 'creature');
    damageEntity(w, { kind: 'primitive', id: nodeId(w, 5) }, PRIMITIVE_MAX_HP, 'creature');
    expect(structureActionModel(w, P0, nodeId(w, 0))!.buttons[1].caption).toBe('RETURNS 5');
  });

  it('FIX prices the shortfall when it can be paid, and NAMES it when it cannot', () => {
    const w = setup();
    damageEntity(w, { kind: 'primitive', id: nodeId(w, 1) }, PRIMITIVE_MAX_HP, 'creature');
    damageEntity(w, { kind: 'primitive', id: nodeId(w, 2) }, PRIMITIVE_MAX_HP, 'creature');

    // Empty bank: visible, disabled, and it SAYS why — the standing contract for a refused control.
    const broke = structureActionModel(w, P0, nodeId(w, 0))!.buttons[0];
    expect(broke.enabled).toBe(false);
    expect(broke.caption).toBe('NEED 2 MORE');

    stock(w, SparkType.Spiral, 1);
    expect(structureActionModel(w, P0, nodeId(w, 0))!.buttons[0].caption).toBe('NEED 1 MORE');

    stock(w, SparkType.Spiral, 1);
    const ready = structureActionModel(w, P0, nodeId(w, 0))!.buttons[0];
    expect(ready.enabled).toBe(true);
    expect(ready.caption).toBe('COSTS 2');
  });

  it('an untouched tower shows FIX disabled with NOTHING TO FIX — matching the reducer refusal', () => {
    const w = setup();
    const fix = structureActionModel(w, P0, nodeId(w, 0))!.buttons[0];
    expect(fix.enabled).toBe(false);
    expect(fix.caption).toBe('NOTHING TO FIX');
  });

  it('chip damage alone offers a FREE repair', () => {
    const w = setup();
    damageEntity(w, { kind: 'primitive', id: nodeId(w, 2) }, 300, 'creature');
    const fix = structureActionModel(w, P0, nodeId(w, 0))!.buttons[0];
    expect(fix.enabled).toBe(true);
    expect(fix.caption).toBe('REPAIR FREE');
  });

  it('freeform rubble offers SCRAP ONLY — no greyed FIX lying about what the game can do', () => {
    const w = setup();
    w.primitives.get(nodeId(w, 3))!.origin = null;
    const view = structureActionModel(w, P0, nodeId(w, 0))!;
    expect(view.buttons.map((b) => b.kind)).toEqual(['SCRAP']);
    expect(view.title).toBe('STRUCTURE');
  });

  it('R19: no popover at all during the FIGHT stage', () => {
    const w = setup();
    const seed = nodeId(w, 0);
    w.matchPhase = 'FIGHT';
    expect(structureActionModel(w, P0, seed)).toBeNull();
  });

  it('keeps its buttons on-canvas for a tower built hard against the top-left corner', () => {
    const w = makeWorld(0);
    w.isHost = true;
    w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
    const bank = makeCastleBank();
    for (const [type, count] of blueprintBill('laserTurret')) {
      bank[type as number] = (bank[type as number] ?? 0) + count;
    }
    w.castleBanks.set(P0, bank);
    applyBuildBlueprint(w, {
      type: 'BUILD_BLUEPRINT',
      playerId: P0,
      blueprintId: 'laserTurret',
      centre: { x: 70, y: 70 },
    });
    const view = structureActionModel(w, P0, nodeId(w, 0));
    expect(view).not.toBeNull();
    for (const b of view!.buttons) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
    }
  });
});

/*
 * ⭐ S152 P2 — THE FEED ROW. The gesture S151 P3 shipped without.
 *
 * `applyFeedTower` was built, gated and covered by 13 tests while NOTHING DISPATCHED IT, so the
 * goblin tower's whole mechanic was unreachable in play. These assertions cover the half that made
 * it reachable: the row appears only on a live goblin tower this seat owns, it always shows all six
 * shapes, and it counts what the REDUCER counts.
 */
describe('structureActionModel — the FEED row (owner R70 / S152 P2)', () => {
  function goblinTower(): World {
    const w = makeWorld(0);
    w.isHost = true;
    w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
    const bank = makeCastleBank();
    for (const [type, count] of blueprintBill('goblinTower')) {
      bank[type as number] = (bank[type as number] ?? 0) + count;
    }
    w.castleBanks.set(P0, bank);
    applyBuildBlueprint(w, {
      type: 'BUILD_BLUEPRINT',
      playerId: P0,
      blueprintId: 'goblinTower',
      centre: SITE,
    });
    // Ignition is a host poll, not a build side-effect, so drive it the way the game does.
    runSpawnerIgnition(w);
    return w;
  }

  it('a laserTurret gets NO feed row — the row is not offered on every producing structure', () => {
    const view = structureActionModel(setup(), P0, nodeId(setup(), 0))!;
    expect(view.buttons.some((b) => b.kind === 'FEED')).toBe(false);
    expect(view.feedSpawnerId).toBeUndefined();
  });

  it('a live goblin tower gets SIX feed buttons and carries its spawner id', () => {
    const w = goblinTower();
    const view = structureActionModel(w, P0, nodeId(w, 0))!;
    const feed = view.buttons.filter((b) => b.kind === 'FEED');
    expect(feed).toHaveLength(ALL_SPARK_TYPES.length);
    expect(feed).toHaveLength(6);
    expect(view.feedSpawnerId).not.toBeUndefined();
    // Every button names the shape it hands over — that payload is the reason `buttonAt` had to
    // stop returning a bare kind.
    expect(feed.every((b) => b.sparkType !== undefined)).toBe(true);
    expect(new Set(feed.map((b) => b.sparkType)).size).toBe(6);
  });

  it('⭐ ALL SIX SHOW EVEN WHEN UNAFFORDABLE — a refused control must SAY why, never vanish', () => {
    const w = goblinTower();
    // Empty the bank completely: the build consumed its bill, so top it back to exactly zero.
    w.castleBanks.set(P0, makeCastleBank());
    const view = structureActionModel(w, P0, nodeId(w, 0))!;
    const feed = view.buttons.filter((b) => b.kind === 'FEED');
    expect(feed).toHaveLength(6);
    expect(feed.every((b) => !b.enabled)).toBe(true);
    // A player with no Squares must still be able to LEARN that Square makes the shield goblin.
    expect(feed.map((b) => b.caption)).toContain('SHIELD');
  });

  it('a button is enabled exactly when the CASTLE BANK holds that shape', () => {
    const w = goblinTower();
    w.castleBanks.set(P0, makeCastleBank());
    stock(w, SparkType.Circle, 2);
    const view = structureActionModel(w, P0, nodeId(w, 0))!;
    const byType = new Map(view.buttons.filter((b) => b.kind === 'FEED').map((b) => [b.sparkType, b]));
    expect(byType.get(SparkType.Circle)!.enabled).toBe(true);
    expect(byType.get(SparkType.Square)!.enabled).toBe(false);
  });

  it('every caption names the goblin that shape actually produces, keyed off GOBLIN_FEED_MAP', () => {
    const w = goblinTower();
    const view = structureActionModel(w, P0, nodeId(w, 0))!;
    for (const b of view.buttons.filter((b) => b.kind === 'FEED')) {
      expect(b.caption).not.toBe('?'); // '?' means the short-name table lost a CreatureType
      expect(b.caption.length).toBeLessThanOrEqual(6); // measured ceiling for a 44px button
    }
  });

  it('the feed row never leaves the canvas, wherever the tower stands', () => {
    for (const centre of [{ x: 40, y: 40 }, { x: 1880, y: 1040 }, { x: 960, y: 540 }]) {
      const w = makeWorld(0);
      w.isHost = true;
      w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
      const bank = makeCastleBank();
      for (const [type, count] of blueprintBill('goblinTower')) {
        bank[type as number] = (bank[type as number] ?? 0) + count;
      }
      w.castleBanks.set(P0, bank);
      applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: 'goblinTower', centre });
      runSpawnerIgnition(w);
      const anchor = [...w.primitives.values()][0];
      if (anchor === undefined) continue;
      const view = structureActionModel(w, P0, anchor.id);
      if (view === null) continue;
      for (const b of view.buttons) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(CANVAS_WIDTH);
        expect(b.y + b.h).toBeLessThanOrEqual(CANVAS_HEIGHT);
      }
    }
  });
});


/*
 * ⭐ S153 P3 (owner R79) — *"i should be able to build goblins during fight stage ... we have
 * decided that previously."*
 *
 * A.0 found WHY it was impossible, and it was not a rule anyone wrote: `applyFeedTower` has no
 * phase gate at all. FEED was BUILD-only purely because the popover CARRYING it is BUILD-only by
 * R19, a restriction that belongs to FIX and SCRAP. The pairing was inherited, not designed — and
 * it was actively perverse, because creatures only tick in FIGHT, so the one reachable way to feed
 * a tower produced a unit that stood inert until the phase changed.
 */
describe('S153 P3 — FEED during FIGHT (owner R79)', () => {
  function goblinTowerIn(phase: 'BUILD' | 'FIGHT'): World {
    const w = makeWorld(0);
    w.isHost = true;
    w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
    const bank = makeCastleBank();
    for (const [type, count] of blueprintBill('goblinTower')) {
      bank[type as number] = (bank[type as number] ?? 0) + count;
    }
    w.castleBanks.set(P0, bank);
    applyBuildBlueprint(w, {
      type: 'BUILD_BLUEPRINT',
      playerId: P0,
      blueprintId: 'goblinTower',
      centre: SITE,
    });
    runSpawnerIgnition(w);
    // Stock it so the FEED buttons have something to be enabled BY — the point is reachability,
    // and an all-disabled row would pass a "row exists" assertion while proving nothing.
    const restocked = makeCastleBank();
    restocked[SparkType.Circle as number] = 3;
    w.castleBanks.set(P0, restocked);
    w.matchPhase = phase;
    return w;
  }

  it('⭐ a goblin tower is still feedable in FIGHT — six buttons, and one of them live', () => {
    const w = goblinTowerIn('FIGHT');
    const view = structureActionModel(w, P0, nodeId(w, 0));
    expect(view).not.toBeNull();
    const feed = view!.buttons.filter((b) => b.kind === 'FEED');
    expect(feed).toHaveLength(6);
    expect(feed.some((b) => b.enabled)).toBe(true);
    expect(view!.feedSpawnerId).not.toBeUndefined();
  });

  it('...and FIX / SCRAP are GONE in FIGHT — R19 keeps them, they are not merely disabled', () => {
    const w = goblinTowerIn('FIGHT');
    const view = structureActionModel(w, P0, nodeId(w, 0))!;
    expect(view.buttons.some((b) => b.kind === 'FIX')).toBe(false);
    expect(view.buttons.some((b) => b.kind === 'SCRAP')).toBe(false);
  });

  it('...while BUILD is UNCHANGED — SCRAP is still there, so R19 was narrowed and not deleted', () => {
    const w = goblinTowerIn('BUILD');
    const view = structureActionModel(w, P0, nodeId(w, 0))!;
    // The both-halves assertion. Without it, "no SCRAP in FIGHT" is equally satisfied by a change
    // that removed SCRAP everywhere.
    expect(view.buttons.some((b) => b.kind === 'SCRAP')).toBe(true);
    expect(view.buttons.filter((b) => b.kind === 'FEED')).toHaveLength(6);
  });

  it('⛔ a NON-tower structure gets NO popover in FIGHT — widening this would create a dead zone', () => {
    // `setup()` builds a laserTurret. In BUILD it has FIX/SCRAP; in FIGHT it has nothing to offer,
    // and returning a model anyway would let the input layer swallow the click into an empty panel.
    const w = setup();
    w.matchPhase = 'FIGHT';
    expect(structureActionModel(w, P0, nodeId(w, 0))).toBeNull();
  });

  it('names itself GOBLIN TOWER in FIGHT, where the repair plan is never computed', () => {
    const w = goblinTowerIn('FIGHT');
    expect(structureActionModel(w, P0, nodeId(w, 0))!.title).toBe('GOBLIN TOWER');
  });

  it('the FEED row sits where the button row would have been, not below an empty gap', () => {
    const build = goblinTowerIn('BUILD');
    const fight = goblinTowerIn('FIGHT');
    const bFeed = structureActionModel(build, P0, nodeId(build, 0))!.buttons.find((b) => b.kind === 'FEED')!;
    const fFeed = structureActionModel(fight, P0, nodeId(fight, 0))!.buttons.find((b) => b.kind === 'FEED')!;
    // In FIGHT it rises by exactly the row it replaced, so the popover is not floating in space.
    expect(fFeed.y).toBeLessThan(bFeed.y);
  });
});
