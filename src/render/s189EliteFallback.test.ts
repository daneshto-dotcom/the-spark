/**
 * ⭐ S189 LOW (b) — THE ELITE PIRANHA WITH NO SHEET DRAWS AS THE BASE PIRANHA AT 2×, NEVER GREEN.
 *
 * `loadAtlas` swallows a failed fetch, so an elite whose own sheet is missing (a 404 on some peer, or
 * simply still in flight) used to fall to `drawGoblin`'s green procedural puppet — the look the owner
 * has reported as a regression twice. `atlasFallbackType` now hands it the ordinary piranha's sheet,
 * and the scale stays keyed by its TYPE, so it is the base piranha at `PIRANHA_ELITE_SPRITE_SCALE_MUL`.
 *
 * REACH: the real `GoblinRenderer.sync`, with the network stubbed at its two real seams (`fetch` for
 * the manifest, Pixi `Assets.load` for the PNG) and the SHIPPED manifests read off disk. The elite's
 * manifest 404s; the piranha's resolves. What is asserted is the Sprite the renderer actually built.
 * Mutation-tested: dropping the `?? atlases.get(fallbackType)` arm turns the REACH test red.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Assets, Container, Sprite, Texture, TextureSource, type Application } from 'pixi.js';
import { GOBLIN_SPRITE_BASE_SCALE, PLAYER_COLORS, phaseDurationTicks } from '../constants.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { asCreatureId, makeCreature, type CreatureType } from '../state/creatures/creature.ts';
import { CREATURE_CONFIGS, getCreatureConfig } from '../state/creatures/voltkin-config.ts';
import { asPlayerId, asSpawnerId } from '../types.ts';
import { ATLASES, GoblinRenderer, PIRANHA_ELITE_ATLAS_BASE, atlasFallbackType } from './goblinRenderer.ts';
import { PIRANHA_ELITE_SPRITE_SCALE_MUL } from './towerFrames.ts';

const P0 = asPlayerId(0);
const PUBLIC = join(__dirname, '..', '..', 'public');
const PIRANHA_BASE = ATLASES.t3Piranha!;

/** The network, stubbed at its two real seams. `eliteOk` decides whether the elite's sheet exists. */
function stubNetwork(eliteOk: boolean): void {
  vi.stubGlobal('fetch', async (url: string) => {
    const onDisk = join(PUBLIC, url);
    const isElite = url.startsWith(PIRANHA_ELITE_ATLAS_BASE);
    return {
      json: async () => {
        // A 404 answers with an HTML page, and `.json()` on it throws — exactly what the loader catches.
        if (isElite && !eliteOk) throw new SyntaxError(`Unexpected token '<' (404 ${url})`);
        return JSON.parse(readFileSync(onDisk, 'utf8'));
      },
    };
  });
  vi.spyOn(Assets, 'load').mockImplementation((async (url: string) =>
    new Texture({ source: new TextureSource({ width: 2712, height: 800, label: url }) })) as never);
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

function board(): World {
  const w = makeWorld(0x189b);
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
  w.players.get(P0)!.raceId = 'nagas';
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

describe('⭐ S189 LOW (b) — REACH: the elite sheet 404s, the real renderer draws the base piranha at 2×', () => {
  it('one sprite, cut from the PIRANHA sheet, at the elite\'s ×2 scale — and zero console errors', async () => {
    stubNetwork(false);
    const w = board();
    add(w, 't3PiranhaElite', 500);
    const sprites = await drawn(w);
    expect(sprites).toHaveLength(1);
    expect(sheetOf(sprites[0]!)).toBe(`${PIRANHA_BASE}-atlas.png`);
    expect(Math.abs(sprites[0]!.scale.y)).toBeCloseTo(GOBLIN_SPRITE_BASE_SCALE * PIRANHA_ELITE_SPRITE_SCALE_MUL, 10);
    expect(errors).not.toHaveBeenCalled();
    expect(warns).not.toHaveBeenCalled();
  });
});

describe('⛔ NEGATIVES — the fallback only ever fills a gap', () => {
  it('with the elite sheet present, the elite draws from ITS OWN sheet (the fallback never overrides it)', async () => {
    stubNetwork(true);
    const w = board();
    add(w, 't3PiranhaElite', 500);
    const sprites = await drawn(w);
    expect(sprites).toHaveLength(1);
    expect(sheetOf(sprites[0]!)).toBe(`${PIRANHA_ELITE_ATLAS_BASE}-atlas.png`);
  });

  it('a plain piranha is untouched — its own sheet, ×1', async () => {
    stubNetwork(false);
    const w = board();
    add(w, 't3Piranha', 500);
    const sprites = await drawn(w);
    expect(sprites).toHaveLength(1);
    expect(sheetOf(sprites[0]!)).toBe(`${PIRANHA_BASE}-atlas.png`);
    expect(Math.abs(sprites[0]!.scale.y)).toBeCloseTo(GOBLIN_SPRITE_BASE_SCALE, 10);
  });

  it('every other creature type has NO fallback (only the elite and the bat swarm borrow a sheet)', () => {
    // ⭐ S190 merge (swarm × render) — re-pinned to the UNION: s188/swarm's `t3BatSwarm → t3Bat` arm is the
    // one other borrower. Still EXCLUSIVE: any third type that starts borrowing turns this red.
    for (const t of Object.keys(CREATURE_CONFIGS) as CreatureType[]) {
      expect(atlasFallbackType(t), t).toBe(t === 't3PiranhaElite' ? 't3Piranha' : t === 't3BatSwarm' ? 't3Bat' : null);
    }
  });

  it('the borrowed sheet carries every row the elite\'s own does (so no animation state can come up empty)', () => {
    const rows = (base: string): string[] =>
      Object.keys(JSON.parse(readFileSync(join(PUBLIC, `${base}-anim.json`), 'utf8')).states).sort();
    expect(rows(PIRANHA_BASE)).toEqual(expect.arrayContaining(rows(PIRANHA_ELITE_ATLAS_BASE)));
  });
});
