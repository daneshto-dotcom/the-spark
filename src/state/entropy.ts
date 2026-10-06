/**
 * ⭐⭐ S194 (owner, R194-18) — THE ENTROPY TAX. A big structure wears out.
 *
 * > *"the more complex your … structure is. The more chances it has to be destroyed or to just break
 * > down … with raised complexity, there's raised entropy. That way … players will have to decide, oh,
 * > do I keep … building onto this tower to increase his … HP … Or do I … build more structures."*
 * > — owner, S194
 *
 * > *"It will go with option A. That's perfect … Up to 10 connectors, no entropy tax. After that, it
 * > grows by 0.01 for each connector past 10 … It should be capped at 50."* … *"mean +0.1%"* — owner,
 * > S194 (R194-18, `.claude/plans/S194_OWNER_RULINGS.md`)
 *
 * THE RULE, IN ONE SENTENCE: at the start of every FIGHT, every connector of a structure bigger than 10
 * connectors snaps with chance `min(50 %, 0.1 % × (n − 10))`, n = the connectors in its structure.
 *
 * WHY IT EXISTS (measured S194, `entropy.test.ts`): a structure's pool is `n × (5 + n)` over the WHOLE
 * component and that full pool is the price of ONE connector (canon §2). A bot's 145-connector blob costs
 * 21 750 per connector — 20 melee goblins (12 a swing, 60 swings a fight = 14 400) fell ZERO of them in a
 * fight. No tower recipe has more than 9 connectors, so the free allowance of 10 never taxes a lone tower.
 *
 * ⚠ MINE (owner Q4/Q5, unanswered, the coordinator's recorded defaults):
 *   · ANY connector of a taxed structure may snap — a welded tower's own included (his *"do I keep
 *     building onto this tower"* puts the tower at risk);
 *   · the roll happens ONCE, on the BUILD→FIGHT edge (`hostTick.ts`), so the loss is visible before the
 *     fight, and the owner of the structure reads "ENTROPY: N SNAPPED, M LOST" (`severToastRenderer`,
 *     from the synced `SeatMatchStats.entropyWave/Snapped/Lost` — S195 N18 (d)).
 *
 * DETERMINISM. No `Math.random`, no clock, no float: one stateless roll per bond,
 * `mix32(mix32(rngSeed, waveNumber), bondId) % 10 000` (`rngSeed` is host-only — a client cannot
 * pre-compute it). Every roll is taken against a SNAPSHOT of the board (the components as they stand
 * before the first snap), so a snap that splits a structure cannot change another bond's chance in the
 * same pass, and the severs then run in ascending bond id through the ONE `SEVER_BOND` path (cause
 * `'entropy'`) — a split structure re-forms like any other sever. Host-authoritative: only `runHostTick`
 * calls this; peers receive the result in the snapshot.
 */
import { componentOf } from '../game/structure.ts';
import type { BondId, PlayerId } from '../types.ts';
import { recordEntropyPass, sampleBuilt } from './matchStats.ts'; // ⭐ S195 T22 / N18 (d)
import { mix32 } from './rng.ts';
import { applySeverBond } from './severBond.ts';
import type { World } from './worldTypes.ts';

/** Chances are integers out of this many — 10 000 = 100 %, so 1 = 0.01 %. */
export const ENTROPY_SCALE = 10_000;
/** R194-18 — *"Up to 10 connectors, no entropy tax."* A structure of ≤ this many connectors never snaps. */
export const ENTROPY_FREE_CONNECTORS = 10;
/** R194-18 — *"mean +0.1%"*: the chance per connector rises 0.1 % (10 / 10 000) for each connector past 10. */
export const ENTROPY_RATE_PER_CONNECTOR = 10;
/** R194-18 — *"It should be capped at 50."* 50 % (5 000 / 10 000), reached at 510 connectors. */
export const ENTROPY_CAP = 5_000;

