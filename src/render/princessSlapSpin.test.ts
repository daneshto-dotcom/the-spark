/**
 * SPARK — S194 (T8): Helga's slap star-burst spins by SIM SECONDS (`tick / PHYSICS_HZ`).
 *
 * `drawImpact` spins its six rays by `seconds × 8` rad. The legacy look feeds it the wall clock
 * (`performance.now() / 1000`); S193's rebuilt-fx look fed it `world.tick / 60` — a literal that only
 * equals seconds while `PHYSICS_HZ` is 60. Today it is, so the two agree to the bit, and that is exactly
 * why a behaviour test against the real constant cannot see the literal: this file runs with
 * `PHYSICS_HZ` MOCKED to 30, where `/ 60` spins at half the rate and turns the REACH case red.
 *
 * REACH: the real `PrincessRenderer.sync`, fx live, a FIRE Helga — the ray endpoints it draws sit at
 * the angle `slapSpinSeconds(tick) × 8`. NEGATIVE: with fx off (legacy) the rays follow the wall clock,
 * not the tick.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MOCK_HZ = 30;
vi.mock('../constants.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../constants.ts')>()),
  PHYSICS_HZ: 30,
}));
vi.mock('./audioManager.ts', () => ({ playSlapSFX: vi.fn(async () => {}) }));

import { Container, Graphics } from 'pixi.js';
import { PHYSICS_HZ, PLAYER_COLORS } from '../constants.ts';
import { asDefenderId, asPlayerId, asPrimitiveId } from '../types.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { makeWorld, type World } from '../state/world.ts';
import { makeDefender } from '../state/defenders/defender.ts';
import { recordingSink } from './fx/emitter.ts';
import { setFxHooks, setFxLegacyFlag } from './fx/fxState.ts';
import { resetConcealmentForTest } from './concealment.ts';
import { PrincessRenderer, slapSpinSeconds } from './princessRenderer.ts';

const P0 = asPlayerId(0);
const STRIKE = { x: 530, y: 490 };
const TICKS_IN_FIRE = 2; // r = 8 + min(1, 2 / 8) × 16 = 12
const R = 12;

function helgaWorld(tick: number): World {
  const w = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  const d = makeDefender({
    id: asDefenderId(6), kind: 'princess', ownerPlayerId: P0, anchorPrimitiveId: asPrimitiveId(1),
    recipeId: 'helga' as never, pos: { x: 500, y: 500 }, registeredAtTick: 0,
  });
  d.state = 'FIRE';
  d.ticksInState = TICKS_IN_FIRE;
  d.lastStrikePos = { ...STRIKE };
  w.defenders.set(d.id, d);
  w.tick = tick;
  return w;
}

/** The angles (mod 2π) of every ray drawn from the strike point at the star-burst's radius. */
function rayAngles(tick: number): number[] {
  const out: number[] = [];
  const spy = vi.spyOn(Graphics.prototype, 'lineTo').mockImplementation(function (this: Graphics, x: number, y: number) {
    if (Math.abs(Math.hypot(x - STRIKE.x, y - STRIKE.y) - R) < 1e-6) {
      out.push((Math.atan2(y - STRIKE.y, x - STRIKE.x) + Math.PI * 2) % (Math.PI * 2));
    }
    return this;
  });
  try {
    new PrincessRenderer({ stage: new Container() } as never, new Container()).sync(helgaWorld(tick));
  } finally {
    spy.mockRestore();
  }
  return out;
}

const mod2pi = (a: number): number => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
const hasAngle = (angles: number[], a: number): boolean => angles.some((x) => Math.abs(x - mod2pi(a)) < 1e-6);

beforeEach(() => { resetConcealmentForTest(); setFxLegacyFlag(false); });
afterEach(() => { setFxHooks(null); setFxLegacyFlag(false); vi.restoreAllMocks(); });

describe('S194 T8 — Helga’s slap spins by sim seconds', () => {
  it('fixture: this file really runs at the mocked rate', () => {
    expect(PHYSICS_HZ).toBe(MOCK_HZ);
    expect(slapSpinSeconds(90)).toBe(3);
  });

  it('⭐ REACH: with fx live, `PrincessRenderer.sync` draws the six rays at slapSpinSeconds(tick) × 8', () => {
    setFxHooks({ top: recordingSink(), shade: recordingSink(), ground: recordingSink(), shock: { shock() {} } });
    const tick = 45; // 1.5 sim seconds at 30 Hz → 12 rad; `tick / 60` would be 6 rad
    const angles = rayAngles(tick);
    expect(angles.length, 'six rays drawn').toBe(6);
    expect(hasAngle(angles, (tick / MOCK_HZ) * 8)).toBe(true);
    expect(hasAngle(angles, (tick / 60) * 8), 'not the hard-wired 60').toBe(false);
  });

  it('negative: with fx off (legacy look) the rays follow the wall clock, not the tick', () => {
    vi.spyOn(performance, 'now').mockReturnValue(250); // 0.25 s → 2 rad
    const angles = rayAngles(45);
    expect(angles.length).toBe(6);
    expect(hasAngle(angles, 0.25 * 8)).toBe(true);
    expect(hasAngle(angles, (45 / MOCK_HZ) * 8)).toBe(false);
  });
});
