/**
 * SPARK — S185 — **THE STAT RADAR. One glance at a unit's shape instead of four numbers.**
 *
 * Owner, S185: *"In the character sheets and the tower sheets we need a radar chart, spider chart,
 * web chart, whatever. It should be like a polygon representing the different stats. A level one
 * character like a bat would have like 1,1,1,1, and then you look at the freaking Vlad and it would
 * be mega developed by compare. And it's cool because with one glance, without even reading it out,
 * you can see the strength and the balance of the stats of that character. It should probably be in
 * that empty area just to the right of the stats … we should work it to look really good."*
 *
 * ## ⭐ FOUR AXES, WHICH IS THE NUMBER HE ACTUALLY DESCRIBED
 *
 * He said *"like 1,1,1,1"* and then wondered aloud about *"the speed and the attack speed"*. The
 * four are `ATK / PEN / HP / DEF` — the same four `statRowsFor` already prints, so the picture and
 * the numbers beside it can never disagree. **Both extra axes were measured and both are traps:**
 *
 * ⛔ **ATTACK RANGE IS DEGENERATE.** `makeT3Config` and `makeT9BossConfig` BOTH hard-set
 * `attackRange: GOBLIN_ATTACK_RANGE` (35, "true melee"), so every tier-3 unit and every boss in the
 * game shares one value. An axis that is identical for 24 of 24 configs draws a flat edge and tells
 * the player nothing.
 *
 * ⛔ **AND SPEED WOULD ACTIVELY CONTRADICT HIM.** Speed is a multiplier and every boss is ≤ 1.0 by
 * deliberate design (*"a boss that outruns the units escorting it arrives alone"*), so on a speed
 * axis **the bat beats Vlad** — the exact opposite of the "mega developed" comparison he is asking
 * the chart to show. Left out on purpose, and recorded here so it is not "fixed" back in.
 *
 * ## ⛔ THE AXES ARE THE RAW STATS, NEVER THE DERIVED POOLS
 *
 * The canon ladder is `pool = HP × (1 + 0.2 × DEF) × 5` and `damage = ATK × (1 + 0.2 × PEN) × 5`,
 * and the card already prints both totals. Plotting the totals would double-count what is written
 * two columns away and would collapse two axes into one. The radar plots what the ladder is made
 * OF; the card prints what it adds up to.
 *
 * ## ⚠ NORMALISATION IS GLOBAL, AND THE MAXIMA ARE DERIVED, NOT TYPED IN
 *
 * Every axis is scaled against the highest value any creature in the game has, computed from
 * `CREATURE_CONFIGS` at module load. That is what makes a bat read tiny and a boss read huge —
 * the comparison he asked for only works if every unit is drawn on one scale.
 *
 * ⛔ **A HAND-WRITTEN MAX WOULD ROT THE DAY A BOSS IS RETUNED**, silently, with every test green and
 * the chart quietly wrong — the exact failure mode `UNIT_STAT_TABLE.md` has been living for three
 * sessions. Deriving costs one pass over 24 objects, once.
 *
 * Measured at the time of writing: HP 24 (`t9BossNagas`), DEF 16 (`t9BossMummies`), ATK 10 and
 * PEN 10 (`t9BossVampires`). Minimums are HP 1, DEF 0, ATK 1, PEN 0.
 */

import { CREATURE_CONFIGS } from '../state/creatures/voltkin-config.ts';
import { DEFENDER_CONFIGS } from '../state/defenders/defender.ts';
import { CASTLE_ATTACK_RANGE } from '../constants.ts';
import { attackFifths } from '../state/stats.ts';

export interface RadarAxis {
  readonly label: string;
  readonly value: number;
  readonly max: number;
  /** LOWER IS BETTER — the axis is flipped before plotting (e.g. RELOAD). */
  readonly invert?: boolean;
}

export interface RadarPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * The global maximum of each plotted stat, over every creature configured in the game.
 *
 * ⚠ `Math.max` over an empty list is `-Infinity`, which would silently turn every ratio into `-0`
 * and draw a collapsed dot. The `|| 1` floor makes an empty roster draw an empty web instead of a
 * wrong one — cheap insurance against a future refactor that builds this table lazily.
 */
