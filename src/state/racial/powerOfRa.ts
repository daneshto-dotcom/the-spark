/**
 * SPARK — S188 P6 — **POWER OF RA (`mummies.l0`): THE CAST, AND THE FIVE COLUMNS.**
 *
 * > *"It gives you a skill to call Ra that hits like the lightning beams from the sky, kind of like
 * > Pharaoh has. But you get to choose where it lands … it will, you know, hit and damage buildings
 * > or creatures in that area."* — owner, S187
 *
 * The rules (who may cast, what a legal aim is) live in the leaf `powerOfRaRules.ts`, because the
 * footer button and the aiming telegraph read them too. This file is the two halves that MUTATE:
 *
 *   `applyCastPowerOfRa`  the host reducer for the `CAST_POWER_OF_RA` client intent — appends to
 *                         `Player.raStrikes` and nothing else;
 *   `runPowerOfRa`        the `racialTick` slot — lands whichever column is due this tick.
 *
 * ## ⛔ IT FALLS LIKE THE PHARAOH'S STRIKE — THE PATTERN, TIMING AND RADIUS ARE HIS, NOT COPIES
 *
 * `RA_COLUMN_COUNT` columns, one every `RA_COLUMN_TICKS`, over `RA_COLUMN_RADIUS`, landing at
 * `raColumnPos` and timed by `raColumnImpactTick` — every one imported from
 * `bossSkillsPharaohRitual.ts` / `constants.ts`. The Pharaoh centres it on himself and seeds it with
 * his id; a caster centres it on the aimed point and seeds it with the seat.
 *
 * ## ⭐⭐ S191 (owner) — BUT THE STRENGTH IS ITS OWN NOW: 35 A COLUMN, SPLIT
 *
 * > *"It destroys like a full fucking tower. Within one hit … each column that it does 30 damage it
 * > split right so if it hits a tower and an enemy at the same time then it split amongst those two …
 * > it's not like 30 to each thing in the vicinity … we can do it 35 per hit."*
 *
 * Until S191 this file said *"a retune of his ultimate retunes this one"*, and dealt his 300 to every
 * connector in the circle — so one column deleted a 5-connector tower (whole ladder 130) several times
 * over. Now a column deals `RA_PERK_STRIKE_FIFTHS` (**35**, `attackFifths(RA_PERK_COLUMN_ATK,
 * RA_PERK_COLUMN_PEN)`) **in total**, split across the targets it catches (`raSplitShares`), and a
 * STRUCTURE is ONE target however many of its connectors the circle covers (`raColumnTargets`). The
 * Pharaoh boss keeps his 300, unsplit — his ritual never came through this file.
 *
 * ## ⚠ TWO DELIBERATE DIFFERENCES FROM HIS, AND BOTH ARE MINE
 *
 *   1. **IT SPARES THE CASTER.** His columns pass `sparePlayerId: null` — *"kills everything in that
 *      circle"*, a god does not check banners. A player's skill that could wipe their own towers
 *      would be a trap, and every area effect a player owns in this game spares its owner (the stink
 *      bag, the suicide goblin, the S157 hub precedent). So enemy creatures, enemy Helga, enemy
 *      shapes and enemy CONNECTORS take it; the caster's own take nothing.
 *   2. **IT ALSO CUTS CONNECTORS.** *"hit and damage buildings"* — and a building in this game dies
 *      through its connectors (canon §4). `applyRadialDamage` deliberately has no connector arm
 *      (*"one potato could shred a fortress"*); that reasoning is about area damage in GENERAL and
 *      does not stand against a ruling about THIS skill — the suicide goblin's exact precedent
 *      (`suicideBlast.ts`), whose connector arm lives beside its one owner-named mechanic rather than
 *      inside the shared helper. ⭐ S191 — and `applyRadialDamage` is no longer called here at all:
 *      it hands ONE amount to every victim, and a split needs a share per target.
 *
 * ## ⚠ IT LANDS ONLY DURING FIGHT
 *
 * `runPowerOfRa` sits in the FIGHT-gated `runRacialPerksFight`, so a column whose impact tick falls
 * after the FIGHT→BUILD edge simply never lands (a strike called in the last seconds of a fight is
 * cut short by the sunset). The renderer draws under the SAME gate, so no telegraph promises a column
 * that will not come. ⚠ MINE: the alternative — columns landing into BUILD — would attack buildings
 * in the one phase whose premise is that nothing can be attacked.
 *
 * ## Determinism
 *
 * No RNG, no clock, no accumulator. The strike is one synced record (`RaStrike`); which column is due
 * is `raColumnImpactTick(untilTick, k) === world.tick`, recomputed every tick. Seats are visited in
 * id order. ⭐ S191 — a column's targets are collected in full BEFORE any damage, then put in ONE
 * total order (squared distance to the column centre, then kind, then id — never `Map` order, never
 * `Math.hypot`), and that order alone decides who gets the remainder of the split. `world.creatures`
 * is never inserted into here, so nothing is born mid-strike (Council A5 does not apply).
 */

