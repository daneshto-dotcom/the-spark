/**
 * ⭐⭐ S190 (owner R190-H) — THE RA STRIKE DRAWS ON TOP OF THE UNIT SPRITES. ONLY THE STRIKE.
 *
 * Every boss aura is drawn by `drawBossAuras` into `goblinRenderer`'s ground Graphics, which sits UNDER
 * its unit sprite layer — right for a rot boil or a telegraph shade on the ground, wrong for a column of
 * sunlight and the explosion it makes, which the units were standing in front of. Now ONLY the strike —
 * the owner's sprite frames, or the code-beam shafts when the art has not loaded — goes to the renderer's
 * `arrowLayer`, which is ABOVE the sprite layer. Everything else is unchanged: the rot aura, the sonar,
 * the Ra telegraph shade and outline, the hitbox scorch stay in the ground Graphics.
 *
 * WHAT IS DRIVEN FOR REAL: the real `GoblinRenderer.sync` on a match where seat 0 (mummies, POWER OF RA)
 * has cast a strike, with the owner's SHIPPED manifest sliced by `raStrikeArtFrom`; the assertions read
 * which Pixi Graphics each draw instruction landed in, and the renderer's own child order.
 *
 * ⚠ THE LIMIT, STATED: no renderer runs under vitest, so this proves where the instructions GO and that
 * the destination layer is a LATER child than the sprite layer — which is what Pixi's painter's order
 * uses — not the pixels on screen. Where the goblin renderer sits among the OTHER renderers is decided
 * by `main.ts` construction order, which vitest never runs: the source-text guard at the end proves the
 * two other creature renderers are constructed EARLIER (so their sprites are under the strike too); it
 * proves the lines EXIST in that order, not that they are reached. ⚠ And the renderers constructed LATER
 * — the laser turret's rig, HELGA, the ramp buildings, the stink tower — still draw over the strike.
 * Not asked; a one-line move if he wants it over those as well.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Container, Graphics, Texture, TextureSource, type Application } from 'pixi.js';
import { GoblinRenderer } from './goblinRenderer.ts';
import { raStrikeArtFrom, setRaStrikeArtForTests, type RaStrikeManifest } from './raStrikeArt.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { PLAYER_COLORS, RA_COLUMN_TICKS } from '../constants.ts';
import { asCreatureId, asPlayerId } from '../types.ts';
import { T9_BOSS_TYPE } from '../state/t9BossIds.ts';
import type { Creature } from '../state/creatures/creature.ts';

/* ── Node has no canvas; Pixi measures text through one (health-bar labels, if any). ─────────── */
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
const P1 = asPlayerId(1);
/** bossAuras.ts dials, module-private, restated: the telegraph shade, the hitbox scorch, the rot boil. */
const RA_TELEGRAPH_TINT = 0xffb43c;
const RA_HALO_TINT = 0xffd970;
const RA_COLUMN_TINT = 0xfff3c4;
const ROT_SCORCH_TINT = 0x2a3d18;

function shippedArt(): NonNullable<ReturnType<typeof raStrikeArtFrom>> {
  const m = JSON.parse(readFileSync(join(__dirname, '..', '..', 'public', 'art', 'ra-strike', 'ra-strike-anim.json'), 'utf8')) as RaStrikeManifest;
  const sheet = new Texture({ source: new TextureSource({ width: m.cellW * 12, height: m.cellH * 2, label: 'ra-strike' }) });
  const art = raStrikeArtFrom(sheet, m);
  if (art === null) throw new Error('fixture: the shipped manifest was refused');
  return art;
}

/** Seat 0 = mummies holding POWER OF RA, FIGHT, a strike cast at (700, 400). The raStrikeArt fixture. */
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
  if (w.players.get(P0)!.raStrike === null) throw new Error('fixture: the strike was refused');
  return w;
}

/** A zombie boss (rot aura) somewhere else on the board — an aura that must STAY under the units. */
function addZombieBoss(w: World): void {
  const at = { x: 1300, y: 700 };
  w.creatures.set(asCreatureId(77), {
    id: asCreatureId(77), type: T9_BOSS_TYPE.zombies, ownerPlayerId: P1,
    pos: { ...at }, prevPos: { ...at }, targetPos: { ...at }, state: 'SEEKING', ticksInState: 0,
    spawnedAtTick: 0, despawnAtTick: 1_000_000, ehp: 50, sourceSpawnerId: null,
    targetBondId: null, targetCreatureId: null, targetPrimitiveId: null, killCount: 0, chewProgress: 0,
  } as unknown as Creature);
}