function creatureMax(key: 'hp' | 'def' | 'atk' | 'pen' | 'maxAccel' | 'attackCadenceTicks'): number {
  const vals = Object.values(CREATURE_CONFIGS)
    .map((c) => (c as unknown as Record<string, number>)[key])
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  return Math.max(1, ...vals);
}

function defenderMax(key: 'atk' | 'pen' | 'attackRange'): number {
  const vals = Object.values(DEFENDER_CONFIGS)
    .map((c) => (c as unknown as Record<string, number>)[key])
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  return Math.max(1, ...vals);
}

/** The single biggest hit any creature in the game lands, in fifths — the ceiling for `SHOT`. */
function maxHitFifths(): number {
  const vals = Object.values(CREATURE_CONFIGS).map(
    (c) => attackFifths((c as unknown as Record<string, number>).atk ?? 0,
                        (c as unknown as Record<string, number>).pen ?? 0));
  return Math.max(1, ...vals);
}

export const RADAR_MAX_HP = creatureMax('hp');
export const RADAR_MAX_DEF = creatureMax('def');
export const RADAR_MAX_ATK = Math.max(creatureMax('atk'), defenderMax('atk'));
export const RADAR_MAX_PEN = Math.max(creatureMax('pen'), defenderMax('pen'));
export const RADAR_MAX_RANGE = Math.max(
  defenderMax('attackRange'), creatureMax('attackRange' as 'hp'), CASTLE_ATTACK_RANGE);
export const RADAR_MAX_SHOT = maxHitFifths();
/**
 * ⚠ MINE, NOT HIS, AND THE ONLY CHOSEN NUMBER IN THIS FILE. Every other ceiling is derived from a
 * real roster; RELOAD has no natural maximum because nothing in the game reloads slower than the
 * castle. Ten seconds is a readable outer bound that leaves the castle's 4 s reading as clearly
 * brisk rather than pinned to the rim. If a slower emplacement ever ships, derive this like the
 * others instead of raising it.
 */
export const RADAR_MAX_RELOAD_S = 10;
export const RADAR_MAX_MOVE = creatureMax('maxAccel');
/**
 * ⚠ ATTACK SPEED IS A CADENCE IN TICKS, SO LOWER IS FASTER — the axis is INVERTED below. The
 * ceiling is the slowest cadence configured, derived like the rest.
 *
 * ⛔⛔ **AND IT IS THE ONE AXIS WITH A KNOWN DATA DEFECT, NAMED HERE RATHER THAN HIDDEN.** 22 of 24
 * creatures are 60. `chewer` and `locustCloud` carry **300**, and for the chewer that number is dead
 * legacy — its real bite rate is `CHEW_INTERVAL_TICKS` (60), which is what the sim actually uses. So
 * the chewer's chart will read five times slower than it fights until that config is corrected.
 * That is a defect in the CONFIG, not in the chart, and fixing it here would paper over it.
 */
export const RADAR_MAX_CADENCE = creatureMax('attackCadenceTicks');

/**
 * ⭐⭐ **THE AXIS REGISTRY — every stat this game prints on a card, and what it is measured
 * against.** Owner, S185, correcting an argument of mine that a castle radar would be pointless
 * because its numbers never change:
 *
 * > *"Remember, the radar chart holds anything from like one health to a hundred. When you look at a
 * > castle versus a different structure it would show slightly different shapes … a bat versus a
 * > vampire, they hold the same stats which do not change — you can't upgrade them yet — but the
 * > charts would look slightly different. You'll see which one is stronger just by opening the
 * > character sheet. You don't even need to read numbers … this one is more focused on defense,
 * > like when you look at the shield goblin."*
 *
 * ⛔ **HE WAS RIGHT AND MY OBJECTION WAS INCONSISTENT.** *No* unit in the game is upgradeable today,
 * so "it draws the same shape every match" would have killed the entire feature rather than just
 * the castle. The chart's value is COMPARISON BETWEEN THINGS at a glance, not change over time for
 * one thing. The castle gets a radar.
 *
 * ⭐ **AND IT IS ALREADY DYNAMIC-READY, WHICH HE ASKED FOR EXPLICITLY** (*"later when we do creature
 * upgrades and building upgrades that would change the stats, then it will be dynamic, so we need to
 * think ahead"*). Because the axes are read from the rows the card is ALREADY printing, the day a
 * stat becomes upgradeable the chart follows it with no work here at all. `REGEN` proves the
 * mechanism today: it is the one castle stat that already moves, and it already animates the chart.
 *
 * ⚠ `invert: true` means LOWER IS BETTER, so the axis is flipped before plotting. Without it a fast
 * reload would draw as a weakness — the single most misleading thing a radar can do.
 */
