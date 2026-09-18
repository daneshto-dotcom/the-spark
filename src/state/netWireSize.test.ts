/**
 * SPARK — S182 LEVER 2 tests: the wire quantiser.
 *
 * ⛔ THE LOAD-BEARING TESTS HERE ARE THE ONES THAT ASSERT WHAT THE QUANTISER **DOES NOT** REACH.
 *
 * The first implementation of this lever rounded inside `netSnapshot()` — the placement the branch
 * brief specified, beside `trimMirrorCreature`. It was wrong, and every unit test in the repo
 * (4747 of them) stayed GREEN while it was wrong. Only the e2e hash oracle caught it:
 * `worker.spec.ts` and `worker-bots.spec.ts` went red on `HASH MISMATCH mirror-vs-worker`, because
 * `workerSim.ts` builds the worker→main transfer with `netSnapshot(world)` and pairs it with a hash
 * taken from its own UNQUANTISED world, which `main.ts` then re-checks against the mirror it applied.
 *
 * `netSnapshot` is therefore NOT synonymous with "the wire". The rounding now happens in a
 * `JSON.stringify` replacer at the transport boundary, where it mutates nothing and so cannot reach
 * the mirror, the disk save, `workerSim.restore()`, `save.replay`'s byte-identity gate, or
 * `hashWorldState`. These tests pin that boundary from both sides.
 *
 * The existing wire-size assertion in `save.replay.test.ts` is FIXTURE-scoped and, as the tree says
 * itself, not a runtime budget. The per-entity budgets below are derived from measurement and exist
 * so a future field addition shows up as a number rather than as a laggy peer.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { netSnapshot, applyNetSnapshot, snapshot, wireNumberReplacer } from './save.ts';
import { hashWorldState } from './stateHash.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { SparkType } from '../constants.ts';
import { asPlayerId, asPrimitiveId, asSparkId } from '../types.ts';

const SAVE_SRC = readFileSync(new URL('./save.ts', import.meta.url), 'utf8');
const TRANSPORT_SRC = readFileSync(new URL('../net/transport.ts', import.meta.url), 'utf8');

/** `makeWorld` already seats player 0 — the save.replay.test.ts convention. */
const P1 = asPlayerId(0);

/** The wire form of a world, exactly as `NetTransport.send` produces it for a NETSNAPSHOT. */
function wireJson(world: World): string {
  return JSON.stringify(netSnapshot(world), wireNumberReplacer);
}

/**
 * A board with settled, irrational-looking coordinates — the state a real match is in. Placement
 * positions carry long binary fractions so a quantiser that silently did nothing would be visible.
 */
function buildBoard(primCount: number): World {
  const world = makeWorld(1);
  for (let i = 0; i < primCount; i++) {
    // Chained in groups of 3, laid out as a grid of small components. A single ever-growing chain
    // makes PLACE_PRIMITIVE illegal once it outruns the bond reach, and the placement then fails
    // SILENTLY with the player still Carrying — which is how the first cut of this file produced a
    // CarryViolation at i=14 and would otherwise have produced a quietly undersized board.
    const group = Math.floor(i / 3);
    const col = i % 3;
    // ⚠ `% 4` (x ≤ 670), not `% 8`. Measured: a free PLACE_PRIMITIVE is refused past x ≈ 980, so the
    // wider grid silently dropped placements. The envelope belongs to build legality — branch 3's
    // subject — and this file must not couple to it.
    const gx = 200 + (group % 4) * 130;
    const gy = 300.1234567890123 + Math.floor(group / 4) * 90.7777777;
    const s = makeFreeSpark({
      id: asSparkId(7000 + i),
      type: SparkType.Line,
      pos: { x: gx + col * 40.333333333333336, y: gy },
      velocity: { x: 0.3333333333, y: 0.1666666667 },
      dt: 1 / 60,
      createdTick: 0,
    });
    dispatch(world, { type: 'SPAWN_SPARK', spark: s });
    dispatch(world, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1, pos: { x: s.pos.x, y: s.pos.y } });
    dispatch(world, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: col === 0 ? null : asPrimitiveId(i - 1),
      stiffnessTier: 'MID',
    });
  }
  // ⛔ A silently-undersized board would make every budget assertion below vacuous while staying
  // green — the failure mode this project calls "unreached code" wearing a different hat.
  if (world.primitives.size !== primCount) {
    throw new Error(`buildBoard(${primCount}) only placed ${world.primitives.size} primitives`);
  }
  return world;
}

/** Longest run of decimal digits after a '.' anywhere in the JSON. */
function maxDecimalPlaces(json: string): number {
  let worst = 0;
  for (const m of json.matchAll(/\.(\d+)/g)) worst = Math.max(worst, m[1].length);
  return worst;
}