interface Mounted { r: GoblinRenderer; ground: Graphics; sprites: Container; above: Graphics; parent: Container }
function mount(): Mounted {
  const parent = new Container();
  const r = new GoblinRenderer({ stage: parent } as unknown as Application, parent);
  const [ground, sprites, above] = parent.children as [Graphics, Container, Graphics];
  if (!(ground instanceof Graphics) || !(above instanceof Graphics)) throw new Error('fixture: layer shapes changed');
  return { r, ground, sprites, above, parent };
}

type Ins = { action: string; data: { style?: { color?: number } } };
const instructions = (g: Graphics): Ins[] => g.context.instructions as unknown as Ins[];
const textures = (g: Graphics): number => instructions(g).filter((i) => i.action === 'texture').length;
const fillsOf = (g: Graphics, color: number): number =>
  instructions(g).filter((i) => (i.action === 'fill' || i.action === 'stroke') && i.data.style?.color === color).length;

describe('⭐⭐ S190 R190-H — the owner\'s strike art lands in the layer ABOVE the unit sprites', () => {
  it('the layer order is ground < sprites < above (painter\'s order = child order)', () => {
    const { parent, ground, sprites, above } = mount();
    expect(parent.children.indexOf(ground)).toBeLessThan(parent.children.indexOf(sprites));
    expect(parent.children.indexOf(sprites)).toBeLessThan(parent.children.indexOf(above));
  });

  it('REACH — mid-telegraph: the strike frames are in the ABOVE layer, the telegraph shade stays on the GROUND', () => {
    setRaStrikeArtForTests(shippedArt());
    const w = struck();
    w.tick += Math.floor(RA_COLUMN_TICKS / 2); // column 0's rune ring is swelling; its shade is growing
    const { r, ground, above } = mount();
    r.sync(w);
    expect(textures(above), 'the strike sprite frames draw above the units').toBeGreaterThan(0);
    expect(textures(ground), 'and none of them under').toBe(0);
    expect(fillsOf(ground, RA_TELEGRAPH_TINT), 'the telegraph shade is ground, unchanged').toBeGreaterThan(0);
    expect(fillsOf(above, RA_TELEGRAPH_TINT)).toBe(0);
  });

  it('just after an impact: the strike is above, the hitbox scorch stays on the ground', () => {
    setRaStrikeArtForTests(shippedArt());
    const w = struck();
    w.tick += RA_COLUMN_TICKS + 2; // column 0 has just landed
    const { r, ground, above } = mount();
    r.sync(w);
    expect(textures(above)).toBeGreaterThan(0);
    expect(fillsOf(ground, RA_HALO_TINT), 'the scorch states the hitbox on the ground').toBeGreaterThan(0);
    expect(fillsOf(above, RA_HALO_TINT)).toBe(0);
  });

  it('with NO art (the code beam): the shafts are above, the scorch stays on the ground', () => {
    setRaStrikeArtForTests(null);
    const w = struck();
    w.tick += RA_COLUMN_TICKS + 2;
    const { r, ground, above } = mount();
    r.sync(w);
    expect(fillsOf(above, RA_COLUMN_TINT), 'the code shaft is the strike').toBeGreaterThan(0);
    expect(fillsOf(ground, RA_COLUMN_TINT)).toBe(0);
    expect(fillsOf(ground, RA_HALO_TINT)).toBeGreaterThan(0);
  });
});

describe('⛔ S190 R190-H — every OTHER aura is unchanged: still under the sprites', () => {
  it('the zombie boss\'s rot boil draws on the ground, never in the above layer', () => {
    setRaStrikeArtForTests(shippedArt());
    const w = struck();
    addZombieBoss(w);
    const { r, ground, above } = mount();
    r.sync(w);
    expect(fillsOf(ground, ROT_SCORCH_TINT)).toBeGreaterThan(0);
    expect(fillsOf(above, ROT_SCORCH_TINT)).toBe(0);
  });

  it('NEGATIVE — no strike cast: nothing Ra is drawn above the units', () => {
    setRaStrikeArtForTests(shippedArt());
    const w = struck();
    w.players.get(P0)!.raStrike = null;
    const { r, above } = mount();
    r.sync(w);
    expect(textures(above)).toBe(0);
  });
});

describe('⚠ main.ts — the other creature renderers are built BEFORE the goblin renderer (source text; limit above)', () => {
  const code = readFileSync(join(__dirname, '..', 'main.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
  it('new CreatureRenderer( and new ChewerRenderer( precede new GoblinRenderer(', () => {
    const at = (n: string): number => {
      const i = code.indexOf(n);
      expect(i, `${n} must appear in main.ts`).toBeGreaterThanOrEqual(0);
      return i;
    };
    const goblin = at('new GoblinRenderer(');
    expect(at('new CreatureRenderer(')).toBeLessThan(goblin);
    expect(at('new ChewerRenderer(')).toBeLessThan(goblin);
  });
});