import { MAX_PLAYERS, RA_COLUMN_COUNT, RA_COLUMN_RADIUS, RA_PERK_COLUMN_ATK, RA_PERK_COLUMN_PEN, RA_RITUAL_TICKS } from '../../constants.ts';
import type { BondId, PlayerId } from '../../types.ts';
import { componentOf } from '../../game/structure.ts';
import { raColumnImpactTick, raColumnPos } from '../bossSkillsPharaohRitual.ts';
import { isChannellingRa } from '../creatures/creature.ts';
import { damageConnector, damageEntity, type DamageTarget } from '../damage.ts';
import { attackFifths } from '../stats.ts';
import type { World } from '../world.ts';
import { applySeverBond } from '../severBond.ts';
import { raAimPoint, raCastRefusal, type CastPowerOfRaAction } from './powerOfRaRules.ts';

/**
 * ⭐⭐ S191 (owner) — **WHAT ONE COLUMN DEALS, IN TOTAL: 35 FIFTHS, SPLIT** across everything it catches
 * (`raSplitShares`). ONE LADDER — `attackFifths(RA_PERK_COLUMN_ATK, RA_PERK_COLUMN_PEN)`, never a bespoke
 * number; his *"we can do it 35 per hit"* is quoted at the constants. Every perk strike reads this and
 * nothing else: POWER OF RA's one cast, each of WRATH OF RA's three, and a bot's cast (`botRa.ts` sends
 * the same `CAST_POWER_OF_RA` intent) all land through `landRaColumn` below.
 *
 * ⛔ NOT the Pharaoh boss's number. His ritual keeps `attackFifths(RA_COLUMN_ATK, RA_COLUMN_PEN)` = 300,
 * unsplit (`bossSkillsPharaohRitual.ts`), and `powerOfRaSplit.test.ts` pins that the two stay apart.
 */
export const RA_PERK_STRIKE_FIFTHS = attackFifths(RA_PERK_COLUMN_ATK, RA_PERK_COLUMN_PEN);

/**
 * @deprecated S188's name, kept ONLY because `canon.test.ts` imports it (a worktree may not edit the
 * canon). It is the PERK's column — the thing the canon row it pins describes — so it now reads **35**,
 * and the canon's *"300"* assertions go RED by design until the merge owner re-pins them (reported).
 * New code reads `RA_PERK_STRIKE_FIFTHS`.
 */
export const RA_STRIKE_FIFTHS = RA_PERK_STRIKE_FIFTHS;

/**
 * ⭐⭐ S191 (owner) — **HOW ONE COLUMN'S 35 IS SHARED.** *"it's 30 split so if there's like two enemies
 * it's split amongst them"*. PURE and integer: `total` over `n` targets already in their total order.
 *
 * Each target gets `floor(total / n)`; the remainder goes one fifth apiece to the FIRST `total mod n`
 * targets — so the shares sum to exactly `total`, differ by at most one, and nothing is fractional
 * (`damageEntity` throws on a fraction). ⚠ MINE: with more than `total` targets the first `total` get
 * 1 and the rest 0 — a column spread over 36 things cannot give each of them a whole fifth.
 * ⚠ Self-contained on purpose: `s191/carry` builds the same rule for the hub blast; the merge owner
 * may fold the two into one helper.
 */
export function raSplitShares(total: number, n: number): number[] {
  if (!Number.isInteger(n) || n <= 0) return [];
  const base = Math.floor(total / n);
  const rem = total - base * n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(base + (i < rem ? 1 : 0));
  return out;
}

