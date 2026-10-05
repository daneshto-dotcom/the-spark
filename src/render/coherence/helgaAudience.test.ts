/**
 * S195 T19 (owner N4) — **WHO HEARS HELGA — VERIFIED PER TRIGGER, ON A 4-SEAT BOARD.**
 *
 * > *"only if Helga is attacking your units or … it's your Helga attacking someone's units, you two should be
 * > able to hear. The other players shouldn't … I think it's like that now, but I'm not sure. Just verify."*
 *
 * Her two sounds: the THEME (`audioManager.updateHelgaTheme`) and the SLAP (`princessRenderer`, FIRE edge).
 * Each is driven here through its real consumer with the LOCAL seat set to her owner, to her victim's owner,
 * and to an uninvolved third seat — the third seat must hear nothing. MUTATION: with the audience gate removed
 * from either trigger, the "third seat" case of that trigger goes red (both leaked before S195).
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { slap, slot } = vi.hoisted(() => ({ slap: vi.fn(async () => {}), slot: vi.fn(async () => false) }));
vi.mock('../audioManager.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../audioManager.ts')>()),
  playSlapSFX: slap,
  playSlotSFX: slot,
}));

import { Container } from 'pixi.js';
import { PLAYER_COLORS } from '../../constants.ts';
import { asDefenderId, asPlayerId, asPrimitiveId, type PlayerId } from '../../types.ts';
import { makeWorld, dispatch, type World } from '../../state/world.ts';
import { makeDefender } from '../../state/defenders/defender.ts';
import { makeCreature } from '../../state/creatures/creature.ts';
import { getCreatureConfig } from '../../state/creatures/voltkin-config.ts';
import { installFakeAudio, flushAudio, type FakeAudioEnv } from '../audioFakeContext.fixtures.ts';
import { _resetAudioForTest, initAudio, isHelgaEngagedRaw, updateHelgaTheme } from '../audioManager.ts';
import { resetConcealmentForTest } from '../concealment.ts';
import { PrincessRenderer } from '../princessRenderer.ts';
import { helgaInvolvesSeat, helgaVictimSeat, type HelgaVictimMemo } from './helgaAudience.ts';

const P0 = asPlayerId(0); // the uninvolved third seat (local in the leak cases)
const P1 = asPlayerId(1); // another uninvolved seat
const P2 = asPlayerId(2); // Helga's OWNER
const P3 = asPlayerId(3); // the VICTIM's owner
const HELGA = asDefenderId(6);
const VICTIM = 77;

function board(local: PlayerId): World {
  const w = makeWorld(0x4e14);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s]! })),
    botSeats: [1, 2, 3],
  } as never);
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.localPlayerId = local;
  w.creatures.clear();
  const c = makeCreature(getCreatureConfig('goblinMelee'), {
    id: VICTIM as never, ownerPlayerId: P3, pos: { x: 560, y: 500 }, targetPos: { x: 560, y: 500 },
    spawnedAtTick: w.tick, sourceSpawnerId: null,
  });
  w.creatures.set(c.id, c);
  const d = makeDefender({
    id: HELGA, kind: 'princess', ownerPlayerId: P2, anchorPrimitiveId: asPrimitiveId(1),
    recipeId: 'helga' as never, pos: { x: 500, y: 500 }, registeredAtTick: 0,
  });
  d.state = 'WALK';
  d.targetCreatureId = c.id;
  d.walkTargetPos = { x: 560, y: 500 };
  w.defenders.set(d.id, d);
  return w;
}
const helga = (w: World) => w.defenders.get(HELGA)!;

let env: FakeAudioEnv;
beforeEach(() => { _resetAudioForTest(); resetConcealmentForTest(); env?.restore(); env = installFakeAudio(); slap.mockClear(); slot.mockClear(); });
afterEach(() => { env?.restore(); });
afterAll(() => { _resetAudioForTest(); });
const themeStarted = () => env.sources.some((s) => s.kind === 'buffer' && s.url.includes('helga-theme') && s.startArgs !== null);

describe('the rule itself (pure)', () => {
  it('audience = her owner + the victim\'s owner; the memo keeps the victim through the strike; IDLE/DORMANT clear it', () => {
    const w = board(P0);
    const memo: HelgaVictimMemo = new Map();
    const d = helga(w);
    expect(helgaVictimSeat(w, d, memo)).toBe(P3);
    expect(helgaInvolvesSeat(w, d, P2, memo)).toBe(true);
    expect(helgaInvolvesSeat(w, d, P3, memo)).toBe(true);
    expect(helgaInvolvesSeat(w, d, P0, memo)).toBe(false);
    expect(helgaInvolvesSeat(w, d, P1, memo)).toBe(false);
    // the one-shot kill: the victim is gone on the FIRE tick, the target id nulled — the memo still answers
    w.creatures.delete(VICTIM as never);
    d.state = 'FIRE'; d.targetCreatureId = null;
    expect(helgaVictimSeat(w, d, memo)).toBe(P3);
    expect(helgaInvolvesSeat(w, d, P3, memo)).toBe(true);
    expect(helgaInvolvesSeat(w, d, P0, memo)).toBe(false);
    // home again: the exchange is over, a stale victim never leaks into the next one
    d.state = 'IDLE';
    expect(helgaVictimSeat(w, d, memo)).toBeNull();
    expect(memo.size).toBe(0);
    d.state = 'DORMANT';
    expect(helgaVictimSeat(w, d, memo)).toBeNull();
  });
});

describe('TRIGGER 1 — her THEME (`updateHelgaTheme`)', () => {
  it.each([
    ['her OWNER (seat 2)', P2, true],
    ['the VICTIM\'s owner (seat 3)', P3, true],
    ['an uninvolved THIRD seat (seat 0) — hears NOTHING', P0, false],
    ['the fourth seat (seat 1) — hears NOTHING', P1, false],
  ])('local = %s → theme %s', async (_label, local, hears) => {
    initAudio();
    const w = board(local);
    updateHelgaTheme(w);
    await flushAudio();
    expect(themeStarted()).toBe(hears);
  });

  it('the raw predicate with NO seat keeps the pre-S195 "any Helga" read (the sim-side pins depend on it)', () => {
    const w = board(P0);
    expect(isHelgaEngagedRaw(w)).toBe(true);
    expect(isHelgaEngagedRaw(w, P0)).toBe(false);
    expect(isHelgaEngagedRaw(w, P2)).toBe(true);
  });

  it('the victim dies mid-exchange: the victim\'s seat still hears her theme through FIRE (memo), the third seat still does not', async () => {
    initAudio();
    const w = board(P3);
    updateHelgaTheme(w); // WALK — primes the memo
    w.creatures.delete(VICTIM as never);
    helga(w).state = 'FIRE'; helga(w).targetCreatureId = null;
    w.tick += 1;
    updateHelgaTheme(w);
    await flushAudio();
    expect(themeStarted()).toBe(true);
    _resetAudioForTest(); env.restore(); env = installFakeAudio(); initAudio();
    const w0 = board(P0);
    updateHelgaTheme(w0);
    w0.creatures.delete(VICTIM as never);
    helga(w0).state = 'FIRE'; helga(w0).targetCreatureId = null;
    w0.tick += 1;
    updateHelgaTheme(w0);
    await flushAudio();
    expect(themeStarted()).toBe(false);
  });
});

describe('TRIGGER 2 — her SLAP (`princessRenderer`, the synced FIRE edge)', () => {
  function slapFor(local: PlayerId, killOnFire = false): number {
    const w = board(local);
    const r = new PrincessRenderer({ stage: new Container() } as never, new Container());
    r.sync(w); // WALK frame — the renderer sees the victim and remembers its seat
    const d = helga(w);
    d.state = 'FIRE'; d.ticksInState = 0; d.lastStrikePos = { x: 560, y: 500 };
    if (killOnFire) { w.creatures.delete(VICTIM as never); d.targetCreatureId = null; }
    w.tick += 1;
    r.sync(w);
    r.sync(w); // still FIRE — the edge fires once
    return slap.mock.calls.length;
  }
  it.each([
    ['her OWNER (seat 2)', P2, 1],
    ['the VICTIM\'s owner (seat 3)', P3, 1],
    ['an uninvolved THIRD seat (seat 0) — hears NOTHING', P0, 0],
    ['the fourth seat (seat 1) — hears NOTHING', P1, 0],
  ])('local = %s → slap ×%i, once per FIRE edge', (_label, local, n) => {
    expect(slapFor(local)).toBe(n);
  });
  it('a one-shot kill on the FIRE tick: the victim\'s seat still hears the slap; the third seat still does not', () => {
    expect(slapFor(P3, true)).toBe(1);
    slap.mockClear();
    expect(slapFor(P0, true)).toBe(0);
  });
});