describe('S182 LEVER 2 — the quantiser shrinks the wire', () => {
  it('no number on the wire carries more than 2 decimal places', () => {
    // Asserted over the WHOLE snapshot, not per-array. A replacer makes the invariant total, which
    // matters: a hand-enumerated field list goes stale the next time a GameEffect kind is added, and
    // `effects` was in fact the one place an earlier per-array pass missed.
    expect(maxDecimalPlaces(wireJson(buildBoard(12)))).toBeLessThanOrEqual(2);
  });

  it('⭐ the same board serialized for DISK keeps full precision', () => {
    const world = buildBoard(12);
    const disk = JSON.stringify(snapshot(world));
    // If this ever drops to ≤2 the quantiser has leaked into snapshot()/serializePrimitive and the
    // worker mirror's Verlet is being rounded — velocity IS pos − prevPos.
    expect(maxDecimalPlaces(disk)).toBeGreaterThan(2);
    expect(maxDecimalPlaces(wireJson(world))).toBeLessThanOrEqual(2);
  });

  it('⭐ netSnapshot ITSELF is unrounded — the rounding belongs to serialization alone', () => {
    // This is the regression that took `?worker=1` red. `workerSim` ships `netSnapshot(world)` to
    // the main thread beside an unquantised hash; if netSnapshot rounds, the mirror and the hash
    // disagree and every worker-mode match logs HASH MISMATCH.
    const world = buildBoard(12);
    expect(maxDecimalPlaces(JSON.stringify(netSnapshot(world)))).toBeGreaterThan(2);
  });

  it('the saving is real and material on a board of the size that broke the brother', () => {
    const world = buildBoard(40);
    const wire = wireJson(world).length;
    const unrounded = JSON.stringify(netSnapshot(world)).length;
    expect(wire).toBeLessThan(unrounded);
    // Reported as a floor rather than pinned to a brittle ratio: the point is that it is a large,
    // double-digit percentage of the payload that starves the peer.
    expect(1 - wire / unrounded).toBeGreaterThan(0.1);
  });
});

describe('S182 LEVER 2 — per-entity wire budgets (a future field addition must show up)', () => {
  /**
   * Marginal cost of ONE primitive + its bond, measured by differencing two boards rather than by
   * dividing a total — the total carries fixed per-snapshot overhead (players, layout, spawners)
   * that would otherwise be smeared across the entities and make the budget meaningless.
   */
  function marginalWireBytesPerPrimitive(): number {
    return (wireJson(buildBoard(30)).length - wireJson(buildBoard(10)).length) / 20;
  }

  it('one primitive + its bond costs under 380 chars on the wire', () => {
    // ⚠ CLAUDE'S BUDGET, not an owner ruling, and MEASURED rather than guessed: the post-quantiser
    // marginal cost of this fixture is ~334 chars per primitive (each carrying ⅔ of a bond, since
    // the board chains in groups of 3). 380 leaves ~14% headroom, so an additive-optional field
    // lands quietly while a new ALWAYS-EMITTED field — the class that balloons a 10 Hz full-world
    // payload and is what put the owner's brother at 0.2 Hz — trips it. The first cut of this line
    // said 260 from arithmetic rather than measurement, and was wrong.
    const per = marginalWireBytesPerPrimitive();
    expect(per).toBeGreaterThan(0);
    expect(per).toBeLessThan(380);
  });

  it('quantising actually reduced that marginal cost — the assertion is not vacuous', () => {
    const unroundedPer =
      (JSON.stringify(netSnapshot(buildBoard(30))).length -
        JSON.stringify(netSnapshot(buildBoard(10))).length) /
      20;
    expect(marginalWireBytesPerPrimitive()).toBeLessThan(unroundedPer);
  });
});

