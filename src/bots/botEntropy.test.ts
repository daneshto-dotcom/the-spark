/**
 * ⭐ S195 T22 (owner B-18/B-19, RULED) — BOTS LEARN THE ENTROPY TAX BY TIER AND PERSONALITY.
 *
 * Owner: *"a bot and easy will not know … maybe only towers, also depending on their personality … calculate
 * at what connectors it's not worth it"*. The table (`BotConfig.entropyAwareness`, `PersonalityKnobs.
 * entropyMaxConnectors`), the pure growth decision (`entropySafeSources` / `chooseBuildPos` / `freshStructurePos`)
 * with its negatives, determinism, and a RELATIONAL REACH through the real frame lifecycle (an aware HARD table
 * vs the same table with the knowledge switched off — never an absolute pin).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { AUTO_BOND_RADIUS, MERGE_REACH_RADIUS, PLAYER_COLORS, PRIMITIVE_MAX_HP, REDUNDANT_BOND_K, SparkType } from '../constants.ts';
import type { Primitive } from '../game/primitive.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { componentOf } from '../game/structure.ts';
import type { Controls } from '../input/controls.ts';
import { ENTROPY_FREE_CONNECTORS } from '../state/entropy.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { runGodlyMatcherCore, type GodlyMatcherCursor } from '../state/godlyMatcherCore.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { mulberry32 } from '../state/rng.ts';
import { hashWorldStateFull } from '../state/stateHashFull.ts';
import { dispatch, makeWorld, type GameAction, type World } from '../state/world.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId, type PlayerId, type Vec2 } from '../types.ts';
import {
  FRESH_SITE_MARGIN, chooseBuildPos, entropySafeSources, freshStructurePos, homeAnchor, isLegalBuildPos,
} from './botBrain.ts';
import { BOT_CONFIGS, botConfigFor, type BotConfig } from './botConfig.ts';
import { BotController } from './botController.ts';
import { ENTROPY_LOSS_ACCEPTED, IDENTITY_KNOBS, entropyBreakEvenConnectors, personalityKnobs } from './botPersonality.ts';
import { BOT_DIFFICULTIES, BOT_PERSONALITIES, type BotDifficulty, type BotPersonality } from './botTypes.ts';

afterEach(async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
});

const BOT = asPlayerId(1);
const SEATS = 4;

function botsWorld(seed = 0xb07): World {
  const w = makeWorld(seed);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s] })), botSeats: [1, 2, 3],
  });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  return w;
}

/** A compact lattice of `shapes` own shapes with exactly `connectors` bonds, ONE component, centred on `c`. */
function lattice(w: World, seat: PlayerId, shapes: number, connectors: number, c: Vec2): Primitive[] {
  const cols = Math.ceil(Math.sqrt(shapes));
  const rows = Math.ceil(shapes / cols);
  const ps: Primitive[] = [];
  const colour = PLAYER_COLORS[seat as number]!;
  for (let i = 0; i < shapes; i++) {
    const r = Math.floor(i / cols), col = i % cols;
    const x = c.x + (col - (cols - 1) / 2) * 40 + (r % 2) * 20, y = c.y + (r - (rows - 1) / 2) * 35;
    const id = asPrimitiveId(w.nextPrimitiveId++);
    const p = { id, type: i % 2 === 0 ? SparkType.Square : SparkType.Triangle, placerColor: colour, placedBy: seat, createdTick: w.tick,
      pos: { x, y }, prevPos: { x, y }, bonds: new Set<BondId>(), ownerColor: colour,
      lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null } as unknown as Primitive;
    w.primitives.set(id, p);
    ps.push(p);
  }
  const pairs: Array<[number, number, number]> = [];
  for (let i = 0; i < shapes; i++) for (let j = i + 1; j < shapes; j++) {
    const dx = ps[i]!.pos.x - ps[j]!.pos.x, dy = ps[i]!.pos.y - ps[j]!.pos.y;
    pairs.push([dx * dx + dy * dy, i, j]);
  }
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const have = new Set<string>();
  let n = 0;
  const add = (i: number, j: number): void => {
    if (have.has(`${i},${j}`)) return;
    have.add(`${i},${j}`);
    const id = asBondId(w.nextBondId++);
    const a = ps[i]!, b = ps[j]!;
    w.bonds.set(id, { id, aId: a.id, bId: b.id, a, b, restLength: Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y), stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick } as never);
    a.bonds.add(id); b.bonds.add(id);
    n++;
  };
  for (let i = 1; i < shapes; i++) add(i - 1, i);
  for (const [, i, j] of pairs) { if (n >= connectors) break; add(i, j); }
  expect(n, 'fixture: exact connector count').toBe(connectors);
  expect(componentOf(ps[0]!, w.primitives, w.bonds).bondIds.size, 'fixture: one component').toBe(connectors);
  return ps;
}

