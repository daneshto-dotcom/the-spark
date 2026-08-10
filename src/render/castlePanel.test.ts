/**
 * SPARK — S136 P0 castle context panel: the pure model + geometry.
 *
 * WHY THESE TESTS EXIST, SPECIFICALLY. The owner played the V6-1.2 build and reported "the build
 * extra gatherer or increase speed is not even clickable". Driving the real app in headless Chromium
 * this session proved the buttons were NOT broken — SPEED worked in all six mode×viewport cells.
 * The actual defect was that BUY is unaffordable from t=0 (STARTING_VICTORY_POINTS 100 vs
 * GATHERER_PRICE 105) and the old footer rendered that as an unexplained dim box, which a player
 * cannot distinguish from a dead control.
 *
 * So the thing under test is the REASON, not merely the boolean: every disabled state must name its
 * blocker. `castleControlsModel` is pure and world-only for exactly that reason — the S130 lesson is
 * that logic which lives only inside a draw path cannot be driven headlessly and therefore ships
 * unverified (V6-0.2's tier banner passed CHECK while never rendering once).
 *
 * `panelOrigin` is tested for the LEFT FLIP because the keeps sit on a ring around the arena centre:
 * seats on the right-hand arc would push a right-opening panel off-canvas, and that is invisible
 * until someone plays that specific seat.
 */
import { describe, expect, it } from 'vitest';
import {
  CANVAS_WIDTH,
  GATHERER_MAX_SPEED_LEVEL,
  GATHERER_PRICE,
  GATHERER_SPEED_UPGRADE_PRICE,
  KEEP_RING_SEATS,
  STARTING_VICTORY_POINTS,
} from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { castleAnchor, makeGatherer } from '../state/gatherers/gatherer.ts';
import { makeWorld, type World } from '../state/world.ts';
import { asGathererId, asPlayerId } from '../types.ts';
import {
  castleControlsModel,
  panelOrigin,
  panelRect,
  ROW_FONT_ADVANCE,
  ROW_INNER_W,
} from './castlePanel.ts';

const P0 = asPlayerId(0);

/** A PLAYING world where seat 0 is local, holds `score`, and owns `gatherers` units at `speedLevel`. */
function world(score: number, gatherers = 1, speedLevel = 0): World {
  const w = makeWorld(0);
  w.gameState = 'PLAYING';
  w.tick = 400;
  w.localPlayerId = P0;
  if (!w.players.has(P0)) w.players.set(P0, makeIdlePlayer(P0, 0x3bd7ff, { x: 0, y: 0 }));
  w.scoreByPlayer.set(P0, score);
  for (let i = 0; i < gatherers; i++) {
    const id = asGathererId(i);
    const g = makeGatherer({ id, ownerPlayerId: P0, pos: { x: 0, y: 0 }, spawnedAtTick: 0 });
    g.speedLevel = speedLevel;
    w.gatherers.set(id, g);
  }
  return w;
}

const row = (w: World, key: string) => {
  const r = castleControlsModel(w).find((c) => c.key === key);
  if (r === undefined) throw new Error(`no row ${key}`);
  return r;
};

