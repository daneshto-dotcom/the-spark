/**
 * SPARK — S161 P2: **SEAT ELIMINATION** (spec blocker B2), on the owner's ruling R127.
 *
 * > Owner, 2026-09-02: *"when a castle is destroyed a player cant gather anymore primitives so yes
 * > he is out! but he should stay as spectator until there is one player left!"*
 *
 * That one sentence contains three separate mechanics, and this module owns the policy for all
 * three so they cannot drift apart:
 *
 *   1. **"cant gather anymore primitives"** — the ECONOMY GATE. It is the owner's own mechanism and
 *      the reason the rest follows: no gathering ⇒ no primitives ⇒ nothing buildable.
 *   2. **"so yes he is out"** — the seat may no longer ACT. Enforced at `dispatch`'s single choke
 *      point, exactly like the S86 bench gate below.
 *   3. **"stay as spectator until there is one player left"** — the match does NOT end on the first
 *      castle to fall, which is what shipped before this.
 *
 * ## ⛔ WHAT THIS REPLACES, AND WHY IT WAS WRONG
 *
 * `tickGameState` ended the match for EVERYONE the instant any castle reached 0 HP and awarded the
 * win to `survivors[0]` — the first entry of a `[...world.players.values()]` filter, i.e. **`Map`
 * insertion order**. In a 1v1 that is right by accident (there is only one survivor). In any FFA it
 * is the exact defect class this codebase spends its comments on: S155 N1 handed one seat every
 * melee exchange for a whole match because `Map` iteration decided a tie. Here it decided the match.
 *
 * ## ⭐ WHY `castleHp <= 0` IS THE PREDICATE AND THERE IS NO `eliminated: boolean`
 *
 * A boolean would be a SECOND source of truth for something already on the wire, already hashed
 * into the players family, and already read by `castleGuns.ts` (*"⚠ A FALLEN CASTLE DOES NOT
 * SHOOT"*) and by the win gate. Two fields that must agree are two fields that can disagree — and
 * the one that would have gone stale is the one nothing else reads.
 *
 * `eliminatedAtTick` is therefore NOT the elimination flag. It is the ORDER, which genuinely cannot
 * be derived from `castleHp`: R10/R20 ask for 1st–4th placings, and "who fell first" is information
 * the HP number does not carry. It is written once, by the host, on the tick a castle first reaches
 * zero.
 *
 * ## Determinism
 *
 * `isEliminated` is a pure function of a synced field, so a joiner's optimistic dispatch and the
 * host's authoritative dispatch reject identically by construction — the same property the bench
 * gate's docblock claims for `benchedUntilTick`. `markFallenSeats` is HOST-ONLY (it writes), and
 * its result rides the snapshot like every other player field.
 */

import type { PlayerId } from '../types.ts';
import type { Player } from '../game/player.ts';
import type { GameAction, World } from './world.ts';

type EliminationPolicy = 'allow' | 'deny';

/**
 * Exhaustive elimination policy over the client-intent allowlist, mirroring `BENCH_INTENT_POLICY`'s
 * shape so the two can be read side by side. `elimination.test.ts` asserts set equality against
 * `CLIENT_INTENT_TYPES` in both directions, so a new client intent FORCES a decision here.
 *
 * ⛔ THE DEFAULT IS `deny`, WHICH IS THE OPPOSITE OF THE BENCH'S DEFAULT, AND THE DIFFERENCE IS THE
 * WHOLE POINT. A bench is a PUNISH WINDOW — it ends, and the policy is tuned so a benched player
 * loses tempo without losing standing orders. Elimination does not end. Anything allowed here is
 * allowed FOR THE REST OF THE MATCH, so "it acquires nothing" is not sufficient grounds: a dead
 * seat quietly re-tasking units or queueing orders is a dead seat still playing.
 */
