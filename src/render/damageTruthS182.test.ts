/**
 * SPARK — S182 (owner, **REPORTED TWICE**) — **THE NUMBER IS THE SWING, NOT THE REMAINDER.**
 *
 * S181 fixed this for creatures, off his report: *"it says that it hits 40 per shot, but it only
 * does 6 damage … I saw it hit the zombie hound for 10 because that's his total HP, so it only shows
 * the maximum. We need to show the ACTUAL damage being taken."*
 *
 * ⛔ THREE STRUCTURE POOLS WERE STILL LYING — shapes, landed stink bags and Helga. `syncStructures`
 * makes five `track()` calls and three of them pass `deathOnVanish: true`, which prints a vanished
 * pool's REMAINDER. Right for nothing: the entity is gone from its map by the time the sweep runs,
 * the overkill was discarded at the damage site, and the damage site is the only place that ever
 * knew the real number. A goblin swinging 12 into a 5-fifth remainder printed "5".
 *
 * ⛔ AND THE MIRROR-IMAGE DEFECT SHIPS IN THE SAME SWEEP: a pool can VANISH WITHOUT BEING HIT. An
 * expired bag, a Helga whose recipe or anchor broke, a building the player SCRAPPED — each printed
 * a full-pool number for damage nobody dealt. That is S179's *"removed is not killed"* rule, which
 * existed for shapes (`razedNotKilled`) and was never applied to the other two pools.
 *
 * ⭐ ONE MECHANISM ANSWERS BOTH, because `damageEntity` is the single host-side choke point:
 * `world.structureKillHits` carries `{ key, amount }`, where `amount: null` means *removed, not
 * killed — print nothing*. See `World.structureKillHits`.
 *
 * ⚠ BEHAVIOUR TESTS ALONE ARE NOT ENOUGH HERE and the last section says why: the new array has FIVE
 * wipe sites, not four, and the fifth (`workerSim.ts`) is the one this repo's own tests have never
 * covered — which is exactly how three arrays came to leak there unnoticed.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('pixi.js', () => {
  class Container { children: unknown[] = []; addChild(c: unknown): void { this.children.push(c); } removeChild(): void {} }
  class TextStyle { constructor(public o?: unknown) {} }
  class Text {
    text = ''; style: unknown = null; visible = true; alpha = 1;
    anchor = { set: (): void => {} }; position = { set: (): void => {} }; scale = { set: (): void => {} };
    constructor(o?: { text?: string; style?: unknown }) { this.text = o?.text ?? ''; this.style = o?.style; }
    destroy(): void {}
  }
  return { Container, Text, TextStyle };
});

const { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType, GOBLIN_MELEE_ATK, GOBLIN_MELEE_PEN } =
  await import('../constants.ts');
const { makeIdlePlayer } = await import('../game/player.ts');
const { makeWorld } = await import('../state/world.ts');
const { damageEntity } = await import('../state/damage.ts');
const { attackFifths } = await import('../state/stats.ts');
const { sweepExpiredStinkClouds, stinkCloudExpiryTick } = await import('../state/defenders/stinkCloud.ts');
const { asBondId, asPlayerId, asPrimitiveId } = await import('../types.ts');
const { DamageNumbers } = await import('./damageNumbers.ts');

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const read = (f: string): string => readFileSync(f, 'utf-8');

/** The swing every "a goblin hits it" case below uses — the one ladder, never a bespoke number. */
const GOBLIN_SWING = attackFifths(GOBLIN_MELEE_ATK, GOBLIN_MELEE_PEN);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function twoSeat(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = makeWorld(0);
  w.isHost = true;
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  return w;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shape(w: any, x: number, y: number, hp = PRIMITIVE_MAX_HP): any {
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const p = {
    id, type: SparkType.Square, placerColor: PLAYER_COLORS[1]!, placedBy: P1, createdTick: 0,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: PLAYER_COLORS[1]!,
    lastOwnershipChange: 0, radius: 9, hp, origin: null,
  };
  w.primitives.set(id, p);
  return p;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function connect(w: any, a: any, b: any): ReturnType<typeof asBondId> {
  const id = asBondId(w.nextBondId++);
  w.bonds.set(id, { id, aId: a.id, bId: b.id, a, b, restLength: 32, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0 });
  a.bonds.add(id);
  b.bonds.add(id);
  return id;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bag(w: any, ehp: number): any {
  const id = w.nextStinkCloudId !== undefined ? w.nextStinkCloudId++ : `sc${w.stinkClouds.size}`;
  const c = { id, pos: { x: 700, y: 700 }, ownerPlayerId: P1, landedAtTick: w.tick, radius: 40, ehp };
  w.stinkClouds.set(id, c);
  return c;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function helga(w: any, ehp: number): any {
  const id = `d${w.defenders.size}`;
  const d = {
    id, kind: 'princess', ownerPlayerId: P1, anchorPrimitiveId: asPrimitiveId(9999),
    recipeId: 'helga', pos: { x: 500, y: 500 }, prevPos: { x: 500, y: 500 }, ehp,
  };
  w.defenders.set(id, d);
  return d;
}

const printed = (dn: unknown): string[] =>
  ((dn as { live: { text: { text: string } }[] }).live ?? []).map((f) => f.text.text);

/** Sync once to establish the watch, run `act`, sync again, return only the NEW floaters. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function newFloaters(w: any, act: () => void): string[] {
  const dn = new DamageNumbers();
  /*
   * ⚠ THE WATCH MUST SEE THE PRE-KILL POOL. The vanish sweep prints the LAST OBSERVED value, so a
   * pool mutated between two syncs makes the sweep report a stale number and says nothing about the
   * fix. `damageNumbersRemoval.test.ts` records the same trap costing it a false failure.
   */
  dn.sync(w);
  const before = printed(dn).length;
  act();
  dn.sync(w);
  return printed(dn).slice(before);
}

describe('S182 — the killing blow on a STRUCTURE pool prints the SWING', () => {
  it('⭐⭐ HIS BUG — a shape killed by a 12 prints 12, not the 5 it had left', () => {
    const w = twoSeat();
    const a = shape(w, 400, 400);
    const b = shape(w, 432, 400);
    connect(w, a, b); // bonded → the full 70 pool, not the lone-shape 5
    a.hp = 5; // chewed down; one goblin swing is 12 and will overkill it

    const out = newFloaters(w, () => {
      damageEntity(w, { kind: 'primitive', id: a.id }, GOBLIN_SWING, 'creature');
    });

    expect(w.primitives.has(a.id), 'the swing must actually kill it').toBe(false);
    expect(out, 'the swing, not the remainder').toContain(String(GOBLIN_SWING));
    expect(out, 'the remainder is the lie he reported').not.toContain('5');
  });

  it('a landed stink BAG killed by a swing prints the swing, not its remainder', () => {
    const w = twoSeat();
    const c = bag(w, 5);

    const out = newFloaters(w, () => {
      damageEntity(w, { kind: 'stinkCloud', id: c.id }, GOBLIN_SWING, 'creature');
    });

    expect(w.stinkClouds.has(c.id)).toBe(false);
    expect(out).toContain(String(GOBLIN_SWING));
    expect(out).not.toContain('5');
  });

  it('HELGA killed by a swing prints the swing, not her remainder', () => {
    const w = twoSeat();
    const d = helga(w, 5);

    const out = newFloaters(w, () => {
      damageEntity(w, { kind: 'defender', id: d.id }, GOBLIN_SWING, 'creature');
    });

    expect(w.defenders.has(d.id)).toBe(false);
    expect(out).toContain(String(GOBLIN_SWING));
    expect(out).not.toContain('5');
  });

  it('⛔ NOT VACUOUS — a NON-fatal hit still prints the diff, exactly as before', () => {
    const w = twoSeat();
    const a = shape(w, 400, 400);
    const b = shape(w, 432, 400);
    connect(w, a, b);

    const out = newFloaters(w, () => {
      damageEntity(w, { kind: 'primitive', id: a.id }, GOBLIN_SWING, 'creature');
    });

    expect(w.primitives.has(a.id), 'it survives — this is the diff path, not the sweep').toBe(true);
    expect(out).toContain(String(GOBLIN_SWING));
  });

  it('⚠ THE PEER FALLBACK — with no host record the sweep still prints the remainder', () => {
    /*
     * `structureKillHits` is host-local and never serialized, so a client applying snapshots has no
     * record at all. It must keep exactly the behaviour it had before this change rather than fall
     * silent — the same contract `fatalBlowFifths` holds for creatures. Simulated by wiping the
     * record between the kill and the sweep, which is precisely the peer's state.
     */
    const w = twoSeat();
    const c = bag(w, 5);

    const dn = new DamageNumbers();
    dn.sync(w);
    const before = printed(dn).length;
    damageEntity(w, { kind: 'stinkCloud', id: c.id }, GOBLIN_SWING, 'creature');
    w.structureKillHits.length = 0; // the peer never had one
    dn.sync(w);

    expect(printed(dn).slice(before), 'silence would be a regression, not a fix').toContain('5');
  });
});

describe('S182 — a pool REMOVED rather than hit prints NOTHING', () => {
  it('⭐⭐ an EXPIRED stink bag prints no phantom number', () => {
    const w = twoSeat();
    const c = bag(w, 5);

    const out = newFloaters(w, () => {
      w.tick = stinkCloudExpiryTick(c);
      sweepExpiredStinkClouds(w);
    });

    expect(w.stinkClouds.has(c.id), 'the sweep takes it on lifetime').toBe(false);
    expect(out, 'nobody hit it — its ehp was never touched').toEqual([]);
  });

  it('⛔ NOT VACUOUS — an UNEXPIRED bag is left alone and prints nothing either', () => {
    const w = twoSeat();
    const c = bag(w, 5);

    const out = newFloaters(w, () => {
      w.tick = stinkCloudExpiryTick(c) - 1;
      sweepExpiredStinkClouds(w);
    });

    expect(w.stinkClouds.has(c.id), 'not yet expired').toBe(true);
    expect(out).toEqual([]);
  });
});

/**
 * ⛔ THE FIVE-SITE LAW FOR THIS ARRAY, and the fifth site is the point of this block.
 *
 * `s181Regressions` asserts FOUR sites for `creatureKillHits` — three phase resets plus the
 * consumer — and that count came from its two siblings. All three were wrong in the same way:
 * `workerSim.ts` is a FIFTH consumer-equivalent frame boundary, it wipes `world.effects` and
 * nothing else, and under `?worker=1` there is no `DamageNumbers` on that thread to wipe the rest.
 * So every one of these arrays grew for the whole match. Three sessions added an array; none looked.
 *
 * ⭐ ASSERTED FOR ALL FOUR ARRAYS, NOT JUST THE NEW ONE — fixing only mine would have left the leak
 * live and made this guard a lie by omission.
 */
describe('S182 — the new array is wiped at all FIVE sites, and so are its three siblings', () => {
  const ARRAYS = ['razedNotKilled', 'connectorBreakHits', 'creatureKillHits', 'structureKillHits'];
  const SITES = [
    'src/state/gameMode.ts',
    'src/state/gameState.ts',
    'src/state/save.ts',
    'src/render/damageNumbers.ts',
    'src/state/workerSim.ts', // ⛔ the fifth, and the one that was missing for all of them
  ];

  for (const file of SITES) {
    it(`${file} wipes every per-frame presentational array`, () => {
      const src = read(file);
      for (const arr of ARRAYS) {
        expect(
          src.includes(`world.${arr}.length = 0`),
          `${file} must wipe world.${arr} — an unwiped array grows for the whole match`,
        ).toBe(true);
      }
    });
  }

  it('⛔ the worker wipe sits at the SAME frame boundary as the effects wipe it joins', () => {
    const src = read('src/state/workerSim.ts');
    const effects = src.indexOf('world.effects.length = 0;');
    const mine = src.indexOf('world.structureKillHits.length = 0;');
    expect(effects).toBeGreaterThan(-1);
    // Post-snapshot, post-matcher — wiping before `netSnapshot` would drop records mid-flight.
    expect(mine).toBeGreaterThan(effects);
    expect(src.indexOf('netSnapshot(world)')).toBeLessThan(mine);
  });

  it('the World type, the factory and the full hash all carry it', () => {
    expect(read('src/state/worldTypes.ts')).toContain('structureKillHits: { key: string; amount: number | null }[]');
    expect(read('src/state/world.ts')).toContain('structureKillHits: []');
    // `'acknowledged'` — per-frame, host-local, never on the wire, never a sim input.
    expect(read('src/state/stateHashFull.ts')).toContain("structureKillHits: 'acknowledged'");
  });

  it('⛔ the removal producers exist — an unreached rule is this project\'s signature defect', () => {
    // S181 shipped 8 defects green because the failure mode was UNREACHED CODE. Assert the call
    // sites, not just the behaviour: a producer deleted in a refactor would pass every test above
    // that only checks "prints nothing", because printing nothing is also what a deleted pool does.
    expect(read('src/state/defenders/stinkCloud.ts')).toContain('amount: null');
    expect(read('src/state/damage.ts')).toContain('amount: null');
    // …and the three kill-hit pushes, one per structure pool, all inside `damageEntity`.
    const dmg = read('src/state/damage.ts');
    expect(dmg).toContain('key: `p:${prim.id}`');
    expect(dmg).toContain('key: `s:${cloud.id}`');
    expect(dmg).toContain('key: `d:${d.id}`');
  });
});

/**
 * ⛔⛔ S182 — **A MASS CLEAR IS NOT A MASSACRE.**
 *
 * `DamageNumbers` is built ONCE (`main.ts:775`), `sync()` is the only method it has, and there is
 * no reset path in the file — so `watchedStruct` outlives every match. Nine mid-match paths clear
 * the world's structure maps, and to the vanish sweep that is indistinguishable from every shape,
 * bag and Helga on the board dying in the same frame. A new match opened in a shower of numbers.
 */
describe('S182 — a mass clear drops the watch instead of printing a massacre', () => {
  it('⭐⭐ a cleared board prints NOTHING, however many structures were on it', () => {
    const w = twoSeat();
    const a = shape(w, 400, 400);
    const b = shape(w, 432, 400);
    connect(w, a, b);
    bag(w, 5);
    helga(w, 156);

    const out = newFloaters(w, () => {
      // Exactly what applyStartGame / applyReturnToTitle / softReset / applyGodlyAbort do.
      w.primitives.clear();
      w.bonds.clear();
      w.stinkClouds.clear();
      w.defenders.clear();
      w.structureWatchEpoch += 1;
    });

    expect(out, 'nothing was killed — the match simply ended').toEqual([]);
  });

  it('⛔ NOT VACUOUS — without the epoch bump the same clear DOES print a massacre', () => {
    /*
     * The exact defect, reproduced. This is what shipped before the cue existed, and it is why the
     * test above cannot be satisfied by the sweep simply being quiet.
     */
    const w = twoSeat();
    const a = shape(w, 400, 400);
    const b = shape(w, 432, 400);
    connect(w, a, b);

    const out = newFloaters(w, () => {
      w.primitives.clear();
      w.bonds.clear();
      // no epoch bump
    });

    expect(out.length, 'the un-cued sweep invents a number per shape').toBeGreaterThan(0);
  });

  it('⛔ the epoch is bumped at all FOUR mass-clear sites', () => {
    for (const f of [
      'src/state/gameMode.ts', // applyStartGame AND applyReturnToTitle
      'src/state/gameState.ts', // softReset
      'src/state/godlyActions.ts', // applyGodlyAbort
    ]) {
      expect(read(f).includes('world.structureWatchEpoch += 1;'), `${f} must bump the epoch`).toBe(true);
    }
    // gameMode has TWO of the four — match start and title return are different functions.
    const gm = read('src/state/gameMode.ts');
    expect(gm.split('world.structureWatchEpoch += 1;').length - 1).toBe(2);
  });

  it('⛔ and it is NOT bumped in applySnapshotCore — that would blind every peer', () => {
    /*
     * THE LOAD-BEARING EXCLUSION. A peer's damage numbers come from diffing successive snapshots
     * against this very watch. Bumping per snapshot would clear it every time and a client would
     * never see a damage number again — a silent, total regression that no other test would catch,
     * because every other test runs on a host.
     */
    expect(read('src/state/save.ts')).not.toContain('structureWatchEpoch');
  });
});