/**
 * One thing a column can hit. A STRUCTURE is one of them however many of its connectors the circle
 * covers, and its share lands on `bondId` — its connector nearest the column centre.
 */
export type RaColumnTarget =
  | { readonly kind: 'structure'; readonly id: number; readonly d2: number; readonly bondId: BondId }
  | {
    readonly kind: 'creature' | 'defender' | 'primitive' | 'stinkCloud';
    readonly id: number;
    readonly d2: number;
    readonly target: DamageTarget;
  };

/** The kind tie-break of the total order, for two targets at exactly the same distance. ⚠ MINE. */
const RA_TARGET_KIND_RANK: Readonly<Record<RaColumnTarget['kind'], number>> = {
  structure: 0, creature: 1, defender: 2, primitive: 3, stinkCloud: 4,
};

/**
 * ⭐⭐ S191 — **EVERYTHING ONE COLUMN AT `at` CATCHES, FOR `caster`, IN THE ORDER THE SPLIT HANDS OUT
 * ITS REMAINDER.** Pure — reads the world, writes nothing — so a test can see the list the sim uses.
 *
 * One target each, all ENEMY (the caster's own are spared, as before):
 *   · a STRUCTURE — a connected component with at least one connector whose MIDPOINT is inside the
 *     circle. Its share lands on the ONE such connector nearest the centre (squared distance, then the
 *     lowest bond id). A bond touching any of the caster's shapes is never a candidate (a bond has no
 *     owner field; ownership is read off the shapes it joins, the rule the raid uses).
 *     ⚠ MINE: a structure whose SHAPES are inside the circle but none of whose connector midpoints are
 *     is not a target — a shape inside a structure is not targetable (canon §4), and until S191 those
 *     shapes were being razed by the area arm, which is how one column levelled a whole tower.
 *   · a CREATURE with pool left. ⚠ MINE: a corpse awaiting this tick's death sweep (`ehp <= 0`) and a
 *     Pharaoh channelling Ra (damage passes through him, `damageCreature`) take nothing, so they take
 *     no share either — a share on them would simply be lost. Untargetable-by-type units (the locust
 *     cloud) DO count: an area strike reaches them, the standing ruling.
 *   · a unit-class DEFENDER (Helga — `ehp !== null`). A tower has no pool and is not a target; its
 *     STRUCTURE is.
 *   · a LONE BUILT SHAPE (no connectors — canon §2's 5-fifth shape).
 *   · a landed STINK BAG. ⚠ Until S191 the column never reached bags (`applyRadialDamage` has no bag
 *     arm); the S191 brief lists them as targets, and canon §2 calls a bag a placed lone shape.
 *
 * The total order is squared distance to `at` (the connector's midpoint for a structure), then
 * `RA_TARGET_KIND_RANK`, then id. No `Math.hypot`, no `Map` order.
 */