export const ELIMINATION_INTENT_POLICY = {
  // ── Acquisition, building and the economy: the ruling's own subject ──
  PICKUP_SPARK: 'deny',
  PLACE_PRIMITIVE: 'deny',
  PLACE_FROM_FREE: 'deny',
  BUY_GATHERER: 'deny',
  UPGRADE_GATHERER_SPEED: 'deny',
  PULL_FROM_BANK: 'deny',
  BUILD_BLUEPRINT: 'deny',
  FEED_TOWER: 'deny',
  REPAIR_STRUCTURE: 'deny',
  SCRAP_STRUCTURE: 'deny',

  // ── Offence and disruption. A fallen seat must not be able to decide the match between the
  //    players still in it — the kingmaker problem, and the sharpest reason "out" has to mean out.
  SEVER_BOND: 'deny',
  RAID_TARGET: 'deny',
  SHRINK_TERRITORY: 'deny',
  TRIGGER_BOMB: 'deny',
  TRIGGER_RAINBOW: 'deny',
  PICKUP_POTATO: 'deny',
  PLACE_POTATO: 'deny',

  // ── Standing orders. ⚠ ALLOWED WHILE BENCHED, DENIED HERE — see the policy docblock. The bench
  //    lifts and the orders matter again; elimination does not lift, and the units they command
  //    have nothing left to gather for.
  SET_GATHERER_PREFERENCE: 'deny',
  ENQUEUE_GATHERER_ORDER: 'deny',
  CANCEL_GATHERER_ORDER: 'deny',

  // ── The NONET puzzle realm. Denied for the same reason as the offensive verbs rather than by
  //    analogy: solving it awards a real in-match advantage, and a spectator must not be able to
  //    hand one out (or take one) after their own castle is rubble.
  SUDOKU_SOLVED: 'deny',

  /*
   * ── The three genuine ALLOWs, and each is a release or a read, never a gain ──
   *
   * DROP_SPARK / DROP_POTATO: release-only. Blocking a drop could STRAND a `Carrying` player — the
   * carry-1 FSM has no other exit — and a drop never gains the actor anything. This is the bench
   * gate's own reasoning and it survives the stricter default unchanged.
   *
   * UPDATE_AVATAR_POS: pure pointer telemetry, and it is precisely what makes the owner's word
   * *"spectator"* mean something. A seat frozen out of even moving its cursor is not spectating,
   * it is a stuck window. It acquires nothing and touches no other seat's state.
   */
  DROP_SPARK: 'allow',
  DROP_POTATO: 'allow',
  UPDATE_AVATAR_POS: 'allow',
} as const satisfies Partial<Record<GameAction['type'], EliminationPolicy>>;

/**
 * True iff this action type must be rejected when its actor has been eliminated. Unknown types
 * (host-internal actions, `*_TICK`, `SPAWN_*`) return false — this gate governs only the
 * client-intent surface, exactly as `isBenchDeniedIntent` does.
 */
export function isEliminationDeniedIntent(type: GameAction['type']): boolean {
  return (
    (ELIMINATION_INTENT_POLICY as Partial<Record<GameAction['type'], EliminationPolicy>>)[type] ===
    'deny'
  );
}

/**
 * Has this seat lost its castle? The single predicate — every other site asks this rather than
 * re-testing `castleHp` itself, so the threshold has one home.
 *
 * ⚠ `<= 0`, NOT `=== 0`. `damageEntity` can overshoot, and `castleGuns.ts` already gates on
 * `castleHp <= 0` for the same reason. The two must agree: a castle that cannot shoot but is not
 * "eliminated" would be a seat that has lost its weapon and kept its economy.
 */
export function isEliminated(player: Player): boolean {
  return player.castleHp <= 0;
}

/** Seats still in the match, in explicit id order — never `Map` order. See the file docblock. */
export function livingSeats(world: World): PlayerId[] {
  return [...world.players.entries()]
    .filter(([, p]) => !isEliminated(p))
    .map(([id]) => id)
    .sort((a, b) => (a as unknown as number) - (b as unknown as number));
}

/**
 * HOST-ONLY. Stamp `eliminatedAtTick` on every seat that has fallen and does not carry one yet.
 * Returns the seats stamped THIS tick, in id order, so a caller can announce them.
 *
 * ⚠ WRITE-ONCE. The `undefined` check is what makes the field an ELIMINATION ORDER rather than a
 * running clock: without it every subsequent tick would overwrite it with `world.tick` and all
 * placings would collapse to "everyone died at the end".
 *
 * ⚠ AND IT IS NEVER UNSET. There is no healing path for a castle today, but if one ships, a seat
 * whose HP goes back above zero must NOT silently re-enter the match with a stale stamp — that
 * decision belongs to whoever builds the healing, and this comment is the note they need.
 */
export function markFallenSeats(world: World): PlayerId[] {
  const stamped: PlayerId[] = [];
  for (const [id, p] of world.players) {
    if (isEliminated(p) && p.eliminatedAtTick === undefined) {
      p.eliminatedAtTick = world.tick;
      stamped.push(id);
    }
  }
  return stamped.sort((a, b) => (a as unknown as number) - (b as unknown as number));
}

/**
 * Final standings, best first: survivors, then the fallen in REVERSE order of elimination — the
 * seat that lasted longest places highest. R10/R20 ask for 1st–4th and this is the derivation.
 *
 * ⚠ TOTAL ORDER, WITH SEAT ID AS THE TIE-BREAK. Two castles can fall on the same tick (a shared
 * DoT beat, two castle shots resolving together), and `eliminatedAtTick` alone would then leave the
 * placing to `Map` insertion order — the S155 N1 defect, in the one place a player reads as a
 * verdict on their match. A seat with no stamp sorts as `Infinity`, so survivors lead.
 */
export function matchPlacings(world: World): PlayerId[] {
  return [...world.players.entries()]
    .sort(([aId, a], [bId, b]) => {
      const at = a.eliminatedAtTick ?? Number.POSITIVE_INFINITY;
      const bt = b.eliminatedAtTick ?? Number.POSITIVE_INFINITY;
      if (at !== bt) return bt - at; // later elimination = better placing
      return (aId as unknown as number) - (bId as unknown as number);
    })
    .map(([id]) => id);
}