export interface AxisSpec { readonly max: number; readonly invert?: boolean }

export const AXIS_SPECS: Readonly<Record<string, AxisSpec>> = {
  ATK: { max: RADAR_MAX_ATK },
  PEN: { max: RADAR_MAX_PEN },
  HP: { max: RADAR_MAX_HP },
  DEF: { max: RADAR_MAX_DEF },
  RANGE: { max: RADAR_MAX_RANGE },
  SHOT: { max: RADAR_MAX_SHOT },
  RELOAD: { max: RADAR_MAX_RELOAD_S, invert: true },
  SPEED: { max: RADAR_MAX_MOVE },
  'ATK SPD': { max: RADAR_MAX_CADENCE, invert: true },
  /*
   * ⭐ S185 — THE SPAWNER'S OWN TWO STATS, so a tower that fields units gets a chart at all.
   * Owner: *"the graph didn't land on all the towers, it should be everywhere … what about the
   * laser turret? What about everything else?"* A bat tower is a SPAWNER, not an emplacement: it
   * prints no ATK/PEN/RANGE, so before these it had two axes and fell under the minimum.
   *
   * ⚠ SHAPES is a BUILD-COST stat sitting beside combat ones, and that is deliberate rather than
   * sloppy — for a spawner it is one of only two numbers the building actually has, and "what did
   * this cost me" is a fair thing to read off the same glance.
   */
  SHAPES: { max: 9 },
  SPAWN: { max: 30, invert: true },
  // ⛔ REGEN is deliberately ABSENT. Owner, S185: *"the castle also has regeneration, but that you
  // can upgrade … that's like a scale for now. We won't include that for now."* Adding it back is a
  // decision, not a tidy-up.
};

/**
 * ⭐ A VISIBLE FLOOR, so a zero axis is a point on the web rather than a vertex collapsed onto the
 * centre. PEN and DEF are legitimately 0 on most tier-1 units, and a polygon with two vertices at
 * the origin reads as a rendering fault rather than as "this unit has no armour".
 */
export const RADAR_FLOOR_FRAC = 0.06;

/** A polygon needs three corners; two axes are a line and one is a dot. */
export const RADAR_MIN_AXES = 3;
export function unitRadarAxes(hp: number, def: number, atk: number, pen: number): RadarAxis[] {
  return [
    { label: 'ATK', value: atk, max: RADAR_MAX_ATK },
    { label: 'PEN', value: pen, max: RADAR_MAX_PEN },
    { label: 'HP', value: hp, max: RADAR_MAX_HP },
    { label: 'DEF', value: def, max: RADAR_MAX_DEF },
  ];
}

/**
 * How far out along its spoke an axis sits, 0..1, with the visible floor applied.
 *
 * ⚠ CLAMPED AT BOTH ENDS. A value above its max — which a future unit will eventually have, between
 * the moment it is added and the moment anyone re-reads this file — must not draw outside the web.
 */
export function radarFrac(axis: RadarAxis): number {
  const raw = axis.max <= 0 ? 0 : axis.value / axis.max;
  const clamped = Math.max(0, Math.min(1, raw));
  // LOWER IS BETTER: a 2 s reload must reach further out than a 9 s one.
  const scored = axis.invert === true ? 1 - clamped : clamped;
  return RADAR_FLOOR_FRAC + scored * (1 - RADAR_FLOOR_FRAC);
}

/**
 * PURE — the polygon for a set of axes, on a circle of radius `r` about `(cx, cy)`.
 *
 * ⭐ THE FIRST SPOKE POINTS STRAIGHT UP and they run clockwise, so a four-axis chart reads as a
 * diamond standing on a vertex rather than as a square rotated by an arbitrary amount. Everything
 * in this function is arithmetic on its arguments — no world, no tick, no clock — which is what
 * makes it fully testable even though no renderer runs under vitest.
 */
export function radarPolygon(axes: readonly RadarAxis[], cx: number, cy: number, r: number): RadarPoint[] {
  const n = axes.length;
  if (n === 0) return [];
  return axes.map((axis, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const d = r * radarFrac(axis);
    return { x: cx + Math.cos(angle) * d, y: cy + Math.sin(angle) * d };
  });
}

