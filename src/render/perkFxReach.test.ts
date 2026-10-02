/**
 * S193 `s193/visuals-racial` (visuals-3) — **REACH: EVERY RACIAL-PERK EFFECT, DRIVEN BY ITS REAL RENDERER
 * OFF SYNCED STATE THE REAL SIM WROTE.**
 *
 * A source guard proves a line exists, not that it is reached (CLAUDE.md, S182 §2). So each case below
 * runs the production `sync` of the renderer that owns the effect, with the fx layers installed as
 * recording sinks (`setFxHooks` — the seam `installFx` uses), and asserts what reached the layer:
 *   · V14 rage — the real `runWarlordRage` + `runBloodFrenzy` set `enraged`; `GoblinRenderer.sync` lights it.
 *   · V11 lifesteal — the real `damageEntity` (→ `applyLifesteal` → `noteCreatureHeal`) raises
 *     `healedFifths`; the next `sync` throws motes from the victim.
 *   · V18 corpse eater · V21 elites — the synced stamp / the promoted type, through `GoblinRenderer.sync`.
 *   · V22 hellspawn — a split child's first sighting, through `ChewerRenderer.sync`.
 *   · V19 deep current — a real snap-sized jump, through `GathererRenderer.sync`.
 *   · V12 scorch — the real host tick carries a demons board BUILD → FIGHT; `ZoneBackgroundRenderer.sync`.
 *   · V26 grade — the bake key the real `sync` uses, graded with fx on and original under legacy.
 * Each has its NEGATIVE. No WebGL runs here; this proves what is handed to the fx layers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Texture, type Application } from 'pixi.js';
import { PLAYER_COLORS, phaseDurationTicks } from '../constants.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { asCreatureId, creatureMaxEhp, makeCreature, type Creature, type CreatureType } from '../state/creatures/creature.ts';
import { getCreatureConfig } from '../state/creatures/voltkin-config.ts';
import { makeGatherer, castleAnchor } from '../state/gatherers/gatherer.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from '../state/rng.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import type { Controls } from '../input/controls.ts';
import { runWarlordRage } from '../state/bossSkillsWarlord.ts';
import { runBloodFrenzy } from '../state/racial/bloodFrenzy.ts';
import { damageEntity } from '../state/damage.ts';
import { CORPSE_EATER_TICKS } from '../state/racial/corpseEater.ts';
import { RACE_TOWER_UNIT } from '../state/raceTowerIds.ts';
import { T9_BOSS_TYPE } from '../state/t9BossIds.ts';
import { RACE_COLORS, type RaceId } from '../state/races.ts';
import type { DraftPick } from '../state/draft.ts';
import { asGathererId, asPlayerId, asSpawnerId, type PlayerId } from '../types.ts';
import { NULL_SHOCK, recordingSink, type FxEmitRecord } from './fx/emitter.ts';
import { setFxHazeHook, setFxHooks, setFxLegacyFlag, type FxHazeTarget } from './fx/fxState.ts';
import { LIFESTEAL_FX_COLOR, RAGE_FX_COLOR, burnFlickerFx } from './fx/perkFx.ts';
import { GoblinRenderer } from './goblinRenderer.ts';
import { ChewerRenderer } from './chewerRenderer.ts';
import { DEEP_CURRENT_JUMP_PX, GathererRenderer } from './gathererRenderer.ts';
import { HELGA_FLAME_SCALE, ZoneBackgroundRenderer, burningZonesNow, drawScorchFx } from './zoneBackgroundRenderer.ts';
import { makeDefender } from '../state/defenders/defender.ts';
import { BURN_FLICKER_MAX_UNITS } from './fx/perkFx.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

let top: ReturnType<typeof recordingSink>;
let shade: ReturnType<typeof recordingSink>;
let ground: ReturnType<typeof recordingSink>;
beforeEach(() => {
  top = recordingSink(); shade = recordingSink(); ground = recordingSink();
  setFxHooks({ top, shade, ground, shock: NULL_SHOCK });
  setFxLegacyFlag(false);
  // No network under vitest: every atlas fetch fails quietly, and the renderers draw their fallbacks.
  vi.stubGlobal('fetch', async () => { throw new Error('offline (test)'); });
});
afterEach(() => {
  setFxHooks(null);
  setFxLegacyFlag(false);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const clearSinks = (): void => { top.out.length = 0; shade.out.length = 0; ground.out.length = 0; };
const tinted = (out: FxEmitRecord[], tint: number): FxEmitRecord[] => out.filter((e) => e.tint === tint);

function board(phase: 'BUILD' | 'FIGHT', race0: RaceId, picks: DraftPick[]): World {
  const w = makeWorld(0x193f);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.draft = null;
  w.creatures.clear();
  w.tick = 1000;
  w.matchPhase = phase;
  w.phaseEndsAtTick = w.tick + phaseDurationTicks(phase);
  const pl = w.players.get(P0)!;
  pl.raceId = race0;
  pl.draftPicks = [...picks];
  return w;
}

function add(w: World, type: CreatureType, owner: PlayerId, x: number, y = 500): Creature {
  const c = makeCreature(getCreatureConfig(type), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: owner, pos: { x, y }, targetPos: { x, y },
    spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(900 + w.creatures.size), clock: w,
  });
  c.state = 'SEEKING';
  w.creatures.set(c.id, c);
  return c;
}

const goblins = (): GoblinRenderer => {
  const parent = new Container();
  return new GoblinRenderer({ stage: parent } as unknown as Application, parent);
};

describe('V14 RAGE — the real rage latch and BLOOD FRENZY, lit by the real GoblinRenderer', () => {
  it('⭐ a Warlord below the line and the orc unit he frenzies glow; the goblin beside them never does', () => {
    const w = board('FIGHT', 'orcs', ['racial']); // orcs.l0 = BLOOD FRENZY
    const lord = add(w, T9_BOSS_TYPE.orcs as CreatureType, P0, 400);
    lord.ehp = Math.floor(creatureMaxEhp(lord) * 0.4);
    const warband = add(w, RACE_TOWER_UNIT.orcs as CreatureType, P0, 600);
    const goblin = add(w, 'goblinMelee', P0, 800);
    runWarlordRage(w);
    runBloodFrenzy(w);
    expect([lord.enraged, warband.enraged, goblin.enraged === true]).toEqual([true, true, false]);
    goblins().sync(w);
    const pools = tinted(ground.out, RAGE_FX_COLOR);
    expect(pools.map((p) => p.x).sort((a, b) => a - b)).toEqual([400, 600]);
  });

  it('⛔ negative: a healthy Warlord (no rage) draws no rage light at all', () => {
    const w = board('FIGHT', 'orcs', ['racial']);
    add(w, T9_BOSS_TYPE.orcs as CreatureType, P0, 400);
    runWarlordRage(w);
    goblins().sync(w);
    expect(tinted(ground.out, RAGE_FX_COLOR)).toEqual([]);
  });

  it('⛔ `?fx=legacy`: the same raging Warlord draws nothing on the fx layers', () => {
    const w = board('FIGHT', 'orcs', ['racial']);
    const lord = add(w, T9_BOSS_TYPE.orcs as CreatureType, P0, 400);
    lord.ehp = Math.floor(creatureMaxEhp(lord) * 0.4);
    runWarlordRage(w);
    setFxLegacyFlag(true);
    goblins().sync(w);
    expect([...top.out, ...ground.out]).toEqual([]);
  });
});

describe('V11 BLOOD DEBT — a real lifesteal heal throws crimson motes from the victim', () => {
  function duel(picks: DraftPick[]): { w: World; r: GoblinRenderer; atk: Creature; vic: Creature } {
    const w = board('FIGHT', 'vampires', picks);
    const atk = add(w, 'goblinMelee', P0, 500);
    atk.ehp = 2; // hurt, so the heal lands (never an overheal)
    const vic = add(w, 'goblinMelee', P1, 530);
    const r = goblins();
    r.sync(w); // the first sighting is never a heal
    clearSinks();
    return { w, r, atk, vic };
  }

  it('⭐ the hit heals the attacker (sim) and the next frames carry motes from the victim to him', () => {
    const { w, r, atk, vic } = duel(['racial']); // vampires.l0
    const before = atk.healedFifths ?? 0;
    // A 2-fifth jab — the victim survives it, so the motes have a living source (heal = the floor of 1).
    damageEntity(w, { kind: 'creature', id: vic.id }, 2, 'melee' as never, { kind: 'creature', id: atk.id }, 'physical');
    expect(vic.ehp, 'fixture: the victim lives').toBeGreaterThan(0);
    expect(atk.healedFifths ?? 0, 'fixture: the real lifesteal healed him').toBeGreaterThan(before);
    r.sync(w);
    r.sync(w);
    const motes = tinted(top.out, LIFESTEAL_FX_COLOR);
    expect(motes.length).toBeGreaterThan(0);
    // The first mote is still near the victim, not the attacker.
    expect(Math.abs(motes[0]!.x - vic.pos.x)).toBeLessThan(Math.abs(motes[0]!.x - atk.pos.x));
  });

  it('⛔ negative: the same hit for a seat WITHOUT the perk heals nothing and draws nothing', () => {
    const { w, r, atk, vic } = duel([]);
    damageEntity(w, { kind: 'creature', id: vic.id }, 12, 'melee' as never, { kind: 'creature', id: atk.id }, 'physical');
    expect(atk.healedFifths ?? 0).toBe(0);
    r.sync(w);
    r.sync(w);
    expect(tinted(top.out, LIFESTEAL_FX_COLOR)).toEqual([]);
  });

  it('⛔ negative: a creature FIRST SEEN already carrying heals is not a heal', () => {
    const w = board('FIGHT', 'vampires', ['racial']);
    const c = add(w, 'goblinMelee', P0, 500);
    c.healedFifths = 40;
    goblins().sync(w);
    expect(tinted(top.out, LIFESTEAL_FX_COLOR)).toEqual([]);
  });
});

describe('V18 CORPSE EATER · V21 ELITES — through the real GoblinRenderer', () => {
  const FEED = [0x7dff5a, 0xd0203a];
  it('⭐ a feeding zombie boss (the synced stamp, in FIGHT) pulls a stream; BUILD and a stun stop it', () => {
    const w = board('FIGHT', 'zombies', ['racial', 'racial']);
    const boss = add(w, T9_BOSS_TYPE.zombies as CreatureType, P0, 700);
    boss.corpseEaterUntilTick = w.tick + CORPSE_EATER_TICKS - 120; // 120 ticks into his meal
    goblins().sync(w);
    const stream = top.out.filter((e) => FEED.includes(e.tint));
    expect(stream.length).toBe(20);
    // ⛔ negatives
    clearSinks();
    w.matchPhase = 'BUILD';
    goblins().sync(w);
    expect(top.out.filter((e) => FEED.includes(e.tint))).toEqual([]);
    w.matchPhase = 'FIGHT';
    boss.stunnedUntilTick = w.tick + 30;
    clearSinks();
    goblins().sync(w);
    expect(top.out.filter((e) => FEED.includes(e.tint))).toEqual([]);
  });

  it('⭐ THE SWARM and APEX PREDATOR glow in their race colour; the ordinary bat does not', () => {
    const w = board('FIGHT', 'vampires', []);
    w.players.get(P1)!.raceId = 'nagas';
    add(w, 't3BatSwarm', P0, 300);
    add(w, 't3PiranhaElite', P1, 900);
    add(w, 't3Bat', P0, 600);
    goblins().sync(w);
    expect(tinted(ground.out, RACE_COLORS.vampires).map((e) => e.x)).toEqual([300]);
    expect(tinted(ground.out, RACE_COLORS.nagas).map((e) => e.x)).toEqual([900]);
  });
});

describe('V22 HELLSPAWN — a split child bursts once, at its first sighting (real ChewerRenderer)', () => {
  const chewers = (): ChewerRenderer => {
    const parent = new Container();
    return new ChewerRenderer({ stage: parent } as unknown as Application, parent);
  };
  it('⭐ a child appearing after the board is seen bursts; the burst ends; nothing re-bursts', () => {
    const w = board('FIGHT', 'demons', ['racial', 'racial']);
    const r = chewers();
    add(w, 'chewer', P0, 400);
    r.sync(w); // primes: the parent is no split child
    expect(top.out.filter((e) => e.tint === 0xffd27a)).toEqual([]);
    const child = add(w, 'chewer', P0, 600);
    child.hellspawnGen = 1;
    clearSinks();
    r.sync(w);
    const flash = top.out.filter((e) => e.tex === 'core' && e.tint === 0xffd27a);
    expect(flash).toHaveLength(1);
    expect(flash[0]!.x).toBe(600);
    for (let i = 0; i < 30; i++) r.sync(w);
    clearSinks();
    r.sync(w);
    expect(top.out.filter((e) => e.tint === 0xffd27a)).toEqual([]);
  });

  it('⛔ negative: a child already on the board at the renderer\'s first frame (a joiner) does not burst', () => {
    const w = board('FIGHT', 'demons', ['racial', 'racial']);
    const child = add(w, 'chewer', P0, 600);
    child.hellspawnGen = 2;
    chewers().sync(w);
    expect(top.out.filter((e) => e.tint === 0xffd27a)).toEqual([]);
  });
});

describe('V19 DEEP CURRENT — a real snap-sized jump, through the real GathererRenderer', () => {
  function jump(picks: DraftPick[], legacy = false): { strokes: number } {
    const w = board('FIGHT', 'nagas', picks);
    w.gatherers.clear();
    const home = castleAnchor(0, w.layout);
    const gid = asGathererId(0);
    const g = makeGatherer({ id: gid, ownerPlayerId: P0, pos: { x: home.x + DEEP_CURRENT_JUMP_PX + 300, y: home.y }, spawnedAtTick: 0 });
    w.gatherers.set(gid, g);
    const parent = new Container();
    const r = new GathererRenderer({ stage: parent } as unknown as Application, parent);
    setFxLegacyFlag(legacy);
    r.sync(w);
    g.pos = { x: home.x, y: home.y }; // the snap home
    clearSinks();
    r.sync(w);
    const gfx = parent.children.find((c): c is Graphics => c instanceof Graphics)!;
    const strokes = (gfx.context.instructions as Array<{ action: string; data?: { style?: { color?: number } } }>)
      .filter((i) => i.action === 'stroke' && i.data?.style?.color === 0x3fd7ff).length;
    return { strokes };
  }

  it('⭐ fx on: two splash rings (both ends) and droplets, and NO stroked swirl at all', () => {
    const { strokes } = jump(['racial']);
    const rings = ground.out.filter((e) => e.tex === 'ring' && e.tint === 0x3fd7ff);
    expect(rings).toHaveLength(2);
    expect(top.out.length).toBeGreaterThanOrEqual(2 * 16);
    expect(strokes, 'no Pixi path is drawn while the droplets are on').toBe(0);
  });

  it('⛔ negatives: no perk → no vortex; `?fx=legacy` → the S188 arcs (with their moveTo) and no sprites', () => {
    jump([]);
    expect(ground.out.filter((e) => e.tex === 'ring')).toEqual([]);
    const legacy = jump(['racial'], true);
    expect(legacy.strokes).toBeGreaterThan(0);
    expect(top.out).toEqual([]);
  });
});

describe('V12 SCORCHED GROUND — the real host tick crosses BUILD → FIGHT; the real zone renderer burns', () => {
  const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
  function zones(): ZoneBackgroundRenderer {
    const app = { stage: new Container() } as unknown as Application;
    const r = new ZoneBackgroundRenderer(app, new Container());
    const inner = r as unknown as { ensureTexture(url: string): void; textures: Map<string, Texture> };
    inner.ensureTexture = (url: string) => { inner.textures.set(url, Texture.WHITE); };
    return r;
  }
  const EMBERS = (e: FxEmitRecord): boolean => e.tex === 'soft' && e.h > e.w; // embers are tall streaks

  it('⭐ no embers in BUILD; embers over the demon zone in FIGHT, and flames on the ENEMY unit only', () => {
    const w = board('BUILD', 'demons', ['racial']);
    w.phaseEndsAtTick = w.tick + 4;
    const home0 = castleAnchor(0, w.layout);
    const enemy = add(w, 'goblinMelee', P1, home0.x + 40, home0.y);
    const own = add(w, 'goblinMelee', P0, home0.x - 40, home0.y);
    const d = {
      spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls,
      botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
    } as unknown as HostTickDeps;
    const st = makeHostTickState(w);
    const r = zones();
    r.sync(w);
    expect(top.out.filter(EMBERS), 'BUILD: the land is not burning').toEqual([]);
    for (let i = 0; i < 8 && w.matchPhase === 'BUILD'; i++) runHostTick(w, d, st);
    expect(w.matchPhase, 'fixture: the real clock crossed the edge').toBe('FIGHT');
    expect(burningZonesNow(w).map((b) => b.zone)).toEqual([0]);
    clearSinks();
    r.sync(w);
    expect(top.out.filter(EMBERS).length).toBeGreaterThan(20);
    // The exact flames `burnFlickerFx` lays on each unit this tick, compared record for record.
    const flamesOf = (c: Creature): FxEmitRecord[] => {
      const s = recordingSink();
      burnFlickerFx(s, c.pos.x, c.pos.y, w.tick, c.id as number, 1);
      return s.out;
    };
    const has = (rec: FxEmitRecord): boolean => top.out.some((e) => JSON.stringify(e) === JSON.stringify(rec));
    expect(flamesOf(enemy)).toHaveLength(3);
    expect(flamesOf(enemy).every(has), 'the enemy in the burning zone carries its flames').toBe(true);
    expect(flamesOf(own).some(has), 'the caster seat\'s own unit never burns').toBe(false);
  });

  it('⭐ S194 haze fold — the real sync asks the fxRuntime HAZE for the burning zone sprite in FIGHT, never in BUILD or legacy', () => {
    const asked: FxHazeTarget[] = [];
    setFxHazeHook({ haze(t) { asked.push(t); } });
    try {
      const w = board('BUILD', 'demons', ['racial']);
      w.phaseEndsAtTick = w.tick + 4;
      const d = {
        spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls,
        botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
      } as unknown as HostTickDeps;
      const st = makeHostTickState(w);
      const r = zones();
      r.sync(w);
      expect(asked, 'BUILD: no zone is burning, so no haze').toEqual([]);
      for (let i = 0; i < 8 && w.matchPhase === 'BUILD'; i++) runHostTick(w, d, st);
      expect(w.matchPhase).toBe('FIGHT');
      r.sync(w);
      const sprites = (r as unknown as { sprites: Map<number, unknown> }).sprites;
      expect(asked, 'exactly the burning zone (0) is hazed').toEqual([sprites.get(0)]);
      // ⛔ negative: legacy → `fxHaze()` is the null sink, even with the hook installed.
      asked.length = 0;
      setFxLegacyFlag(true);
      r.sync(w);
      expect(asked).toEqual([]);
      // ⛔ and the renderer itself no longer owns a filter — one module owns ground distortion.
      expect((sprites.get(0) as { filters: unknown }).filters ?? null).toBeNull();
    } finally {
      setFxHazeHook(null);
    }
  });

  it('⭐ S193 audit — an enemy HELGA in the burning zone carries flames; a DORMANT one and the caster seat own do not', () => {
    const w = board('FIGHT', 'demons', ['racial']);
    const home0 = castleAnchor(0, w.layout);
    const helga = (owner: PlayerId, x: number, id: number) => {
      const d = makeDefender({ id: id as never, kind: 'princess', ownerPlayerId: owner, anchorPrimitiveId: 1 as never,
        recipeId: 'x' as never, pos: { x, y: home0.y }, registeredAtTick: w.tick });
      w.defenders.set(d.id, d);
      return d;
    };
    const enemy = helga(P1, home0.x + 80, 1);
    const own = helga(P0, home0.x + 160, 2);
    const asleep = helga(P1, home0.x + 240, 3);
    asleep.state = 'DORMANT' as never;
    const flamesAt = (x: number, id: number): FxEmitRecord[] => {
      const r = recordingSink();
      burnFlickerFx(r, x, home0.y, w.tick, id, HELGA_FLAME_SCALE);
      return r.out;
    };
    drawScorchFx(w, burningZonesNow(w));
    const has = (rec: FxEmitRecord): boolean => top.out.some((e) => JSON.stringify(e) === JSON.stringify(rec));
    expect(flamesAt(enemy.pos.x, 0x40000000 + 1).every(has), 'the enemy Helga burns').toBe(true);
    expect(flamesAt(own.pos.x, 0x40000000 + 2).some(has), 'the caster seat Helga is spared').toBe(false);
    expect(flamesAt(asleep.pos.x, 0x40000000 + 3).some(has), 'a DORMANT Helga is not burning').toBe(false);
  });

  it('⭐ S193 audit — a whole burning army carries flames on at most BURN_FLICKER_MAX_UNITS units, lowest ids first', () => {
    const w = board('FIGHT', 'demons', ['racial']);
    const home0 = castleAnchor(0, w.layout);
    const army: Creature[] = [];
    for (let i = 0; i < BURN_FLICKER_MAX_UNITS + 16; i++) army.push(add(w, 'goblinMelee', P1, home0.x + 60 + (i % 10) * 30, home0.y - 200 + Math.floor(i / 10) * 60));
    drawScorchFx(w, burningZonesNow(w));
    const lit = (c: Creature): boolean => {
      const r = recordingSink();
      burnFlickerFx(r, c.pos.x, c.pos.y, w.tick, c.id as number, 1);
      return r.out.every((rec) => top.out.some((e) => JSON.stringify(e) === JSON.stringify(rec)));
    };
    const flags = army.map(lit);
    expect(flags.filter(Boolean).length).toBe(BURN_FLICKER_MAX_UNITS);
    expect(flags.slice(0, BURN_FLICKER_MAX_UNITS).every(Boolean), 'the lowest ids carry the flames').toBe(true);
  });

  it('⭐ SCORCHED EARTH: a cast on the ENEMY zone burns it (the caster spared); a spent cast burns nothing', () => {
    const w = board('FIGHT', 'demons', []); // no passive: only the cast burns
    w.players.get(P0)!.scorchedEarth = { wave: w.waveNumber, zoneSeat: P1 };
    expect(burningZonesNow(w)).toEqual([{ spared: P0, zone: 1 }]);
    w.players.get(P0)!.scorchedEarth = { wave: w.waveNumber - 1, zoneSeat: P1 };
    expect(burningZonesNow(w), 'an old wave\'s cast is inert').toEqual([]);
  });

  it('⭐ V26: the real sync bakes the GRADED texture with fx on, the ORIGINAL under `?fx=legacy`', () => {
    const w = board('BUILD', 'demons', []);
    const r = zones();
    r.sync(w);
    r.sync(w);
    const baked = (r as unknown as { baked: Map<string, Texture> }).baked;
    expect([...baked.keys()].every((k) => k.endsWith('|g'))).toBe(true);
    setFxLegacyFlag(true);
    r.sync(w);
    expect([...baked.keys()].some((k) => k.endsWith('|n'))).toBe(true);
  });
});