describe('S136 P0 — castleControlsModel: a disabled control always names its blocker', () => {
  it('THE OWNER-REPORTED STATE: at the opening balance, BUY is disabled and says NEED 105', () => {
    // This is the exact t=0 state of a real match, and the reason the owner read the control as
    // broken. 100 < 105 is deliberate design (constants.ts documents the opening choice) — but it
    // MUST announce itself.
    const w = world(STARTING_VICTORY_POINTS);
    expect(STARTING_VICTORY_POINTS).toBeLessThan(GATHERER_PRICE); // guard the premise
    const buy = row(w, 'buyGatherer');
    expect(buy.enabled).toBe(false);
    expect(buy.reason).toBe(`NEED ${GATHERER_PRICE}`);
  });

  it('and SPEED is ENABLED at the same instant — the button the owner said was dead is live', () => {
    const up = row(world(STARTING_VICTORY_POINTS), 'upgradeSpeed');
    expect(up.enabled).toBe(true);
    expect(up.reason).toBe('');
  });

  it('BUY enables exactly at the price boundary, not one point below it', () => {
    expect(row(world(GATHERER_PRICE - 1), 'buyGatherer').enabled).toBe(false);
    expect(row(world(GATHERER_PRICE), 'buyGatherer').enabled).toBe(true);
  });

  it('SPEED enables exactly at its own price boundary', () => {
    expect(row(world(GATHERER_SPEED_UPGRADE_PRICE - 1), 'upgradeSpeed').enabled).toBe(false);
    expect(row(world(GATHERER_SPEED_UPGRADE_PRICE - 1), 'upgradeSpeed').reason).toBe(
      `NEED ${GATHERER_SPEED_UPGRADE_PRICE}`,
    );
    expect(row(world(GATHERER_SPEED_UPGRADE_PRICE), 'upgradeSpeed').enabled).toBe(true);
  });

  it('a score fractionally below the price is disabled (income accrues in fractions)', () => {
    // Score is a float — it accrues per tick from complexity — so the near-miss case is the common
    // one, not an edge case.
    expect(row(world(GATHERER_PRICE - 0.4), 'buyGatherer').enabled).toBe(false);
    expect(row(world(GATHERER_PRICE + 0.4), 'buyGatherer').enabled).toBe(true);
    // ⚠ NOTE ON `Math.floor` IN castleControlsModel: it is REDUNDANT for this verdict and a
    // mutation removing it correctly survives. Prices are integers, so `x >= P` implies
    // `floor(x) >= P` and vice versa — the floor can never flip the boolean. It is retained
    // because the row LABEL and the reason string are read by a human against a displayed integer
    // score, and it would become load-bearing the day a price stops being a whole number. Recorded
    // here rather than "strengthened" into a fake assertion: the S135 lesson is that a surviving
    // mutation may mean a redundant line, not a weak test.
  });

  it('owning NO units reports NO UNITS, not a price — the reducer refuses to charge for nothing', () => {
    const up = row(world(9999, 0), 'upgradeSpeed');
    expect(up.enabled).toBe(false);
    expect(up.reason).toBe('NO UNITS');
  });

  it('every unit already at max level reports MAX SPEED even with unlimited points', () => {
    const up = row(world(9999, 2, GATHERER_MAX_SPEED_LEVEL), 'upgradeSpeed');
    expect(up.enabled).toBe(false);
    expect(up.reason).toBe('MAX SPEED');
  });

  it('ONE upgradable unit among maxed ones keeps SPEED live (the reducer still steps that one)', () => {
    const w = world(9999, 0);
    for (const [i, lvl] of [GATHERER_MAX_SPEED_LEVEL, GATHERER_MAX_SPEED_LEVEL - 1].entries()) {
      const id = asGathererId(i);
      const g = makeGatherer({ id, ownerPlayerId: P0, pos: { x: 0, y: 0 }, spawnedAtTick: 0 });
      g.speedLevel = lvl;
      w.gatherers.set(id, g);
    }
    expect(row(w, 'upgradeSpeed').enabled).toBe(true);
  });

  it('another seat\'s gatherers do not count as yours', () => {
    const w = world(9999, 0);
    const id = asGathererId(7);
    w.gatherers.set(
      id,
      makeGatherer({ id, ownerPlayerId: asPlayerId(1), pos: { x: 0, y: 0 }, spawnedAtTick: 0 }),
    );
    expect(row(w, 'upgradeSpeed').reason).toBe('NO UNITS');
  });

  describe('input locks — carried over from the footer these rows replace', () => {
    // These rows live on app.stage and their pointertap never passes through Controls.isInputLocked(),
    // so the lock has to be re-checked here or a benched player could spend on an invisible control.
    it('a live NONET trial locks both rows', () => {
      const w = world(9999);
      w.sudoku = { dummy: true } as never;
      for (const c of castleControlsModel(w)) {
        expect(c.enabled).toBe(false);
        expect(c.reason).toBe('LOCKED');
      }
    });

    it('the local player mid-cinematic locks both rows', () => {
      const w = world(9999);
      w.activeCinematicPlayerId = P0;
      expect(row(w, 'buyGatherer').reason).toBe('LOCKED');
    });

    it("ANOTHER player's cinematic does NOT lock yours", () => {
      const w = world(9999);
      w.activeCinematicPlayerId = asPlayerId(1);
      expect(row(w, 'buyGatherer').enabled).toBe(true);
    });

    it('a benched (eaten) player is locked; the same player after the bench expires is not', () => {
      const w = world(9999);
      const me = w.players.get(P0)!;
      me.benchedUntilTick = w.tick + 100;
      expect(row(w, 'buyGatherer').reason).toBe('LOCKED');
      me.benchedUntilTick = w.tick - 1;
      expect(row(w, 'buyGatherer').enabled).toBe(true);
    });
  });
});

