/**
 * ⭐ S191 C-3 (SWM-6) — THE BAT SWARM WITH NO SHEET DRAWS AS THE BAT AT 2×, THROUGH THE REAL DRAW LOOP.
 *
 * The swarm's sheet (2400×800) is fetched on the PICK, not at match start (S190 SW-7,
 * `batSwarmSheetWarm.test.ts`), so between the pick and the fetch resolving — or for good on a peer
 * whose fetch 404s — a swarm on the board has no sheet of its own. `atlasFallbackType` hands it the
 * ordinary bat's (`t3BatSwarm → t3Bat`) and the scale stays keyed by its TYPE, so it is the bat at
 * `BAT_SWARM_SPRITE_SCALE_MUL`. S190 tested that arm in the portrait and in the pure function; NOTHING
 * drove the DRAW LOOP through it (SWM-6). The elite piranha's twin is `s189EliteFallback.test.ts`.
 *
 * REACH: the real `GoblinRenderer.sync`, the network stubbed at its two real seams (`fetch` for the
 * manifest, Pixi `Assets.load` for the PNG), the SHIPPED manifests read off disk. The swarm's manifest
 * 404s; the bat's resolves. What is asserted is the Sprite the renderer actually built.
 * Mutation-tested: dropping the draw loop's `?? atlases.get(fallbackType)` arm turns the REACH test red.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Assets, Container, Sprite, Texture, TextureSource, type Application } from 'pixi.js';
import { GOBLIN_SPRITE_BASE_SCALE, PLAYER_COLORS, phaseDurationTicks } from '../constants.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { asCreatureId, makeCreature, type CreatureType } from '../state/creatures/creature.ts';
import { getCreatureConfig } from '../state/creatures/voltkin-config.ts';
import { asPlayerId, asSpawnerId } from '../types.ts';
import { ATLASES, BAT_SWARM_ATLAS_BASE, GoblinRenderer } from './goblinRenderer.ts';
import { BAT_SWARM_SPRITE_SCALE_MUL } from './towerFrames.ts';

const P0 = asPlayerId(0);
const PUBLIC = join(__dirname, '..', '..', 'public');
const BAT_BASE = ATLASES.t3Bat!;

/** The shipped PNG sizes (read off the files' IHDR), so every manifest cell lies inside its texture. */
function pngSize(base: string): { width: number; height: number } {
  const b = readFileSync(join(PUBLIC, `${base}-atlas.png`));
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

/** The network, stubbed at its two real seams. `swarmOk` decides whether the swarm's sheet exists. */
function stubNetwork(swarmOk: boolean): void {
  vi.stubGlobal('fetch', async (url: string) => {
    const isSwarm = url.startsWith(BAT_SWARM_ATLAS_BASE);
    return {
      json: async () => {
        // A 404 answers with an HTML page, and `.json()` on it throws — exactly what the loader catches.
        if (isSwarm && !swarmOk) throw new SyntaxError(`Unexpected token '<' (404 ${url})`);
        return JSON.parse(readFileSync(join(PUBLIC, url), 'utf8'));
      },
    };
  });
  vi.spyOn(Assets, 'load').mockImplementation((async (url: string) => {
    const base = url.replace(/-atlas\.png$/, '');
    return new Texture({ source: new TextureSource({ ...pngSize(base), label: url }) });
  }) as never);
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

function board(): World {
  const w = makeWorld(0x191c3);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  w.players.get(P0)!.raceId = 'vampires';
  return w;
}

function add(w: World, type: CreatureType, x: number): void {
  const c = makeCreature(getCreatureConfig(type), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: P0, pos: { x, y: 500 }, targetPos: { x, y: 500 },
    spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(900 + w.creatures.size), clock: w,
  });
  w.creatures.set(c.id, c);
}

/** Drive the real renderer: first sync starts the loads, they settle, the second sync draws. */
async function drawn(w: World): Promise<Sprite[]> {
  const parent = new Container();
  const r = new GoblinRenderer({ stage: parent } as unknown as Application, parent);
  r.sync(w);
  await settle();
  r.sync(w);
  const spriteLayer = parent.children[1] as Container; // graphics, then the sprite layer, then arrows
  return spriteLayer.children.filter((c): c is Sprite => c instanceof Sprite);
}

const sheetOf = (s: Sprite): string => String(s.texture.source.label);

let errors: ReturnType<typeof vi.spyOn>;
let warns: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errors = vi.spyOn(console, 'error');
  warns = vi.spyOn(console, 'warn');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('⭐ S191 C-3 (SWM-6) — REACH: the swarm sheet 404s, the real draw loop draws the bat at 2×', () => {
  it('one sprite, cut from the BAT sheet, at the swarm\'s ×2 scale — and zero console errors', async () => {
    stubNetwork(false);
    const w = board();
    add(w, 't3BatSwarm', 500);
    const sprites = await drawn(w);
    expect(sprites).toHaveLength(1);
    expect(sheetOf(sprites[0]!)).toBe(`${BAT_BASE}-atlas.png`);
    expect(Math.abs(sprites[0]!.scale.y)).toBeCloseTo(GOBLIN_SPRITE_BASE_SCALE * BAT_SWARM_SPRITE_SCALE_MUL, 10);
    expect(BAT_SWARM_SPRITE_SCALE_MUL, 'anti-vacuity: the ×2 is distinguishable from the bat\'s ×1').toBeGreaterThan(1);
    expect(errors).not.toHaveBeenCalled();
    expect(warns).not.toHaveBeenCalled();
  });

  it('a swarm beside a plain bat: both drawn from the bat sheet, each at its own type\'s scale', async () => {
    stubNetwork(false);
    const w = board();
    add(w, 't3Bat', 300);
    add(w, 't3BatSwarm', 700);
    const sprites = await drawn(w);
    expect(sprites).toHaveLength(2);
    const scales = sprites.map((s) => Math.abs(s.scale.y)).sort((a, b) => a - b);
    expect(scales[0]).toBeCloseTo(GOBLIN_SPRITE_BASE_SCALE, 10);
    expect(scales[1]).toBeCloseTo(GOBLIN_SPRITE_BASE_SCALE * BAT_SWARM_SPRITE_SCALE_MUL, 10);
    for (const s of sprites) expect(sheetOf(s)).toBe(`${BAT_BASE}-atlas.png`);
  });
});

describe('⛔ NEGATIVES — the fallback only ever fills a gap', () => {
  it('with the swarm sheet present, the swarm draws from ITS OWN sheet (the fallback never overrides it)', async () => {
    stubNetwork(true);
    const w = board();
    add(w, 't3BatSwarm', 500);
    const sprites = await drawn(w);
    expect(sprites).toHaveLength(1);
    expect(sheetOf(sprites[0]!)).toBe(`${BAT_SWARM_ATLAS_BASE}-atlas.png`);
    expect(Math.abs(sprites[0]!.scale.y)).toBeCloseTo(GOBLIN_SPRITE_BASE_SCALE * BAT_SWARM_SPRITE_SCALE_MUL, 10);
  });

  it('a plain bat is untouched — its own sheet, ×1', async () => {
    stubNetwork(false);
    const w = board();
    add(w, 't3Bat', 500);
    const sprites = await drawn(w);
    expect(sprites).toHaveLength(1);
    expect(sheetOf(sprites[0]!)).toBe(`${BAT_BASE}-atlas.png`);
    expect(Math.abs(sprites[0]!.scale.y)).toBeCloseTo(GOBLIN_SPRITE_BASE_SCALE, 10);
  });

  it('the borrowed bat sheet carries every row the swarm\'s own does (no animation state comes up empty)', () => {
    const rows = (base: string): string[] =>
      Object.keys(JSON.parse(readFileSync(join(PUBLIC, `${base}-anim.json`), 'utf8')).states).sort();
    expect(rows(BAT_BASE)).toEqual(expect.arrayContaining(rows(BAT_SWARM_ATLAS_BASE)));
  });
});
