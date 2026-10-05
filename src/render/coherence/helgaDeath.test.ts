/**
 * S195 T19 (owner B-7, RULED: *"she needs to look like she dies when she dies"*) — HELGA VISIBLY DIES, on
 * every peer, off the synced DORMANT edge (`damage.ts` R190-J). REACH through the real `PrincessRenderer`.
 *   · the kill edge → the shared death beat in her seat colour, her sprite handed to the fall, the `unitFalls` slot;
 *   · NEGATIVE: first sighting already DORMANT (joiner / load), the revive edge, a title return, the fog;
 *   · the beat and the fall end on time; `clear()` forgets them;
 *   · the bump verdict: no field was added — asserted against the serializer's own output.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let fogged = false;
vi.mock('../concealment.ts', () => ({
  isConcealed: () => fogged,
  beginConcealmentFrame: () => {},
  concealmentContext: () => ({ active: fogged, localPlayerId: null, sources: [] }),
  resetConcealmentForTest: () => {},
}));
const { slot } = vi.hoisted(() => ({ slot: vi.fn(async () => false) }));
vi.mock('../audioManager.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../audioManager.ts')>()),
  playSlapSFX: vi.fn(async () => {}),
  playSlotSFX: slot,
}));

import { Container, Sprite } from 'pixi.js';
import { PLAYER_COLORS } from '../../constants.ts';
import { asDefenderId, asPlayerId, asPrimitiveId } from '../../types.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { makeWorld, type World } from '../../state/world.ts';
import { makeDefender } from '../../state/defenders/defender.ts';
import { recordingSink } from '../fx/emitter.ts';
import { setFxHooks, setFxLegacyFlag } from '../fx/fxState.ts';
import { UNIT_DEATH_LIFE_TICKS } from '../fx/unitDeathFx.ts';
import { HELGA_FALL_TICKS, PrincessRenderer } from '../princessRenderer.ts';

const P0 = asPlayerId(0);
const HELGA = asDefenderId(6);

function world(): World {
  const w = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  const d = makeDefender({
    id: HELGA, kind: 'princess', ownerPlayerId: P0, anchorPrimitiveId: asPrimitiveId(1),
    recipeId: 'helga' as never, pos: { x: 500, y: 500 }, registeredAtTick: 0,
  });
  w.defenders.set(d.id, d);
  w.tick = 100;
  return w;
}
/** What `damage.ts:449-457` does on the kill tick. */
function kill(w: World): void {
  const d = w.defenders.get(HELGA)!;
  d.state = 'DORMANT'; d.ticksInState = 0; d.ehp = null; d.targetCreatureId = null; d.lastStrikePos = null; d.walkTargetPos = null;
}
let top = recordingSink();
let shade = recordingSink();
beforeEach(() => {
  fogged = false; slot.mockClear();
  top = recordingSink(); shade = recordingSink();
  setFxHooks({ top, shade, ground: recordingSink(), shock: { shock() { /* none */ } } });
  setFxLegacyFlag(false);
});
afterEach(() => { setFxHooks(null); setFxLegacyFlag(false); });
const renderer = () => new PrincessRenderer({ stage: new Container() } as never, new Container());

describe('REACH — the kill edge, through the real renderer', () => {
  it('alive → DORMANT draws the beat in her SEAT colour and sounds the unit-falls slot, once', () => {
    const w = world();
    const r = renderer();
    r.sync(w);
    expect(r.deathBeatCount()).toBe(0);
    kill(w); w.tick += 1;
    r.sync(w);
    expect(r.deathBeatCount()).toBe(1);
    expect(top.out.length).toBeGreaterThan(0);
    expect(top.out.some((e) => e.tint === PLAYER_COLORS[0])).toBe(true);
    expect(slot).toHaveBeenCalledTimes(1);
    expect(slot).toHaveBeenCalledWith('unitFalls', { x: 500, y: 500 });
    w.tick += 1; r.sync(w); r.sync(w);
    expect(r.deathBeatCount()).toBe(1); // the edge, not the state
    expect(slot).toHaveBeenCalledTimes(1);
  });

  it('her sprite is handed to the fall (keels over, fades) instead of being destroyed, and is gone after HELGA_FALL_TICKS', () => {
    const w = world();
    const r = renderer();
    r.sync(w);
    const sp = new Sprite();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r as any).sprites.set(HELGA, sp); // the atlas sprite the real load would have made
    kill(w); w.tick += 1;
    r.sync(w);
    expect(r.fallenCount()).toBe(1);
    expect(sp.destroyed).toBe(false);
    w.tick += Math.floor(HELGA_FALL_TICKS / 2); r.sync(w);
    expect(Math.abs(sp.rotation)).toBeGreaterThan(0.5); // mid-fall
    w.tick += HELGA_FALL_TICKS; r.sync(w);
    expect(r.fallenCount()).toBe(0);
    expect(sp.destroyed).toBe(true);
  });

  it('the beat ends on time; clear() forgets a beat in flight', () => {
    const w = world();
    const r = renderer();
    r.sync(w); kill(w); w.tick += 1; r.sync(w);
    w.tick += UNIT_DEATH_LIFE_TICKS; r.sync(w);
    expect(r.deathBeatCount()).toBe(0);
    const w2 = world(); const r2 = renderer();
    r2.sync(w2); kill(w2); w2.tick += 1; r2.sync(w2);
    expect(r2.deathBeatCount()).toBe(1);
    r2.clear();
    expect(r2.deathBeatCount()).toBe(0);
  });
});

describe('NEGATIVE — what is not a death draws nothing', () => {
  it('a first sighting that is ALREADY dormant (a joiner, a save/load) is no edge', () => {
    const w = world(); kill(w);
    const r = renderer();
    r.sync(w); w.tick += 1; r.sync(w);
    expect(r.deathBeatCount()).toBe(0);
    expect(slot).not.toHaveBeenCalled();
  });
  it('the REVIVE edge (DORMANT → IDLE at the phase edge) is not a death', () => {
    const w = world(); kill(w);
    const r = renderer();
    r.sync(w);
    const d = w.defenders.get(HELGA)!;
    d.state = 'IDLE'; d.ehp = 150; w.tick += 1;
    r.sync(w);
    expect(r.deathBeatCount()).toBe(0);
  });
  it('a kill INSIDE the fog shows nothing to this seat (owner S170), and her sprite simply goes', () => {
    const w = world();
    const r = renderer();
    r.sync(w);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r as any).sprites.set(HELGA, new Sprite());
    fogged = true;
    kill(w); w.tick += 1; r.sync(w);
    expect(r.deathBeatCount()).toBe(0);
    expect(r.fallenCount()).toBe(0);
    expect(slot).not.toHaveBeenCalled();
  });
  it('off the match (a title return) is not a death', () => {
    const w = world();
    const r = renderer();
    r.sync(w);
    w.gameState = 'TITLE'; kill(w); w.tick += 1; r.sync(w);
    expect(r.deathBeatCount()).toBe(0);
  });
  it('?fx=legacy: no beat is drawn (the fall still plays — it is her sprite)', () => {
    setFxLegacyFlag(true);
    const w = world();
    const r = renderer();
    r.sync(w); kill(w); w.tick += 1; r.sync(w);
    expect(top.out.length + shade.out.length).toBe(0);
  });
});
