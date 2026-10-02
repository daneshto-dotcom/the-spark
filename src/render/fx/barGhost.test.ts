/**
 * S194 `s194/visuals-6` (V28) — **THE HEALTH-BAR GHOST.** Pure arithmetic, then REACH through the real
 * `drawHealthBars` with the fx hooks live (a creature takes a hit → a ghost segment sits exactly over the
 * lost part, holds, drains to the bar, and is gone), with negatives: no hit → no ghost; `?fx=legacy` →
 * the S171 bar exactly (track + fill, nothing else); a heal never shows a ghost.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BAR_GHOST_DRAIN_PER_TICK, BAR_GHOST_HOLD_TICKS, ghostFrac, stepGhost } from './barGhost.ts';
import { recordingSink } from './emitter.ts';
import { setFxHooks, setFxLegacyFlag } from './fxState.ts';
import { __resetBarGhostsForTests, drawHealthBars } from '../healthBar.ts';
import { beginConcealmentFrame, resetConcealmentForTest } from '../concealment.ts';
import { PLAYER_COLORS } from '../../constants.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { dispatch, makeWorld, type World } from '../../state/world.ts';
import { creatureMaxEhp } from '../../state/creatures/creature.ts';
import { asPlayerId } from '../../types.ts';

describe('S194 V28 — ghost arithmetic', () => {
  it('a hit: the lost segment holds, then drains at the stated speed, never below the bar', () => {
    let st = stepGhost(undefined, 1, 100);
    st = stepGhost(st, 0.6, 110);
    expect(ghostFrac(st, 110)).toBe(1);
    expect(ghostFrac(st, 110 + BAR_GHOST_HOLD_TICKS)).toBe(1);
    expect(ghostFrac(st, 110 + BAR_GHOST_HOLD_TICKS + 10)).toBeCloseTo(1 - 10 * BAR_GHOST_DRAIN_PER_TICK);
    expect(ghostFrac(st, 110 + BAR_GHOST_HOLD_TICKS + 1000)).toBe(0.6);
  });
  it('a second hit mid-drain keeps the WHOLE loss lit from where the ghost is', () => {
    let st = stepGhost(undefined, 1, 0);
    st = stepGhost(st, 0.8, 10);
    const at = 10 + BAR_GHOST_HOLD_TICKS + 5;
    const before = ghostFrac(st, at);
    st = stepGhost(st, 0.5, at);
    expect(ghostFrac(st, at)).toBeCloseTo(before);
    expect(st.last).toBe(0.5);
  });
  it('a heal never draws a ghost below the bar, and a new match (tick backwards) resets', () => {
    let st = stepGhost(undefined, 0.5, 0);
    st = stepGhost(st, 0.9, 5);
    expect(ghostFrac(st, 5)).toBe(0.9);
    st = stepGhost(st, 0.3, 100); // a hit at tick 100
    expect(ghostFrac(st, 100)).toBe(0.9);
    st = stepGhost(st, 0.4, 3); // the next match's tick 3
    expect(ghostFrac(st, 3)).toBe(0.4);
  });
});

/* ── REACH ─────────────────────────────────────────────────────────────────────────────────────── */

type R = { x: number; y: number; w: number; h: number; color?: number };
class G {
  readonly rects: R[] = [];
  rect(x: number, y: number, w: number, h: number): this { this.rects.push({ x, y, w, h }); return this; }
  fill(s: { color: number }): this { this.rects[this.rects.length - 1]!.color = s.color; return this; }
  stroke(): this { return this; } circle(): this { return this; } moveTo(): this { return this; } lineTo(): this { return this; }
  clear(): this { this.rects.length = 0; return this; }
}

const P0 = asPlayerId(0);
const GHOST = 0xfff0c8;

function board(): { w: World; c: any } {
  const w = makeWorld(0);
  w.isHost = true;
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  dispatch(w, { type: 'SPAWN_CREATURE', creatureType: 'goblinMelee' as never, ownerPlayerId: P0, pos: { x: 300, y: 300 }, targetPos: { x: 300, y: 300 }, sourceSpawnerId: 1 as never });
  return { w, c: [...w.creatures.values()][0] };
}
function draw(w: World): R[] {
  const g = new G();
  beginConcealmentFrame(w, { x: 300, y: 300 });
  drawHealthBars(g as never, w);
  return g.rects;
}
function install(): void { setFxHooks({ top: recordingSink(), shade: recordingSink(), ground: recordingSink(), shock: { shock() {} } }); }

beforeEach(() => { __resetBarGhostsForTests(); resetConcealmentForTest(); setFxLegacyFlag(false); });
afterEach(() => { setFxHooks(null); setFxLegacyFlag(false); __resetBarGhostsForTests(); });

describe('S194 V28 REACH — `drawHealthBars`', () => {
  it('⭐ a hit leaves a ghost exactly over the lost part, which holds and then drains away', () => {
    install();
    const { w, c } = board();
    const max = creatureMaxEhp(c);
    w.tick = 1000;
    expect(draw(w).some((r) => r.color === GHOST), 'no hit, no ghost').toBe(false);
    c.ehp = Math.round(max / 2);
    w.tick = 1001;
    const rs = draw(w);
    const track = rs[0]!;
    const ghost = rs.find((r) => r.color === GHOST)!;
    const fill = rs[rs.length - 1]!;
    expect(ghost, 'the ghost is drawn').toBeDefined();
    expect(rs.indexOf(ghost), 'between the track and the fill').toBe(1);
    expect(ghost.x).toBeCloseTo(track.x + fill.w);
    expect(ghost.x + ghost.w).toBeCloseTo(track.x + track.w, 5);
    w.tick = 1001 + BAR_GHOST_HOLD_TICKS + 10;
    const mid = draw(w).find((r) => r.color === GHOST)!;
    expect(mid.w).toBeLessThan(ghost.w);
    w.tick = 1001 + 400;
    expect(draw(w).some((r) => r.color === GHOST), 'drained').toBe(false);
  });

  it('⛔ NEGATIVE — `?fx=legacy` keeps the S171 bar: exactly a track and a fill, after a hit too', () => {
    install();
    setFxLegacyFlag(true);
    const { w, c } = board();
    w.tick = 1000;
    draw(w);
    c.ehp = Math.round(creatureMaxEhp(c) / 3);
    w.tick = 1001;
    const rs = draw(w);
    expect(rs).toHaveLength(2);
    expect(rs.some((r) => r.color === GHOST)).toBe(false);
  });
});
