/**
 * S194 `s194/visuals-6` — **THE LIGHTNING HUB'S ARCS (V07 leftover).** Pure layout + REACH through
 * `SpawnerZoneRenderer.sync` (a hub spawner whose building was drawn), with negatives: no building
 * drawn (no foot) → no arcs; another recipe → no arcs; `?fx=legacy` → nothing.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { recordingSink } from './emitter.ts';
import { setFxHooks, setFxLegacyFlag } from './fxState.ts';
import { HUB_ARC_CYCLE_TICKS, HUB_ARC_LIFE_TICKS, HUB_CROWN_FRAC, hubArcFx, hubDischargeAt } from './hubArcFx.ts';
import { VOLT_STYLE } from './lightningFx.ts';
import { SpawnerZoneRenderer } from '../spawnerZoneRenderer.ts';
import { __resetTowerCoverForTests, beginTowerCoverFrame, markTowerCover } from '../towerCover.ts';
import { resetConcealmentForTest } from '../concealment.ts';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP } from '../../constants.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { makeWorld } from '../../state/world.ts';
import { asPlayerId, asPrimitiveId } from '../../types.ts';

const FOOT = { x: 300, y: 400, w: 100, h: 100 };

/** A tick inside a discharge of hub `id`. */
function firingTick(id: number): number {
  for (let t = 1000; t < 1000 + HUB_ARC_CYCLE_TICKS; t++) if (hubDischargeAt(id, t)?.age === 3) return t;
  throw new Error('no discharge in a cycle');
}

describe('S194 — `hubArcFx`', () => {
  it('discharges once per cycle, for HUB_ARC_LIFE_TICKS', () => {
    let on = 0;
    for (let t = 0; t < HUB_ARC_CYCLE_TICKS * 4; t++) if (hubDischargeAt(9, t) !== null) on++;
    expect(on).toBe(HUB_ARC_LIFE_TICKS * 4);
  });

  it('a discharge is a glow + sheath + white core from the CROWN to the ground, with sparks where it lands', () => {
    const top = recordingSink();
    const t = firingTick(9);
    hubArcFx(top, 9, FOOT.x, FOOT.y, FOOT.w, FOOT.h, t, false);
    const tints = new Set(top.out.map((e) => e.tint));
    expect(tints.has(VOLT_STYLE.glow) && tints.has(VOLT_STYLE.sheath) && tints.has(0xffffff)).toBe(true);
    const crownY = FOOT.y - FOOT.h * HUB_CROWN_FRAC;
    expect(top.out.some((e) => e.tex === 'core' && e.x === FOOT.x && e.y === crownY && e.w > 10), 'the crown flash').toBe(true);
    // sparks near the ground ring round the base
    expect(top.out.some((e) => e.tex === 'soft' && e.h === 2.6 && e.y > FOOT.y - 40)).toBe(true);
    expect(top.out.every((e) => e.blend === 'add')).toBe(true);
  });

  it('between discharges only the small crown crackle draws (far fewer sprites)', () => {
    const quiet = recordingSink();
    let t = 1000;
    while (hubDischargeAt(9, t) !== null) t++;
    hubArcFx(quiet, 9, FOOT.x, FOOT.y, FOOT.w, FOOT.h, t, false);
    const firing = recordingSink();
    hubArcFx(firing, 9, FOOT.x, FOOT.y, FOOT.w, FOOT.h, firingTick(9), false);
    expect(firing.out.length).toBeGreaterThan(quiet.out.length + 10);
  });

  it('⛔ DETERMINISM, re-strike and LOW', () => {
    const run = (t: number, low = false) => { const s = recordingSink(); hubArcFx(s, 9, 300, 400, 100, 100, t, low); return s.out; };
    const t = firingTick(9);
    expect(run(t)).toEqual(run(t));
    expect(run(t + 3)).not.toEqual(run(t));
    expect(run(t, true).length).toBeLessThan(run(t).length);
  });
});

const P0 = asPlayerId(0);
let top: ReturnType<typeof recordingSink>;
function install(): void { top = recordingSink(); setFxHooks({ top, shade: recordingSink(), ground: recordingSink(), shock: { shock() {} } }); }

function hubWorld(recipeId: string) {
  const w: any = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  const id = asPrimitiveId(5);
  w.primitives.set(id, { id, type: 0, placerColor: 0, placedBy: P0, createdTick: 0, pos: { x: 300, y: 350 }, prevPos: { x: 300, y: 350 }, bonds: new Set(), ownerColor: 0, lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null });
  w.creatureSpawners.set(1, { id: 1, anchorPrimitiveId: id, recipeId, ownerPlayerId: P0 });
  return { w, id };
}

beforeEach(() => { __resetTowerCoverForTests(); resetConcealmentForTest(); setFxLegacyFlag(false); });
afterEach(() => { setFxHooks(null); setFxLegacyFlag(false); __resetTowerCoverForTests(); });

describe('S194 REACH — `SpawnerZoneRenderer.sync` draws the hub arcs', () => {
  function frames(recipeId: string, withFoot: boolean, legacy = false) {
    const { w, id } = hubWorld(recipeId);
    const r = new SpawnerZoneRenderer({} as never, new Container());
    const t = firingTick(id as unknown as number);
    w.tick = t - 1;
    beginTowerCoverFrame(w);
    if (withFoot) markTowerCover([id], [], 0, FOOT);
    w.tick = t;
    beginTowerCoverFrame(w);
    install();
    setFxLegacyFlag(legacy);
    r.sync(w);
    return top.out.filter((e) => e.tint === VOLT_STYLE.glow || e.tint === VOLT_STYLE.sheath);
  }
  it('⭐ a standing hub (its building drawn) throws its arcs', () => {
    expect(frames('lightningHub', true).length).toBeGreaterThan(10);
  });
  it('⛔ NEGATIVE — no building drawn (no foot): no arcs', () => {
    expect(frames('lightningHub', false)).toEqual([]);
  });
  it('⛔ NEGATIVE — another recipe: no arcs', () => {
    expect(frames('pentagram', true)).toEqual([]);
  });
  it('⛔ NEGATIVE — `?fx=legacy`: no arcs', () => {
    expect(frames('lightningHub', true, true)).toEqual([]);
  });
});
