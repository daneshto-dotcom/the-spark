/**
 * ⭐⭐ S191 C-9 (owner R190-H, extended) — THE RA STRIKE DRAWS ABOVE THE BUILDINGS; THE RUNE RING IT IS
 * ANNOUNCED WITH STAYS ON THE GROUND.
 *
 * S190 put the strike in `goblinRenderer.arrowLayer` — above the units, but every renderer `main.ts` builds
 * later (the laser rig, the Voltkin TV, HELGA, the ramp buildings, the stink tower) still drew over it, and
 * the art's first four frames (the rune ring alone, swelling on the ground before anything falls) were
 * drawn over the units standing in it. Now:
 *   · `main.ts` stages `raStrikeLayer` as the LAST child of `fogHiddenLayer` and hands it to the goblin
 *     renderer, which sends the strike there (above every building, still under the fog's mask);
 *   · slots < `RA_STRIKE_GROUND_SLOTS` (sheet frames 1-4) draw into the GROUND Graphics, under the units.
 *
 * DRIVEN FOR REAL: the real `GoblinRenderer.sync` on a match where seat 0 (mummies, POWER OF RA) has cast,
 * with the owner's SHIPPED manifest sliced by `raStrikeArtFrom`; the assertions read which Pixi Graphics
 * each draw instruction landed in.
 *
 * ⚠ THE LIMIT, STATED: vitest never runs `main.ts`, so where `raStrikeLayer` sits among the stage's other
 * renderers is proven by the source-text guard at the end — it proves the staging line EXISTS after every
 * other `fogHiddenLayer` parent and that the hand-off line exists, NOT that either is reached. The e2e roll
 * call (`e2e/fog.spec.ts`, index 19) is the runtime check.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Container, Graphics, Texture, TextureSource, type Application } from 'pixi.js';
import { GoblinRenderer } from './goblinRenderer.ts';
import {
  RA_STRIKE_FRAME_TICKS, RA_STRIKE_GROUND_SLOTS, raStrikeArtFrom, raStrikeFrameAt, setRaStrikeArtForTests,
  type RaStrikeManifest,
} from './raStrikeArt.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { PLAYER_COLORS, RA_COLUMN_TICKS } from '../constants.ts';
import { asPlayerId } from '../types.ts';

class FakeContext2D {
  font = '10px sans-serif';
  letterSpacing = '0px';
  textLetterSpacing = '0px';
  measureText(s: string): { width: number; actualBoundingBoxLeft: number; actualBoundingBoxRight: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number } {
    const px = Number(/(\d+)px/.exec(this.font)?.[1] ?? 10);
    const w = s.length * px * 0.6;
    return { width: w, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w, actualBoundingBoxAscent: px * 0.8, actualBoundingBoxDescent: px * 0.2 };
  }
}
class FakeOffscreenCanvas {
  constructor(public width: number, public height: number) {}
  getContext(): FakeContext2D {
    return new FakeContext2D();
  }
}
vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
vi.stubGlobal('CanvasRenderingContext2D', FakeContext2D);
afterEach(() => setRaStrikeArtForTests(null));

const P0 = asPlayerId(0);
const RA_TELEGRAPH_TINT = 0xffb43c; // bossAuras.ts, module-private, restated

function shippedArt(): NonNullable<ReturnType<typeof raStrikeArtFrom>> {
  const m = JSON.parse(readFileSync(join(__dirname, '..', '..', 'public', 'art', 'ra-strike', 'ra-strike-anim.json'), 'utf8')) as RaStrikeManifest;
  const sheet = new Texture({ source: new TextureSource({ width: m.cellW * 12, height: m.cellH * 2, label: 'ra-strike' }) });
  const art = raStrikeArtFrom(sheet, m);
  if (art === null) throw new Error('fixture: the shipped manifest was refused');
  return art;
}

/** Seat 0 = mummies holding POWER OF RA, FIGHT, one strike cast at (700, 400) on the current tick. */
function struck(): World {
  const w = makeWorld(0x2a);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0]!, raceId: 'mummies' },
      { seat: 1, color: PLAYER_COLORS[1]!, raceId: 'orcs' },
    ],
  });
  dispatch(w, { type: 'CHOOSE_DRAFT', playerId: P0, pick: 'racial' });
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  dispatch(w, { type: 'CAST_POWER_OF_RA', playerId: P0, x: 700, y: 400 });
  if (w.players.get(P0)!.raStrikes.length === 0) throw new Error('fixture: the strike was refused');
  return w;
}

interface Mounted { r: GoblinRenderer; ground: Graphics; arrow: Graphics; strike: Graphics }
/** The game's arrangement: the goblin renderer's three children, then the stage's LAST child, the strike. */
function mount(withStrikeLayer = true): Mounted {
  const parent = new Container();
  const r = new GoblinRenderer({ stage: parent } as unknown as Application, parent);
  const [ground, , arrow] = parent.children as [Graphics, Container, Graphics];
  const strike = new Graphics();
  parent.addChild(strike);
  if (withStrikeLayer) r.setRaStrikeLayer(strike);
  return { r, ground, arrow, strike };
}

type Ins = { action: string; data: { style?: { color?: number } } };
const instructions = (g: Graphics): Ins[] => g.context.instructions as unknown as Ins[];
const textures = (g: Graphics): number => instructions(g).filter((i) => i.action === 'texture').length;
const fillsOf = (g: Graphics, color: number): number =>
  instructions(g).filter((i) => (i.action === 'fill' || i.action === 'stroke') && i.data.style?.color === color).length;

