/**
 * ⭐ S193 P3-1 audit MED-1 — **A BOT NEVER WALLS ITS OWN PORCH.** (canon §4b item 3)
 *
 * The castle keep-out is one uniform 61 px disc now, so the porch row (anchor.y + 74) is legal ground,
 * and a pull skips any slot a built shape stands within `CASTLE_PORCH_KEEP_OUT_RADIUS` (34) of. The
 * audit measured HARD BALANCED seat 2 covering ALL FOUR of its slots with its own loose shapes by tick
 * 4620 — 574 of 586 pulls became no-ops for the rest of the match. `isLegalBuildPos` now refuses a
 * point within 34 px of the bot's own slots.
 *
 * REACH: real 4-seat bot matches, 300 s, through the real host tick + the real `BotController`s (the
 * `botPersonality.test.ts` seeds) — porch coverage sampled every 30 ticks.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { CASTLE_PORCH_SLOTS, PLAYER_COLORS } from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import type { Controls } from '../input/controls.ts';
import { porchSlot } from '../state/castleBank.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { runGodlyMatcherCore, type GodlyMatcherCursor } from '../state/godlyMatcherCore.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { mulberry32 } from '../state/rng.ts';
import { dispatch, makeWorld, type GameAction, type World } from '../state/world.ts';
import { CASTLE_PORCH_KEEP_OUT_RADIUS } from '../state/zones.ts';
import { asPlayerId } from '../types.ts';
import { isLegalBuildPos } from './botBrain.ts';
import { BotController } from './botController.ts';
import { SIG_BOT_SEED, SIG_WORLD_SEED } from './botPersonality.fixtures.ts';
import { BOT_PERSONALITIES, resolvePersonality, type BotPersonality } from './botTypes.ts';

afterEach(async () => { await new Promise<void>((r) => setTimeout(r, 0)); });

const R2 = CASTLE_PORCH_KEEP_OUT_RADIUS * CASTLE_PORCH_KEEP_OUT_RADIUS;

function coveredSlots(w: World, seat: number): number {
  let n = 0;
  for (let k = 0; k < CASTLE_PORCH_SLOTS; k++) {
    const s = porchSlot(seat, k, w.layout);
    for (const q of w.primitives.values()) {
      if ((q.pos.x - s.x) ** 2 + (q.pos.y - s.y) ** 2 < R2) { n++; break; }
    }
  }
  return n;
}

function runMatch(p: BotPersonality, seconds: number) {
  const w = makeWorld(SIG_WORLD_SEED);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s]! })), botSeats: [1, 2, 3],
  });
  const rec = [1, 2, 3].map(() => ({ maxCovered: 0, pulls: 0, noop: 0, loose: 0 }));
  const ctl = [1, 2, 3].map((seat, i) => new BotController(
    asPlayerId(seat), 'HARD', mulberry32(((SIG_BOT_SEED ^ ((i + 1) * 0xb07b07)) >>> 0) || 1), 4,
    resolvePersonality(p, SIG_BOT_SEED, i + 1),
  ));
  const send = (i: number) => (a: GameAction) => {
    const r = rec[i]!;
    if (a.type === 'PULL_FROM_BANK') {
      const b = w.freeSparks.size;
      r.pulls++;
      dispatch(w, a);
      if (w.freeSparks.size === b) r.noop++;
      return;
    }
    if (a.type === 'PLACE_FROM_FREE' || a.type === 'PLACE_PRIMITIVE') {
      const b = w.primitives.size;
      dispatch(w, a);
      if (w.primitives.size > b) r.loose++;
      return;
    }
    dispatch(w, a);
  };
  const sends = ctl.map((_, i) => send(i));
  const d = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
    controls: { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls,
    botManager: { tick(world: World) { for (let i = 0; i < 3; i++) ctl[i]!.tick(world, sends[i]!); } },
    gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
  const st = makeHostTickState(w);
  const cur: GodlyMatcherCursor = { lastMatcherTick: -1 };
  for (let t = 0; t < 60 * seconds; t++) {
    runHostTick(w, d, st);
    if ((w.gameState as string) === 'PLAYING') runGodlyMatcherCore(w, cur);
    w.effects.length = 0;
    if (t % 30 === 0) for (let i = 0; i < 3; i++) rec[i]!.maxCovered = Math.max(rec[i]!.maxCovered, coveredSlots(w, i + 1));
  }
  return rec;
}

describe('⭐ S193 MED-1 — REACH: over 300 s no bot covers every slot of its own porch', () => {
  for (const p of BOT_PERSONALITIES) {
    it(`HARD ${p}`, () => {
      const rec = runMatch(p, 300);
      console.log(`[MED-1] HARD ${p}: ${JSON.stringify(rec)}`);
      for (const [i, r] of rec.entries()) {
        expect(r.maxCovered, `seat ${i + 1}: never all ${CASTLE_PORCH_SLOTS} slots`).toBeLessThan(CASTLE_PORCH_SLOTS);
      }
      // Anti-vacuity: the bots really pull and really build loose shapes in these matches.
      expect(rec.reduce((a, r) => a + r.pulls, 0)).toBeGreaterThan(0);
      expect(rec.reduce((a, r) => a + r.loose, 0)).toBeGreaterThan(0);
    }, 120_000);
  }
});

describe('⭐ S193 MED-1 — isLegalBuildPos refuses its OWN porch only', () => {
  it('a point on / within 34 px of an own slot is refused; 1 px past the disc it is legal again', () => {
    const w = makeWorld(SIG_WORLD_SEED);
    w.gameState = 'TITLE';
    dispatch(w, {
      type: 'START_GAME', mode: 'bots', isHost: true,
      roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s]! })), botSeats: [1, 2, 3],
    });
    for (let seat = 0; seat < 4; seat++) {
      for (let k = 0; k < CASTLE_PORCH_SLOTS; k++) {
        const s = porchSlot(seat, k, w.layout);
        expect(isLegalBuildPos(s, asPlayerId(seat), w), `seat ${seat} slot ${k}`).toBe(false);
        // straight down, clear of the other slots (pitch 30 < 34 so sideways stays inside a neighbour's disc)
        const dir = s.y < 540 ? 1 : -1;
        expect(isLegalBuildPos({ x: s.x, y: s.y + dir * (CASTLE_PORCH_KEEP_OUT_RADIUS - 1) }, asPlayerId(seat), w)).toBe(false);
        // Negative: only the TOP castles' porches open onto free ground below them (a bottom porch's
        // upward neighbour is the 61 disc, its downward one the canvas edge), so the reopen is pinned there.
        if (dir === 1) expect(isLegalBuildPos({ x: s.x, y: s.y + CASTLE_PORCH_KEEP_OUT_RADIUS + 1 }, asPlayerId(seat), w)).toBe(true);
      }
    }
  });
});