describe('⛔ S182 LEVER 2 — what the quantiser must NEVER reach', () => {
  it('hashWorldState is unchanged by building and serializing a wire snapshot', () => {
    const world = buildBoard(12);
    const before = hashWorldState(world);
    wireJson(world);
    wireJson(world);
    expect(hashWorldState(world)).toBe(before);
  });

  it('the live world`s own coordinates keep full precision after a wire build', () => {
    const world = buildBoard(12);
    const p = [...world.primitives.values()][3];
    const pos = { x: p.pos.x, y: p.pos.y };
    const prev = { x: p.prevPos.x, y: p.prevPos.y };
    wireJson(world);
    expect(p.pos.x).toBe(pos.x);
    expect(p.pos.y).toBe(pos.y);
    expect(p.prevPos.x).toBe(prev.x);
    expect(p.prevPos.y).toBe(prev.y);
  });

  it('⭐ the replacer MUTATES NOTHING — the snapshot object is identical before and after', () => {
    // This is the property that makes the placement safe, and it is why the lever moved out of
    // netSnapshot. A mutating pass could alias into the main-thread mirror; a replacer cannot.
    const world = buildBoard(12);
    const snap = netSnapshot(world);
    const before = JSON.stringify(snap);
    JSON.stringify(snap, wireNumberReplacer);
    expect(JSON.stringify(snap)).toBe(before);
  });

  it('two wire builds of an unchanged world are byte-identical (the quantiser is idempotent)', () => {
    const world = buildBoard(12);
    expect(wireJson(world)).toBe(wireJson(world));
  });

  it('SOURCE TRIPWIRE: serializePrimitive / serializeBond / snapshot() do not round', () => {
    for (const fn of ['function serializePrimitive', 'function serializeBond', 'export function snapshot']) {
      const start = SAVE_SRC.indexOf(fn);
      expect(start, `${fn} not found`).toBeGreaterThan(-1);
      const rest = SAVE_SRC.slice(start + fn.length);
      const end = rest.search(/\r?\n(export )?function /);
      const body = end === -1 ? rest : rest.slice(0, end);
      expect(body, `${fn} must not round`).not.toContain('NET_WIRE_SCALE');
      expect(body, `${fn} must not round`).not.toContain('wireNumberReplacer');
    }
  });

  it('SOURCE TRIPWIRE: netSnapshot does not round', () => {
    const start = SAVE_SRC.indexOf('export function netSnapshot');
    const rest = SAVE_SRC.slice(start);
    const end = rest.search(/\r?\n(export )?(function|const) /);
    const body = rest.slice(0, end === -1 ? undefined : end);
    expect(body).not.toContain('NET_WIRE_SCALE');
    expect(body).not.toContain('wireNumberReplacer');
  });

  it('SOURCE TRIPWIRE: the replacer is applied to NETSNAPSHOT only, in the send path', () => {
    // Scoped to the one high-rate kind. Applying it to every message would be harmless but would
    // put a per-number callback on the rare control traffic for no gain.
    expect(TRANSPORT_SRC).toContain('JSON.stringify(msg, wireNumberReplacer)');
    const guardAt = TRANSPORT_SRC.indexOf("msg.kind === 'NETSNAPSHOT'\n        ? JSON.stringify(msg, wireNumberReplacer)");
    const guardAtCrlf = TRANSPORT_SRC.indexOf("msg.kind === 'NETSNAPSHOT'\r\n        ? JSON.stringify(msg, wireNumberReplacer)");
    expect(Math.max(guardAt, guardAtCrlf)).toBeGreaterThan(-1);
  });
});

describe('S182 LEVER 2 — round trip', () => {
  /** What a peer actually reconstructs: parse the wire string, then apply it. */
  function applyWire(host: World, client: World): void {
    applyNetSnapshot(JSON.parse(wireJson(host)), client);
  }

  it('a quantised snapshot applies onto a client world with positions within tolerance', () => {
    const host = buildBoard(12);
    const client = makeWorld(0);
    applyWire(host, client);
    expect(client.primitives.size).toBe(host.primitives.size);
    for (const [id, hp] of host.primitives) {
      const cp = client.primitives.get(id);
      expect(cp, `primitive ${id} missing on the client`).toBeDefined();
      if (cp === undefined) continue;
      // Half a quantisation step is the worst a round-to-2-decimals can be off.
      expect(Math.abs(cp.pos.x - hp.pos.x)).toBeLessThanOrEqual(0.005);
      expect(Math.abs(cp.pos.y - hp.pos.y)).toBeLessThanOrEqual(0.005);
    }
  });

  it('bond rest lengths survive the round trip within tolerance', () => {
    const host = buildBoard(12);
    const client = makeWorld(0);
    applyWire(host, client);
    expect(client.bonds.size).toBe(host.bonds.size);
    for (const [id, hb] of host.bonds) {
      const cb = client.bonds.get(id);
      expect(cb).toBeDefined();
      if (cb === undefined) continue;
      expect(Math.abs(cb.restLength - hb.restLength)).toBeLessThanOrEqual(0.005);
    }
  });

  it('applying a quantised snapshot twice is stable — no drift accumulates', () => {
    const host = buildBoard(12);
    const client = makeWorld(0);
    applyWire(host, client);
    const first = [...client.primitives.values()].map((p) => `${p.pos.x},${p.pos.y}`).join('|');
    applyWire(host, client);
    const second = [...client.primitives.values()].map((p) => `${p.pos.x},${p.pos.y}`).join('|');
    expect(second).toBe(first);
  });
});