/** PURE — the outer web vertices, i.e. the polygon a maxed-out unit would draw. */
export function radarWeb(n: number, cx: number, cy: number, r: number): RadarPoint[] {
  const out: RadarPoint[] = [];
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    out.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  }
  return out;
}

/** Flattened `[x, y, x, y, …]`, the shape Pixi's `poly()` takes. */
export function flatten(points: readonly RadarPoint[]): number[] {
  const out: number[] = [];
  for (const p of points) {
    out.push(p.x, p.y);
  }
  return out;
}

/**
 * PURE — the axes for a card, derived from the stat rows the card is ALREADY printing.
 *
 * ⭐⭐ **DERIVED FROM THE ROWS ON PURPOSE, RATHER THAN PLUMBED THROUGH THE VIEW MODEL.** Two reasons,
 * and the second is the one that matters:
 *
 *  1. it touches one file instead of the FIVE `CharacterSheetView` constructors (creature, defender,
 *     structure, castle, stink cloud), four of which would only ever pass `null`;
 *  2. ⛔ **the picture and the numbers beside it become incapable of disagreeing.** If the radar were
 *     fed from a second source it could drift from the printed rows — a chart that contradicts the
 *     column six pixels to its left is worse than no chart, and nothing in the suite would catch it.
 *
 * ⚠ RETURNS `null` BELOW `RADAR_MIN_AXES`, RATHER THAN A DEGENERATE CHART. Only rows with an entry
 * in `AXIS_SPECS` become axes; a card with fewer than three of them gets no radar at all.
 *
 * ⛔⛔ S188 — **THE CASTLE HAS A RADAR, AND THIS DOCBLOCK SAID IT DID NOT.** It read *"the castle is
 * excluded"* — the pre-S185 argument that its numbers were flat constants, so its chart would never
 * move. The owner overruled that in S185 (see `AXIS_SPECS` above: *"The castle gets a radar"*), and
 * from then on the castle card's SHOT / RANGE / RELOAD rows drew a three-axis chart. Since S188 P3
 * the keep's ATK / PEN / DEF are PURCHASABLE and its card prints ATK · PEN · DEF · RANGE · RELOAD
 * (REGEN has no axis), so it draws a FIVE-axis chart that moves with every purchase — exactly the
 * *"when we do building upgrades … it will be dynamic"* he asked for.
 */
export function radarAxesFromRows(
  rows: readonly { readonly label: string; readonly points: number }[],
): RadarAxis[] | null {
  const axes: RadarAxis[] = [];
  for (const r of rows) {
    const spec = AXIS_SPECS[r.label];
    if (spec === undefined) continue;
    axes.push({ label: r.label, value: r.points, max: spec.max, invert: spec.invert });
  }

  /*
   * ⭐⭐ S185 — A TOWER'S HP AND DEF **ARE** ITS CONNECTOR COUNT, so a tower card that prints
   * CONNECTORS is printing both of them under one name. Owner, looking at a tower's chart: *"why
   * isn't it a triangle? They have more than three stats. They have range, they have HP, defense —
   * pretty much the same stats as units do, except movement speed."*
   *
   * ⛔ THIS IS THE CANON, NOT AN INVENTION. SPARK_CANON §2: *"A STRUCTURE IS ON THE SAME LADDER, and
   * its HP and DEF are both its connector count — pool(n) = n × (5 + n)."* Without this a tower drew
   * ATK/PEN/RANGE and nothing else: a triangle for something that has five real stats.
   *
   * ⚠ ONLY WHEN HP AND DEF ARE ABSENT. A card that prints them itself is authoritative and is never
   * second-guessed — this fills a gap, it does not override anyone.
   */
  const conn = rows.find((r) => r.label === 'CONNECTORS');
  const hasPool = axes.some((a) => a.label === 'HP' || a.label === 'DEF');
  if (conn !== undefined && !hasPool) {
    axes.push({ label: 'HP', value: conn.points, max: AXIS_SPECS.HP!.max });
    axes.push({ label: 'DEF', value: conn.points, max: AXIS_SPECS.DEF!.max });
  }

  return axes.length >= RADAR_MIN_AXES ? axes : null;
}