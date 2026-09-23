/**
 * SPARK — S188 — the CORPSE EATER's derived animation: the schedule, the ping-pong, and the sheet on disk.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpseEaterElapsed, corpseEaterFrame, showsCorpseEaterFeed, type FeedTiming } from './corpseEaterFrames.ts';
import { CORPSE_EATER_TICKS } from '../state/racial/corpseEater.ts';
import { CORPSE_EATER_FEED_ATLAS_BASE } from './goblinRenderer.ts';
import { t9BossAtlasBase } from '../state/t9BossIds.ts';

const root = join(process.cwd(), 'public');
type Manifest = { cellW: number; cellH: number; footAnchor: { x: number; y: number }; states: Record<string, { frames: number; ticksPerFrame: number }> };
const read = (base: string): Manifest => JSON.parse(readFileSync(join(root, `${base}-anim.json`), 'utf-8'));
const feed = read(CORPSE_EATER_FEED_ATLAS_BASE);
const T: FeedTiming = { feedIn: feed.states.feedIn!, feedLoop: feed.states.feedLoop!, feedOut: feed.states.feedOut! };

describe('S188 CORPSE EATER — the feed sheet on disk', () => {
  it('⭐ both files exist (a failed load is SILENT) and carry the three rows at 12 frames', () => {
    expect(existsSync(join(root, `${CORPSE_EATER_FEED_ATLAS_BASE}-atlas.png`))).toBe(true);
    for (const r of ['feedIn', 'feedLoop', 'feedOut']) expect(feed.states[r]?.frames, r).toBe(12);
  });

  it('⭐⭐ same cell and foot anchor as his main sheet — the one sprite switches sheets without moving', () => {
    const main = read(t9BossAtlasBase('zombies'));
    expect(feed.cellW).toBe(main.cellW);
    expect(feed.cellH).toBe(main.cellH);
    expect(feed.footAnchor).toEqual(main.footAnchor);
  });
});

describe('S188 CORPSE EATER — the schedule inside the 480-tick window', () => {
  const at = (e: number) => corpseEaterFrame(e, T);
  const inTicks = T.feedIn.frames * T.feedIn.ticksPerFrame;
  const outStart = CORPSE_EATER_TICKS - T.feedOut.frames * T.feedOut.ticksPerFrame;

  it('sits down first, from frame 0', () => {
    expect(at(0)).toEqual({ row: 'feedIn', index: 0 });
    expect(at(inTicks - 1)).toEqual({ row: 'feedIn', index: T.feedIn.frames - 1 });
  });

  it('⭐ the loop CONTINUES from the sit-down — it starts on its LAST frame and runs backward', () => {
    expect(at(inTicks)).toEqual({ row: 'feedLoop', index: T.feedLoop.frames - 1 });
    expect(at(inTicks + T.feedLoop.ticksPerFrame)).toEqual({ row: 'feedLoop', index: T.feedLoop.frames - 2 });
  });

  it('⭐⭐ PING-PONG: consecutive frames never jump by more than one — the loop closes by construction', () => {
    let prev = at(inTicks).index;
    for (let e = inTicks + 1; e < outStart; e++) {
      const f = at(e);
      expect(f.row).toBe('feedLoop');
      expect(Math.abs(f.index - prev), `tick ${e}`).toBeLessThanOrEqual(1);
      prev = f.index;
    }
  });

  it('⭐ the burp ENDS on the window’s last tick, on its last frame', () => {
    expect(at(outStart)).toEqual({ row: 'feedOut', index: 0 });
    expect(at(CORPSE_EATER_TICKS - 1)).toEqual({ row: 'feedOut', index: T.feedOut.frames - 1 });
    expect(at(CORPSE_EATER_TICKS + 50), 'a late snapshot is clamped').toEqual(at(CORPSE_EATER_TICKS - 1));
  });

  it('elapsed is derived from the synced deadline alone', () => {
    expect(corpseEaterElapsed(1480, 1000)).toBe(0);
    expect(corpseEaterElapsed(1480, 1479)).toBe(CORPSE_EATER_TICKS - 1);
  });
});

describe('S188 audit F5 — the feed is drawn only while it is really happening', () => {
  const feeding = { corpseEaterUntilTick: 1480, stunnedUntilTick: undefined };
  it('⭐ in FIGHT, inside the window, unstunned: drawn', () => {
    expect(showsCorpseEaterFeed(feeding, { tick: 1100, matchPhase: 'FIGHT' })).toBe(true);
  });
  it('⭐⭐ in BUILD — the window straddled the whistle and he was recalled home — NOT drawn', () => {
    expect(showsCorpseEaterFeed(feeding, { tick: 1100, matchPhase: 'BUILD' })).toBe(false);
  });
  it('stunned (R152 idle pose), or outside the window: not drawn', () => {
    expect(showsCorpseEaterFeed({ ...feeding, stunnedUntilTick: 1200 }, { tick: 1100, matchPhase: 'FIGHT' })).toBe(false);
    expect(showsCorpseEaterFeed(feeding, { tick: 1480, matchPhase: 'FIGHT' })).toBe(false);
    expect(showsCorpseEaterFeed({ corpseEaterUntilTick: undefined, stunnedUntilTick: undefined }, { tick: 5, matchPhase: 'FIGHT' })).toBe(false);
  });
});