/** PURE — each connector's snap chance, out of `ENTROPY_SCALE`, in a structure of `n` connectors. */
export function entropyChance(n: number): number {
  if (n <= ENTROPY_FREE_CONNECTORS) return 0;
  return Math.min(ENTROPY_CAP, ENTROPY_RATE_PER_CONNECTOR * (n - ENTROPY_FREE_CONNECTORS));
}

/** PURE — this bond's roll this wave, in `[0, ENTROPY_SCALE)`. It snaps when the roll is below its chance. */
export function entropyRoll(rngSeed: number, waveNumber: number, bondId: BondId): number {
  return mix32(mix32(rngSeed, waveNumber), bondId as unknown as number) % ENTROPY_SCALE;
}

/**
 * PURE (reads `world`, writes nothing) — the bonds that snap this wave, ascending id.
 *
 * Components are enumerated in a TOTAL order — by their lowest bond id, walking `world.bonds` sorted
 * by id, never in `Map` order — and each bond's chance is its component's, read before anything snaps.
 */
export function planEntropy(world: World): BondId[] {
  const ids = [...world.bonds.keys()].sort((a, b) => Number(a) - Number(b));
  const seen = new Set<BondId>();
  const doomed: BondId[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const bond = world.bonds.get(id)!;
    const anchor = world.primitives.get(bond.aId) ?? world.primitives.get(bond.bId);
    if (anchor === undefined) { seen.add(id); continue; }
    const comp = componentOf(anchor, world.primitives, world.bonds);
    for (const b of comp.bondIds) seen.add(b);
    seen.add(id);
    const chance = entropyChance(comp.bondIds.size);
    if (chance === 0) continue;
    for (const b of comp.bondIds) {
      if (entropyRoll(world.rngSeed, world.waveNumber, b) < chance) doomed.push(b);
    }
  }
  return doomed.sort((a, b) => Number(a) - Number(b));
}

/**
 * HOST — apply the tax: sever every planned bond through the real `SEVER_BOND` reducer, cause
 * `'entropy'` (no actor — nobody did it; `severActor` says so). Returns how many connectors snapped.
 * A bond already gone (a split razed its shape) is skipped.
 */
export function applyEntropyTax(world: World): number {
  const plan = planEntropy(world);
  if (plan.length === 0) return 0;
  /*
   * ⭐ S195 T22 (owner B-17) — the LOST-TO-ENTROPY stat is the per-seat STANDING-BOND DELTA across this
   * pass, not the snap count: a snap that splits a structure deletes its smaller side, connectors and
   * all, and the owner lost those too. `sampleBuilt` is the board's own "connectors standing" census
   * (owner = `bond.aId → placedBy`), so the stat and the BUILT graph fall by the same number. Read-only
   * on the sim: the counter is inert (`matchStats.ts` header), so no bump.
   */
  const before = sampleBuilt(world);
  let snapped = 0;
  // ⭐ S195 N18 (d) — the roll's snaps per owner, for "N SNAPPED, M LOST". Recording only.
  const snappedBy = new Map<PlayerId, number>();
  for (const id of plan) {
    const bond = world.bonds.get(id);
    if (bond === undefined) continue;
    const owner = world.primitives.get(bond.aId)?.placedBy ?? world.primitives.get(bond.bId)?.placedBy;
    if (owner === undefined) continue;
    applySeverBond(world, { type: 'SEVER_BOND', bondId: id, playerId: owner, cause: 'entropy' });
    if (!world.bonds.has(id)) {
      snapped += 1;
      snappedBy.set(owner, (snappedBy.get(owner) ?? 0) + 1);
    }
  }
  const after = sampleBuilt(world);
  const seats = new Set<PlayerId>([...before.keys(), ...snappedBy.keys()]);
  for (const seat of [...seats].sort((a, b) => (a as number) - (b as number))) {
    recordEntropyPass(world, seat, snappedBy.get(seat) ?? 0, (before.get(seat) ?? 0) - (after.get(seat) ?? 0));
  }
  return snapped;
}