export function raColumnTargets(world: World, caster: PlayerId, at: { x: number; y: number }): RaColumnTarget[] {
  const r2 = RA_COLUMN_RADIUS * RA_COLUMN_RADIUS;
  const d2At = (x: number, y: number): number => {
    const dx = x - at.x;
    const dy = y - at.y;
    return dx * dx + dy * dy;
  };
  const out: RaColumnTarget[] = [];

  // ── structures: every enemy connector in the circle, grouped by the component it belongs to ──
  const candidate = new Map<BondId, number>(); // a LOOKUP of d2; the decisions below never iterate it
  const candidateIds: BondId[] = [];
  for (const [bondId, bond] of world.bonds) {
    const aOwner = world.primitives.get(bond.aId)?.placedBy;
    const bOwner = world.primitives.get(bond.bId)?.placedBy;
    if (aOwner === caster || bOwner === caster) continue;
    const d2 = d2At((bond.a.pos.x + bond.b.pos.x) / 2, (bond.a.pos.y + bond.b.pos.y) / 2);
    if (d2 > r2) continue;
    candidate.set(bondId, d2);
    candidateIds.push(bondId);
  }
  candidateIds.sort((a, b) => (a as unknown as number) - (b as unknown as number));
  const grouped = new Set<BondId>();
  for (const first of candidateIds) {
    if (grouped.has(first)) continue; // its structure is already a target
    const bond = world.bonds.get(first)!;
    const anchor = world.primitives.get(bond.aId) ?? world.primitives.get(bond.bId);
    // An orphaned bond (no live endpoint) is its own structure — `damageConnector` fells it outright.
    const members = anchor === undefined ? [first] : componentOf(anchor, world.primitives, world.bonds).bondIds;
    let best = first;
    let bestD2 = candidate.get(first)!;
    for (const id of members) {
      grouped.add(id);
      const d2 = candidate.get(id);
      if (d2 === undefined) continue;
      if (d2 < bestD2 || (d2 === bestD2 && (id as unknown as number) < (best as unknown as number))) {
        best = id;
        bestD2 = d2;
      }
    }
    out.push({ kind: 'structure', id: best as unknown as number, d2: bestD2, bondId: best });
  }

  // ── units, Helga, lone shapes, bags ──
  for (const c of world.creatures.values()) {
    if (c.ownerPlayerId === caster || c.ehp <= 0 || isChannellingRa(c, world.tick)) continue;
    const d2 = d2At(c.pos.x, c.pos.y);
    if (d2 <= r2) out.push({ kind: 'creature', id: c.id as unknown as number, d2, target: { kind: 'creature', id: c.id } });
  }
  for (const d of world.defenders.values()) {
    if (d.ownerPlayerId === caster || d.ehp === null || d.ehp <= 0) continue;
    const d2 = d2At(d.pos.x, d.pos.y);
    if (d2 <= r2) out.push({ kind: 'defender', id: d.id as unknown as number, d2, target: { kind: 'defender', id: d.id } });
  }
  for (const p of world.primitives.values()) {
    if (p.placedBy === caster || p.bonds.size !== 0) continue;
    const d2 = d2At(p.pos.x, p.pos.y);
    if (d2 <= r2) out.push({ kind: 'primitive', id: p.id as unknown as number, d2, target: { kind: 'primitive', id: p.id } });
  }
  for (const s of world.stinkClouds.values()) {
    if (s.ownerPlayerId === caster || s.ehp <= 0) continue;
    const d2 = d2At(s.pos.x, s.pos.y);
    if (d2 <= r2) out.push({ kind: 'stinkCloud', id: s.id as unknown as number, d2, target: { kind: 'stinkCloud', id: s.id } });
  }

  out.sort((a, b) => a.d2 - b.d2 || RA_TARGET_KIND_RANK[a.kind] - RA_TARGET_KIND_RANK[b.kind] || a.id - b.id);
  return out;
}

/**
 * ⭐ WHERE COLUMN `k` OF A SEAT'S STRIKE LANDS — the Pharaoh's `raColumnPos`, re-centred on the aim
 * and seeded by the seat (see `powerOfRaRules.ts` for why the seat and not the cast tick). The sim
 * damages through this and the renderer draws through this; there is no second copy.
 *
 * ⭐ S188 P11 — `charge` is the strike's index among this fight's casts (0 for POWER OF RA's only
 * one), folded into the seed as `seat + MAX_PLAYERS × charge` so WRATH OF RA's three strikes fall in
 * three different patterns while charge 0 keeps exactly the S188 P6 pattern. The index is known to
 * the aiming client before the click — ⚠ S190 W-4: exactly only once its previous cast has synced,
 * so the client adds the casts it has sent and not yet seen (`raCastsInWaveLocal`, render-side). ⚠ MINE.
 */
export function raStrikeColumnPos(
  seat: PlayerId,
  k: number,
  aim: { readonly x: number; readonly y: number },
  charge = 0,
): { x: number; y: number } {
  return raColumnPos((seat as unknown as number) + MAX_PLAYERS * charge, k, aim.x, aim.y);
}

/**
 * ⭐⭐ THE REDUCER. Host-authoritative, NO-OP-NEVER-THROW: every refusal returns the world untouched.
 *
 *   · the seat must hold `mummies.l0`, be alive, unbenched, in a PLAYING match, in FIGHT, and have a
 *     charge left this wave (1, or 3 with WRATH OF RA) — all of it one predicate, `raCastRefusal`,
 *     the one the button reads;
 *   · the aim must be a finite point on the canvas — `raAimPoint`, the one the telegraph reads —
 *     and what is STORED is its rounded, clamped integer form (Council A1).
 *
 * The strike starts NOW: `untilTick` is the Pharaoh's deadline shape (start + `RA_RITUAL_TICKS`), so
 * column `k` lands at `raColumnImpactTick(untilTick, k)` — two seconds after the cast, then every two.
 */
