/**
 * ⭐ S193 L1 — a human pull that the seat's OWN built shapes turn into a no-op plays the refused cue.
 * REACH: the real reducers build the wall (BUILD_BLUEPRINT + loose shapes over every slot), and the
 * real `requestPull` → real `PULL_FROM_BANK` dispatch confirms the no-op the cue announces.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CASTLE_PORCH_SLOTS, PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import type { Primitive } from '../game/primitive.ts';
import { bankAdd, porchSlot } from '../state/castleBank.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { asPlayerId, asPrimitiveId } from '../types.ts';
import { pullBlockedByBuilt, requestPull } from './pullFeedback.ts';

const ME = asPlayerId(0);

function world(): World {
  const w = makeWorld(0x11);
  w.gameState = 'TITLE';
  dispatch(w, { type: 'START_GAME', mode: 'bots', isHost: true, roster: [0, 1].map((s) => ({ seat: s, color: PLAYER_COLORS[s]! })), botSeats: [1] });
  w.localPlayerId = ME;
  bankAdd(w.castleBanks, ME, SparkType.Dot);
  bankAdd(w.castleBanks, ME, SparkType.Dot);
  return w;
}

/** A built (loose) shape of mine sitting exactly on slot `i`. */
function wallSlot(w: World, i: number): void {
  const at = porchSlot(0, i, w.layout);
  const color = w.players.get(ME)!.color;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const p: Primitive = {
    id, type: SparkType.Square, placerColor: color, placedBy: ME, createdTick: w.tick, pos: { ...at }, prevPos: { ...at },
    bonds: new Set(), ownerColor: color, lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, p);
}

function pull(w: World): { cues: number; minted: number } {
  let cues = 0;
  const before = w.freeSparks.size;
  requestPull(w, SparkType.Dot, (a) => dispatch(w, a), () => { cues++; });
  return { cues, minted: w.freeSparks.size - before };
}

describe('⭐ S193 L1 — the refused cue on a pull your own buildings block', () => {
  it('every slot under my own shapes → cue, and the pull really is a no-op (nothing spent)', () => {
    const w = world();
    for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) wallSlot(w, i);
    expect(pullBlockedByBuilt(w, ME, SparkType.Dot)).toBe(true);
    const r = pull(w);
    expect(r).toEqual({ cues: 1, minted: 0 });
    expect(w.castleBanks.get(ME)![SparkType.Dot as number]).toBe(2);
  });

  it('negative — one slot still open → no cue, and the pull lands', () => {
    const w = world();
    // Slots are 30 px apart and the clearance is 34, so a shape on slot 1 also covers slot 0: wall
    // only the far two, leaving slot 0 open.
    for (let i = 2; i < CASTLE_PORCH_SLOTS; i++) wallSlot(w, i);
    expect(pull(w)).toEqual({ cues: 0, minted: 1 });
  });

  it('negative — a porch merely FULL of pulled shapes is the old no-op, not this cue', () => {
    const w = world();
    for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) bankAdd(w.castleBanks, ME, SparkType.Dot);
    for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) expect(pull(w).minted).toBe(1);
    expect(pull(w)).toEqual({ cues: 0, minted: 0 });
  });

  it('negative — nothing banked of that type → no cue (the reducer refuses for another reason)', () => {
    const w = world();
    for (let i = 0; i < CASTLE_PORCH_SLOTS; i++) wallSlot(w, i);
    expect(pullBlockedByBuilt(w, ME, SparkType.Triangle)).toBe(false);
  });
});

describe('S193 L1 — the castle panel’s pull click goes through requestPull (the one pull site)', () => {
  it('main.ts wires setPullHandler → requestPull with the refused thud, and dispatches PULL_FROM_BANK nowhere else', () => {
    const src = readFileSync('src/main.ts', 'utf-8').replace(/\r\n/g, '\n');
    expect(src).toMatch(/setPullHandler\(\(sparkType\) => \{\n\s*requestPull\(world, sparkType, dispatchFn, \(\) => \{ void playUiRefusedSFX\(\); \}\);/);
    expect(src.match(/'PULL_FROM_BANK'/g) ?? []).toHaveLength(0);
  });
});
