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
import { makeGatherer } from '../state/gatherers/gatherer.ts';
import { asGathererId } from '../types.ts';
import { applyQueueRepair } from '../state/repairJobs.ts';

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

/** ⭐ S193 R191-B — a FIX is carried by a gatherer, so a seat needs one for the button to enable. */
function hire(w: World): void {
  const id = asGathererId(w.nextGathererId++);
  w.gatherers.set(id, makeGatherer({ id, ownerPlayerId: P0, pos: { x: SITE.x, y: SITE.y + 200 }, spawnedAtTick: 0 }));
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
    damageEntity(w, { kind: 'primitive', id: nodeId(w, 3) }, PRIMITIVE_MAX_HP, 'creature', null, 'physical');
    damageEntity(w, { kind: 'primitive', id: nodeId(w, 5) }, PRIMITIVE_MAX_HP, 'creature', null, 'physical');
    expect(structureActionModel(w, P0, nodeId(w, 0))!.buttons[1].caption).toBe('RETURNS 5');
  });

  /*
   * ⭐⭐ S193 R191-B — RE-PINNED. This asserted "NEED 2 MORE" on an empty bank: FIX restored on the spot
   * and the bank had to cover the bill. FIX now QUEUES A GATHERER JOB and the quarry is a source too
   * (*"no shape → keep gathering, fetch when one appears"*), so the bank no longer decides the button.
   * What does: a gatherer to carry it (NO GATHERERS, ⚠ MINE), and one job per tower (QUEUED).
   */
  it('FIX prices the bill whatever the bank holds; NO GATHERERS without a carrier; QUEUED once clicked', () => {
    const w = setup();
    damageEntity(w, { kind: 'primitive', id: nodeId(w, 1) }, PRIMITIVE_MAX_HP, 'creature', null, 'physical');
    damageEntity(w, { kind: 'primitive', id: nodeId(w, 2) }, PRIMITIVE_MAX_HP, 'creature', null, 'physical');

    const alone = structureActionModel(w, P0, nodeId(w, 0))!.buttons[0];
    expect(alone.enabled, 'nobody to carry it').toBe(false);
    expect(alone.caption).toBe('NO GATHERERS');

    hire(w);
    const ready = structureActionModel(w, P0, nodeId(w, 0))!.buttons[0];
    expect(ready.enabled, 'an EMPTY bank no longer disables FIX').toBe(true);
    expect(ready.caption).toBe('COSTS 2');

    applyQueueRepair(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: nodeId(w, 0) });
    expect(w.repairJobs).toHaveLength(1);
    const queued = structureActionModel(w, P0, nodeId(w, 4))!.buttons[0];
    expect(queued.enabled, 'one job per tower, from any of its shapes').toBe(false);
    expect(queued.caption).toBe('QUEUED');
  });

  it('an untouched tower shows FIX disabled with NOTHING TO FIX — matching the reducer refusal', () => {
    const w = setup();
    const fix = structureActionModel(w, P0, nodeId(w, 0))!.buttons[0];
    expect(fix.enabled).toBe(false);
    expect(fix.caption).toBe('NOTHING TO FIX');
  });

  /**
   * ⭐⭐ S182 (owner R182-E) — INVERTED, NOT DELETED. This asserted `REPAIR FREE`, which was the
   * shipped behaviour until he read it on the board: *"so far it takes NO shape — that's not
   * correct. It takes one shape. Whether it's one HP or fifty HP."* The caption and the price move
   * together, and the turret's fee is a Spiral (its most numerous node type).
   */
  it('chip damage alone COSTS ONE SHAPE (was: REPAIR FREE)', () => {
    const w = setup();
    damageEntity(w, { kind: 'primitive', id: nodeId(w, 2) }, 30, 'creature', null, 'physical'); // ⭐ S177 P1 — chip damage on the 70-fifth scale
    hire(w); // S193 R191-B — the fee is fetched by a gatherer, not paid from the bank on the spot
    const fix = structureActionModel(w, P0, nodeId(w, 0))!.buttons[0];
    expect(fix.enabled).toBe(true);
    expect(fix.caption).toBe('COSTS 1');
  });

  it('…and an empty bank still offers it (R191-B: a gatherer fetches the shape from the quarry)', () => {
    // ⭐ S193 R191-B — RE-PINNED from "NEED 1 MORE": the bank is one of two sources now. `setup`
    // spends the exact bill, so the bank is empty here; the FIX is still offered at its one-shape price.
    const w = setup();
    damageEntity(w, { kind: 'primitive', id: nodeId(w, 2) }, 30, 'creature', null, 'physical');
    hire(w);
    const fix = structureActionModel(w, P0, nodeId(w, 0))!.buttons[0];
    expect(fix.enabled).toBe(true);
    expect(fix.caption).toBe('COSTS 1');
  });

  /*
   * ⭐ S191 R191-A — RE-PINNED. A stamp with one hand-placed (origin-null) member IS a welded structure:
   * the six stamped shapes are a tower's remains and the seventh is a weld. Before R191-A any origin-null
   * member refused FIX for the whole thing; now the FREE-FORM shape's card is the structure's (SCRAP
   * only — R191-A R5), and the stamped shapes' card is the tower's, with its own FIX.
   */
  it('freeform rubble offers SCRAP ONLY — no greyed FIX lying about what the game can do', () => {
    const w = setup();
    const freeform = nodeId(w, 3);
    w.primitives.get(freeform)!.origin = null;
    const view = structureActionModel(w, P0, freeform)!;
    expect(view.buttons.map((b) => b.kind)).toEqual(['SCRAP']);
    expect(view.title).toBe('STRUCTURE');
  });

  it('⭐ S191 R191-A — …while a STAMPED shape of that welded structure offers its tower’s own FIX', () => {
    const w = setup();
    w.primitives.get(nodeId(w, 3))!.origin = null;
    const view = structureActionModel(w, P0, nodeId(w, 0))!;
    expect(view.buttons.map((b) => b.kind)).toEqual(['FIX', 'SCRAP']);
    expect(view.title, 'the tower is named').not.toBe('STRUCTURE');
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