describe('⭐ S191 C-9 — arithmetic: the ground slots are exactly the rune ring of the timeline', () => {
  it('slots 0-3 cover −120 … −49 (the ring alone); slot 4 starts at −48, the beam\'s drop', () => {
    expect(RA_STRIKE_GROUND_SLOTS).toBe(4);
    const ringTicks = RA_STRIKE_FRAME_TICKS.slice(0, RA_STRIKE_GROUND_SLOTS).reduce((a, b) => a + b, 0);
    expect(ringTicks).toBe(72);
    const impact = 10_000;
    expect(raStrikeFrameAt(impact - RA_COLUMN_TICKS, impact)).toBe(0);
    expect(raStrikeFrameAt(impact - RA_COLUMN_TICKS + ringTicks - 1, impact)).toBe(RA_STRIKE_GROUND_SLOTS - 1);
    expect(raStrikeFrameAt(impact - RA_COLUMN_TICKS + ringTicks, impact)).toBe(RA_STRIKE_GROUND_SLOTS);
  });
});

describe('⭐⭐ S191 C-9 — REACH through the real GoblinRenderer.sync', () => {
  it('the rune ring (mid-telegraph) is on the GROUND, under the units — nothing in the strike or arrow layer', () => {
    setRaStrikeArtForTests(shippedArt());
    const w = struck();
    w.tick += Math.floor(RA_COLUMN_TICKS / 2); // column 0 at −60: slot 2, the ring swelling
    const { r, ground, arrow, strike } = mount();
    r.sync(w);
    expect(textures(ground), 'the ring draws on the ground').toBeGreaterThan(0);
    expect(textures(strike)).toBe(0);
    expect(textures(arrow)).toBe(0);
    expect(fillsOf(ground, RA_TELEGRAPH_TINT), 'beside the shade it announces').toBeGreaterThan(0);
  });

  it('the beam dropping draws in the STRIKE layer (above the buildings), not the arrow layer, not the ground', () => {
    setRaStrikeArtForTests(shippedArt());
    const w = struck();
    w.tick += RA_COLUMN_TICKS - 40; // column 0 at −40: slot 5
    const { r, ground, arrow, strike } = mount();
    r.sync(w);
    expect(textures(strike)).toBeGreaterThan(0);
    expect(textures(arrow), 'the S190 layer no longer holds it').toBe(0);
    expect(textures(ground)).toBe(0);
  });

  it('one frame holds both: column 0\'s flash goes UP while column 1\'s fresh ring stays DOWN', () => {
    setRaStrikeArtForTests(shippedArt());
    const w = struck();
    w.tick += RA_COLUMN_TICKS + 2; // column 0 just landed (slot 9); column 1 announced 2 ticks ago (slot 0)
    const { r, ground, strike } = mount();
    r.sync(w);
    expect(textures(strike), 'the flash').toBeGreaterThan(0);
    expect(textures(ground), 'exactly one ring frame: column 1\'s').toBe(1);
  });

  it('the strike layer is CLEARED every frame — a finished strike leaves nothing behind', () => {
    setRaStrikeArtForTests(shippedArt());
    const w = struck();
    w.tick += RA_COLUMN_TICKS - 40;
    const { r, strike } = mount();
    r.sync(w);
    expect(textures(strike)).toBeGreaterThan(0);
    w.players.get(P0)!.raStrikes = [];
    r.sync(w);
    expect(textures(strike)).toBe(0);
  });
});

describe('⛔ S191 C-9 — negatives', () => {
  it('no strike layer handed in (the renderer alone): the strike falls back to the arrow layer, as S190', () => {
    setRaStrikeArtForTests(shippedArt());
    const w = struck();
    w.tick += RA_COLUMN_TICKS - 40;
    const { r, arrow, strike } = mount(false);
    r.sync(w);
    expect(textures(arrow)).toBeGreaterThan(0);
    expect(textures(strike)).toBe(0);
  });

  it('no strike cast: nothing is drawn in the strike layer', () => {
    setRaStrikeArtForTests(shippedArt());
    const w = struck();
    w.players.get(P0)!.raStrikes = [];
    const { r, strike } = mount();
    r.sync(w);
    expect(textures(strike)).toBe(0);
  });
});

describe('⚠ main.ts — raStrikeLayer is the LAST child staged on fogHiddenLayer (source text; limit in the header)', () => {
  const code = readFileSync(join(__dirname, '..', 'main.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
  it('every `(app, fogHiddenLayer)` renderer and every other `fogHiddenLayer.addChild(` precedes it, and it is handed over', () => {
    const staged = code.indexOf('fogHiddenLayer.addChild(raStrikeLayer)');
    expect(staged, 'the staging line').toBeGreaterThan(0);
    // Mechanical: enumerate every line that parents something to fogHiddenLayer.
    const parents = [...code.matchAll(/new \w+\(app, fogHiddenLayer\)|fogHiddenLayer\.addChild\(/g)].map((m) => m.index!);
    expect(parents.length, 'anti-vacuity: 14 renderers + this line').toBe(15);
    expect(Math.max(...parents), 'nothing is parented to fogHiddenLayer after the strike layer').toBe(staged);
    expect(code.indexOf('goblinRenderer.setRaStrikeLayer(raStrikeLayer)')).toBeGreaterThan(staged);
  });
});