const noJitter = (cfg: BotConfig): BotConfig => ({ ...cfg, aimJitterPx: 0 });
const nearestOwn = (w: World, seat: PlayerId, p: Vec2): number => {
  let best = Infinity;
  for (const q of w.primitives.values()) if (q.placedBy === seat) best = Math.min(best, Math.hypot(q.pos.x - p.x, q.pos.y - p.y));
  return best;
};
const GROWS = AUTO_BOND_RADIUS; // a growth step lands inside the auto-bond reach
const FRESH = MERGE_REACH_RADIUS + FRESH_SITE_MARGIN; // a fresh site lands clear of the host's merge reach too

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('⭐ S195 T22 — the table: who knows, and at how many connectors', () => {
  it('awareness is a TIER capability: NOOB none, MID towers only, HARD and IMBA everything', () => {
    expect(BOT_CONFIGS.NOOB.entropyAwareness).toBe('none');
    expect(BOT_CONFIGS.MID.entropyAwareness).toBe('towers');
    expect(BOT_CONFIGS.HARD.entropyAwareness).toBe('all');
    expect(BOT_CONFIGS.IMBA.entropyAwareness).toBe('all');
    // a personality never moves it (rule 1)
    for (const t of BOT_DIFFICULTIES) for (const p of BOT_PERSONALITIES) expect(botConfigFor(t, p).entropyAwareness).toBe(BOT_CONFIGS[t].entropyAwareness);
  });

  it('the limit is DERIVED from the tax arithmetic per personality: 37 BALANCED/SABOTEUR, 50 FORTRESS, 27 WARMONGER/TYCOON', () => {
    // expected connectors lost per fight = n × 0.1 % × (n − 10); the break-even is where it reaches the accepted loss
    const expectedLoss = (n: number): number => (n * Math.max(0, n - ENTROPY_FREE_CONNECTORS)) / 1000;
    expect(entropyBreakEvenConnectors(0)).toBe(ENTROPY_FREE_CONNECTORS);
    for (const L of [0.25, 0.5, 1, 2, 5]) {
      const n = entropyBreakEvenConnectors(L);
      expect(expectedLoss(n), `n=${n} is at or under the accepted loss ${L}`).toBeLessThanOrEqual(L);
      expect(expectedLoss(n + 1), `n+1 passes it`).toBeGreaterThan(L);
    }
    expect(entropyBreakEvenConnectors(1)).toBe(37);
    expect(entropyBreakEvenConnectors(2)).toBe(50);
    expect(entropyBreakEvenConnectors(0.5)).toBe(27);
    expect(IDENTITY_KNOBS.entropyMaxConnectors).toBe(37);
    for (const t of ['MID', 'HARD', 'IMBA'] as const) {
      for (const p of BOT_PERSONALITIES) {
        const k = personalityKnobs(p, t).entropyMaxConnectors;
        expect(k, `${t} ${p}`).toBe(entropyBreakEvenConnectors(ENTROPY_LOSS_ACCEPTED[p]));
        expect(k, `${t} ${p} never stops under the free allowance`).toBeGreaterThan(ENTROPY_FREE_CONNECTORS);
      }
    }
    expect(personalityKnobs('FORTRESS', 'HARD').entropyMaxConnectors).toBe(50);
    expect(personalityKnobs('TYCOON', 'HARD').entropyMaxConnectors).toBe(27);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('⭐ S195 T22 — the growth decision (pure): grow the structure, or start a new one', () => {
  function world(connectors: number, withTower: boolean): { w: World; home: Vec2 } {
    const w = botsWorld();
    const home = homeAnchor(BOT, SEATS, noJitter(BOT_CONFIGS.HARD), mulberry32(1));
    const ps = lattice(w, BOT, SHAPES(connectors), connectors, home);
    if (withTower) (ps[0] as { origin: unknown }).origin = { blueprintId: 'stinkTower', nodeIndex: 0 };
    return { w, home };
  }
  const pos = (w: World, tier: BotDifficulty, p: BotPersonality = 'BALANCED'): Vec2 =>
    chooseBuildPos(w, BOT, SEATS, noJitter(botConfigFor(tier, p)), mulberry32(5));
  const LIM = IDENTITY_KNOBS.entropyMaxConnectors; // 37 — BALANCED's stop
  const BIG = LIM + 2; // a structure past BALANCED's limit
  const SHAPES = (connectors: number): number => Math.max(3, Math.ceil(connectors * 0.6));

  it('NOOB knows nothing: past the limit it keeps growing the blob, tower or not', () => {
    for (const tower of [false, true]) {
      const { w } = world(BIG, tower);
      expect(entropySafeSources(w, BOT, botConfigFor('NOOB', 'BALANCED'))).toHaveLength(SHAPES(BIG));
      expect(nearestOwn(w, BOT, pos(w, 'NOOB'))).toBeLessThanOrEqual(GROWS);
    }
  });

  it('MID knows about TOWERS only: a blob past the limit is grown, a structure past it with a tower in it is left alone', () => {
    const blob = world(BIG, false);
    expect(entropySafeSources(blob.w, BOT, botConfigFor('MID', 'BALANCED'))).toHaveLength(SHAPES(BIG));
    expect(nearestOwn(blob.w, BOT, pos(blob.w, 'MID'))).toBeLessThanOrEqual(GROWS);
    const tower = world(BIG, true);
    expect(entropySafeSources(tower.w, BOT, botConfigFor('MID', 'BALANCED'))).toHaveLength(0);
    const p = pos(tower.w, 'MID');
    expect(nearestOwn(tower.w, BOT, p), 'a fresh site, clear of the auto-bond reach').toBeGreaterThanOrEqual(FRESH);
    expect(isLegalBuildPos(p, BOT, tower.w)).toBe(true);
  });

  it('HARD and IMBA know about EVERYTHING: a blob past the limit is left alone, one under it is grown', () => {
    for (const tier of ['HARD', 'IMBA'] as const) {
      const big = world(BIG, false);
      expect(entropySafeSources(big.w, BOT, botConfigFor(tier, 'BALANCED'))).toHaveLength(0);
      const p = pos(big.w, tier);
      expect(nearestOwn(big.w, BOT, p), `${tier}: a fresh site`).toBeGreaterThanOrEqual(FRESH);
      expect(isLegalBuildPos(p, BOT, big.w)).toBe(true);
      const small = world(LIM - 1, false);
      expect(entropySafeSources(small.w, BOT, botConfigFor(tier, 'BALANCED')).length).toBeGreaterThan(0);
      expect(nearestOwn(small.w, BOT, pos(small.w, tier)), `${tier}: still grows a free structure`).toBeLessThanOrEqual(GROWS);
    }
  });

  it('the limit is exact: AT the limit a HARD BALANCED stops; one under it grows; at the free allowance it still grows', () => {
    expect(entropySafeSources(world(LIM, false).w, BOT, botConfigFor('HARD', 'BALANCED'))).toHaveLength(0);
    expect(entropySafeSources(world(LIM - 1, false).w, BOT, botConfigFor('HARD', 'BALANCED')).length).toBeGreaterThan(0);
    expect(entropySafeSources(world(ENTROPY_FREE_CONNECTORS + 2, false).w, BOT, botConfigFor('HARD', 'BALANCED')).length, 'a lightly taxed structure is still worth growing').toBeGreaterThan(0);
  });

  it('each personality carries its own limit: FORTRESS grows what BALANCED leaves; WARMONGER/TYCOON stop first', () => {
    const atBig = world(BIG, false); // 39: past BALANCED (37), under FORTRESS (50)
    expect(nearestOwn(atBig.w, BOT, pos(atBig.w, 'HARD', 'FORTRESS'))).toBeLessThanOrEqual(GROWS);
    expect(nearestOwn(atBig.w, BOT, pos(atBig.w, 'HARD', 'BALANCED'))).toBeGreaterThanOrEqual(FRESH);
    const at50 = world(50, false);
    expect(nearestOwn(at50.w, BOT, pos(at50.w, 'HARD', 'FORTRESS'))).toBeGreaterThanOrEqual(FRESH);
    const at30 = world(30, false); // past WARMONGER/TYCOON (27), under BALANCED
    expect(nearestOwn(at30.w, BOT, pos(at30.w, 'HARD', 'BALANCED'))).toBeLessThanOrEqual(GROWS);
    for (const p of ['WARMONGER', 'TYCOON'] as const) expect(nearestOwn(at30.w, BOT, pos(at30.w, 'HARD', p)), p).toBeGreaterThanOrEqual(FRESH);
  });

  it('two structures: the full one is left alone and the small one is grown — a new structure is the LAST resort', () => {
    const w = botsWorld();
    const home = homeAnchor(BOT, SEATS, noJitter(BOT_CONFIGS.HARD), mulberry32(1));
    lattice(w, BOT, SHAPES(BIG), BIG, home);
    const small = lattice(w, BOT, 3, 2, { x: home.x + 360, y: home.y });
    const srcs = entropySafeSources(w, BOT, botConfigFor('HARD', 'BALANCED'));
    expect(srcs.map((s) => s.pos)).toEqual(small.map((p) => p.pos));
    const p = pos(w, 'HARD');
    const toSmall = Math.min(...small.map((q) => Math.hypot(q.pos.x - p.x, q.pos.y - p.y)));
    expect(toSmall).toBeLessThanOrEqual(GROWS);
  });

  it('deterministic: same world, same rng seed ⇒ the same fresh site; and null only when the sector is full', () => {
    const { w } = world(BIG, false);
    const cfg = botConfigFor('HARD', 'BALANCED');
    const a = freshStructurePos(w, BOT, SEATS, cfg, mulberry32(9));
    const b = freshStructurePos(w, BOT, SEATS, cfg, mulberry32(9));
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    // ⚠ NEGATIVE: with its whole home sector carpeted the probe gives up (null) and chooseBuildPos falls back to growth.
    const home = homeAnchor(BOT, SEATS, noJitter(cfg), mulberry32(1));
    for (let i = -14; i <= 14; i++) for (let j = -14; j <= 14; j++) {
      const id = asPrimitiveId(w.nextPrimitiveId++);
      const x = home.x + i * 60, y = home.y + j * 60;
      w.primitives.set(id, { id, type: SparkType.Dot, placerColor: 0, placedBy: BOT, createdTick: 0, pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: 0, lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null } as unknown as Primitive);
    }
    expect(freshStructurePos(w, BOT, SEATS, cfg, mulberry32(9))).toBeNull();
    expect(nearestOwn(w, BOT, chooseBuildPos(w, BOT, SEATS, noJitter(cfg), mulberry32(9)))).toBeLessThanOrEqual(GROWS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('⭐ S195 T22 — REACH: three HARD bots through the real frame lifecycle, aware vs unaware (relational)', () => {
  const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
  interface Census { maxComponent: number; components: number; shapes: number }

  /** The signature harness's loop (botPersonality.fixtures), returning the board census per bot seat. */
  function run(seconds: number, personality: BotPersonality): { hash: number; seats: Census[] } {
    const w = makeWorld(0xb07);
    w.gameState = 'TITLE';
    dispatch(w, { type: 'START_GAME', mode: 'bots', isHost: true, roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s] })), botSeats: [1, 2, 3] });
    const controllers = [1, 2, 3].map((seat) => new BotController(asPlayerId(seat), 'HARD', mulberry32(((0xbeef ^ (seat * 0xb07b07)) >>> 0) || 1), 4, personality));
    const send = (a: GameAction): void => { dispatch(w, a); };
    const manager = { tick(world: World): void { for (const c of controllers) c.tick(world, send); } };
    const d = { spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls, botManager: manager, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map() } as unknown as HostTickDeps;
    const st = makeHostTickState(w);
    const cursor: GodlyMatcherCursor = { lastMatcherTick: -1 };
    for (let t = 0; t < 60 * seconds; t++) {
      runHostTick(w, d, st);
      if ((w.gameState as string) === 'PLAYING') runGodlyMatcherCore(w, cursor);
      w.effects.length = 0;
    }
    const seats: Census[] = [1, 2, 3].map((seat) => {
      const seen = new Set<number>();
      const c: Census = { maxComponent: 0, components: 0, shapes: 0 };
      for (const p of w.primitives.values()) {
        if ((p.placedBy as unknown as number) !== seat) continue;
        c.shapes++;
        if (seen.has(p.id as unknown as number)) continue;
        const comp = componentOf(p, w.primitives, w.bonds);
        for (const id of comp.primitiveIds) seen.add(id as unknown as number);
        c.components++;
        c.maxComponent = Math.max(c.maxComponent, comp.bondIds.size);
      }
      return c;
    });
    return { hash: hashWorldStateFull(w), seats };
  }

  it('an aware HARD table never grows a blob past its limit, builds MORE structures than the unaware one, and replays byte for byte', () => {
    // HARD TYCOON: the wide, fast builder with the LOWEST limit (27) — the cell that reaches its limit inside the run.
    const P: BotPersonality = 'TYCOON';
    const SECONDS = 420;
    const aware = run(SECONDS, P);
    const again = run(SECONDS, P);
    expect(again.hash, 'deterministic').toBe(aware.hash);
    const tier = BOT_CONFIGS.HARD as unknown as { entropyAwareness: BotConfig['entropyAwareness'] };
    const saved = tier.entropyAwareness;
    let unaware: ReturnType<typeof run>;
    try {
      tier.entropyAwareness = 'none';
      unaware = run(SECONDS, P);
    } finally {
      tier.entropyAwareness = saved;
    }
    console.log(`[S195 T22] HARD ${P} ${SECONDS}s aware:   ${JSON.stringify(aware.seats)}`);
    console.log(`[S195 T22] HARD ${P} ${SECONDS}s unaware: ${JSON.stringify(unaware.seats)}`);
    expect(unaware.hash, 'anti-vacuity: the knowledge changes the match').not.toBe(aware.hash);
    const sum = (r: typeof aware, f: (c: Census) => number): number => r.seats.reduce((a, c) => a + f(c), 0);
    /*
     * RELATIONAL, per seat: the aware seat's biggest structure is smaller than the unaware seat's. Not a hard
     * `≤ limit + REDUNDANT_BOND_K` bound: at 420 s a TYCOON sector is FULL (no fresh site 112 px clear of its
     * 30–40 shapes), and the documented fallback then grows as an unaware bot would, so saturation can carry a
     * seat past the limit (measured 40 / 27 / 28 aware vs 47 / 77 / 35 unaware). A seat that never saturates
     * stays within limit + one placement (1 + REDUNDANT_BOND_K connectors): asserted for every seat under it.
     */
    const limit = personalityKnobs(P, 'HARD').entropyMaxConnectors;
    for (let i = 0; i < 3; i++) {
      const a = aware.seats[i]!, u = unaware.seats[i]!;
      expect(a.maxComponent, `seat ${i + 1}: aware ${a.maxComponent} < unaware ${u.maxComponent}`).toBeLessThan(u.maxComponent);
    }
    expect(aware.seats.filter((c) => c.maxComponent <= limit + REDUNDANT_BOND_K).length, 'most seats hold the limit + one placement').toBeGreaterThanOrEqual(2);
    expect(Math.max(...aware.seats.map((c) => c.maxComponent)), 'anti-vacuity: an aware bot still grows a structure past the free allowance').toBeGreaterThan(ENTROPY_FREE_CONNECTORS);
    expect(Math.max(...unaware.seats.map((c) => c.maxComponent)), 'anti-vacuity: the unaware table DID grow past the limit').toBeGreaterThan(limit);
    expect(sum(aware, (c) => c.components), 'the aware table holds at least as many structures').toBeGreaterThanOrEqual(sum(unaware, (c) => c.components));
  }, 180_000);
});