export function applyCastPowerOfRa(world: World, action: CastPowerOfRaAction): World {
  if (raCastRefusal(world, action.playerId) !== null) return world;
  const aim = raAimPoint(action.x, action.y);
  if (aim === null) return world;
  const caster = world.players.get(action.playerId);
  if (caster === undefined) return world; // unreachable past raCastRefusal; kept so tsc can see it
  /*
   * ⭐ S188 P11 — APPEND, after dropping every earlier-wave strike (all long finished: five columns
   * take 10 s and a wave's FIGHT is far longer, and a column due after the fight never lands). So the
   * list is always one wave's casts in cast order, never more than the seat's charges, and an entry's
   * index is its charge number. ⚠ MINE: the three strikes may overlap — a player who spends all
   * three in one second gets three strikes at once. Refusing a cast while one was still falling
   * would read as a broken button, and he asked for three uses, not three in a queue.
   */
  const kept = caster.raStrikes.filter((s) => s.wave === world.waveNumber);
  kept.push({ wave: world.waveNumber, x: aim.x, y: aim.y, untilTick: world.tick + RA_RITUAL_TICKS });
  caster.raStrikes = kept;
  return world;
}

/**
 * ⭐⭐ THE `racialTick` SLOT. Lands every column whose impact tick is THIS tick, for every seat.
 *
 * ⚠ NO PERK RE-CHECK AT LANDING, deliberately. A strike can only exist if the reducer accepted it,
 * picks are append-only, and a caster whose castle falls mid-strike still has the columns it already
 * called come down — the Pharaoh's ultimate finishes after his death for the same reason. ⚠ MINE.
 */
export function runPowerOfRa(world: World): void {
  if (world.gameState !== 'PLAYING') return;
  const seats = [...world.players.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  for (const [seat, p] of seats) {
    // Seat, then charge, then column — a total order, so two overlapping WRATH strikes whose columns
    // land on one tick resolve identically on every peer.
    for (const [charge, strike] of p.raStrikes.entries()) {
      for (let k = 0; k < RA_COLUMN_COUNT; k++) {
        if (raColumnImpactTick(strike.untilTick, k) !== world.tick) continue;
        landRaColumn(world, seat, raStrikeColumnPos(seat, k, strike, charge));
      }
    }
  }
}

/**
 * One column of Ra's light at `at`, on behalf of `caster`. ⭐ S191 — `RA_PERK_STRIKE_FIFTHS` IN TOTAL,
 * split over `raColumnTargets` by `raSplitShares`.
 *
 * ⛔ STRUCTURES FIRST, THEN THE REST — and the order is not cosmetic. A stink bag this column pops
 * BURSTS (`applyRadialDamage`), and the burst hits shapes; a structure whose chosen connector it razed
 * first would lose its share. Both passes walk the one total order.
 */
function landRaColumn(world: World, caster: PlayerId, at: { x: number; y: number }): void {
  const targets = raColumnTargets(world, caster, at);
  if (targets.length === 0) return;
  const shares = raSplitShares(RA_PERK_STRIKE_FIFTHS, targets.length);
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!;
    const share = shares[i]!;
    if (t.kind !== 'structure' || share === 0) continue;
    if (!world.bonds.has(t.bondId)) continue;
    // S188 merge — `null` attacker: a sky strike has no creature to heal (BLOOD DEBT).
    if (damageConnector(world, t.bondId, share, null)) {
      /*
       * ⚠ `cause: 'raid'` — the one existing cause meaning "a PLAYER's attack reached this connector's
       * capacity" (bypasses the charge gate, attributes the sever to the caster). ⛔ S188 audit F1 —
       * RESOLVED INLINE, not dispatched, so a caster benched or eliminated mid-strike still breaks
       * what the column drained.
       */
      applySeverBond(world, { type: 'SEVER_BOND', bondId: t.bondId, playerId: caster, cause: 'raid' });
    }
  }
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!;
    const share = shares[i]!;
    if (t.kind === 'structure' || share === 0) continue;
    // `'aura'` and `null`, as the Pharaoh's column: a column of light is nobody a unit can turn on.
    damageEntity(world, t.target, share, 'aura', null);
  }
}