describe('S136 P0 — row labels FIT their box (the defect the assertions could not see)', () => {
  // The first cut of the panel appended the reason to the label, so a disabled BUY read
  // "BUY GATHERER  105   NEED 105" and visibly overflowed its own row in the verification
  // screenshot — while every state assertion stayed green. This is the cheap guard for that class.
  const widest = (w: World) =>
    Math.max(...castleControlsModel(w).map((c) => c.label.length)) * ROW_FONT_ADVANCE;

  it('no label overflows in ANY reachable state', () => {
    const states: Array<[string, World]> = [
      ['opening balance (BUY disabled: NEED 105)', world(STARTING_VICTORY_POINTS)],
      ['both affordable', world(9999)],
      ['no units (SPEED: NO UNITS)', world(9999, 0)],
      ['all maxed (SPEED: MAX SPEED)', world(9999, 2, GATHERER_MAX_SPEED_LEVEL)],
      ['broke (both NEED n)', world(0)],
    ];
    for (const [name, w] of states) {
      expect(widest(w), `${name} must fit ${ROW_INNER_W}px`).toBeLessThanOrEqual(ROW_INNER_W);
    }
  });

  it('a disabled label states the blocker ONCE, not the price and the blocker both', () => {
    const buy = row(world(STARTING_VICTORY_POINTS), 'buyGatherer');
    expect(buy.label).toContain(`NEED ${GATHERER_PRICE}`);
    // "105" appears exactly once — twice was the overflow bug.
    expect(buy.label.match(new RegExp(String(GATHERER_PRICE), 'g'))?.length).toBe(1);
  });

  it('an enabled label shows the PRICE (so you know what it costs before you commit)', () => {
    expect(row(world(9999), 'buyGatherer').label).toContain(String(GATHERER_PRICE));
    expect(row(world(9999), 'upgradeSpeed').label).toContain(String(GATHERER_SPEED_UPGRADE_PRICE));
  });
});

describe('S136 P0 — panelOrigin / panelRect geometry', () => {
  it('never leaves the canvas for ANY seat on the keep ring', () => {
    // The keeps ring the arena centre, so this is the test that catches an off-screen panel for one
    // unlucky seat rather than leaving it to be discovered in play.
    for (let seat = 0; seat < KEEP_RING_SEATS; seat++) {
      const a = castleAnchor(seat);
      const r = panelRect(panelOrigin(a.x, a.y, 2), 2);
      expect(r.x, `seat ${seat} left`).toBeGreaterThanOrEqual(0);
      expect(r.y, `seat ${seat} top`).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w, `seat ${seat} right`).toBeLessThanOrEqual(CANVAS_WIDTH);
    }
  });

  it('opens to the RIGHT of a keep with room, and FLIPS LEFT when it would overflow', () => {
    const mid = panelOrigin(400, 540, 2);
    expect(mid.x).toBeGreaterThan(400); // right of the anchor

    const nearRight = panelOrigin(CANVAS_WIDTH - 20, 540, 2);
    const r = panelRect(nearRight, 2);
    expect(nearRight.x).toBeLessThan(CANVAS_WIDTH - 20); // flipped to the left side
    expect(r.x + r.w).toBeLessThanOrEqual(CANVAS_WIDTH);
  });

  it('is vertically centred on the keep when there is room', () => {
    const o = panelOrigin(400, 540, 2);
    const r = panelRect(o, 2);
    expect(o.y + r.h / 2).toBeCloseTo(540, 5);
  });

  it('grows with the row count — so a tower with more upgrades still fits the same way', () => {
    expect(panelRect(panelOrigin(400, 540, 4), 4).h).toBeGreaterThan(
      panelRect(panelOrigin(400, 540, 2), 2).h,
    );
  });
});
