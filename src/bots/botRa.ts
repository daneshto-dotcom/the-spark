/**
 * SPARK — S188 audit F2 — **A BOT CALLS RA TOO.**
 *
 * The draft's deadline takes the racial pick for every bot (`autoPickFor`, SPARK_RACES_SPEC §9.5: a
 * bot picks its race option), so every bot mummies seat holds POWER OF RA — and, with it at level 0,
 * is offered WRATH OF RA at level 10. A perk the bot never USES is a bot that is silently weaker than
 * the human it replaces. So it casts: once per fight, or three times with WRATH.
 *
 * ## ⛔ SYNCED STATE IN, AN INTENT OUT — AND NOTHING THE BOT REMEMBERS
 *
 * The host's `BotManager` and the worker's (built fresh from `workerBotInit`) must produce the SAME
 * cast on the SAME tick. Every other bot intent manages that by being a function of synced state and
 * the seeded per-bot stream; this one does not even need the stream. It reads positions, the phase
 * clock and the seat's own `raStrikes`, and imposes a total order on its choice — so there is no
 * controller-private state to diverge after a worker adoption or a host migration.
 *
 * ## THE CHOICE
 *
 * Candidate aims are the enemy's creatures and connector midpoints. Each is scored by the number of
 * enemy creatures and connectors its FIVE columns would actually land on — the reducer's own aim
 * normalisation (`raAimPoint`) and the sim's own landing function (`raStrikeColumnPos`, with the
 * charge index the cast will get), so the bot scores the strike it will really make. Best score
 * wins; ties go to the aim nearer the bot's own castle (defend first), then to the candidate order,
 * which is creature ids ascending, then bond ids ascending.
 *
 * ⚠ ALL MINE, NONE THE OWNER'S: when it casts (a cluster worth ≥ `BOT_RA_MIN_HITS`, or anything
 * at all once the fight is nearly over), how often it looks (`BOT_RA_EVAL_EVERY_TICKS`, phase-spread
 * by seat), that a WRATH bot waits for its previous strike's last column before the next, and the
 * candidate cap.
 */

import { PHYSICS_HZ, RA_COLUMN_COUNT, RA_COLUMN_RADIUS, RA_RITUAL_TICKS } from '../constants.ts';
import type { PlayerId } from '../types.ts';
import type { GameAction, World } from '../state/world.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { raAimPoint, raCastRefusal, raCastsInWave } from '../state/racial/powerOfRaRules.ts';
import { raStrikeColumnPos } from '../state/racial/powerOfRa.ts';

/** How often a bot looks for a strike, in ticks (twice a second), phase-spread by seat. ⚠ MINE. */
export const BOT_RA_EVAL_EVERY_TICKS = 30;
/** The smallest cluster worth a strike while the fight has time left. ⚠ MINE. */
export const BOT_RA_MIN_HITS = 3;
/** Candidate aims considered per family — the cost ceiling (64 × 5 columns × targets). ⚠ MINE. */
export const BOT_RA_MAX_CANDIDATES = 64;

interface Target {
  readonly x: number;
  readonly y: number;
}

/** The CAST_POWER_OF_RA a bot seat should send THIS tick, or null. Pure; never mutates the world. */
export function botRaAction(world: World, seat: PlayerId): GameAction | null {
  const s = seat as unknown as number;
  if (world.tick % BOT_RA_EVAL_EVERY_TICKS !== s % BOT_RA_EVAL_EVERY_TICKS) return null;
  if (raCastRefusal(world, seat) !== null) return null;
  const me = world.players.get(seat);
  if (me === undefined) return null;

  // One strike in the air at a time: a WRATH bot spreads its three across the fight.
  let lastUntil = -Infinity;
  for (const st of me.raStrikes) if (st.wave === world.waveNumber) lastUntil = Math.max(lastUntil, st.untilTick);
  if (world.tick < lastUntil) return null;

  // ── the enemy's targets, in id order (a total order, never Map order) ──
  const creatures: Target[] = [...world.creatures.values()]
    .filter((c) => c.ownerPlayerId !== seat)
    .sort((a, b) => (a.id as unknown as number) - (b.id as unknown as number))
    .map((c) => ({ x: c.pos.x, y: c.pos.y }));
  const bonds: Target[] = [...world.bonds.values()]
    .filter((b) => world.primitives.get(b.aId)?.placedBy !== seat && world.primitives.get(b.bId)?.placedBy !== seat)
    .sort((a, b) => (a.id as unknown as number) - (b.id as unknown as number))
    .map((b) => ({ x: (b.a.pos.x + b.b.pos.x) / 2, y: (b.a.pos.y + b.b.pos.y) / 2 }));
  const targets = [...creatures, ...bonds];
  if (targets.length === 0) return null;
  const candidates = [
    ...creatures.slice(0, BOT_RA_MAX_CANDIDATES),
    ...bonds.slice(0, BOT_RA_MAX_CANDIDATES),
  ];

  const charge = raCastsInWave(me, world.waveNumber);
  const home = castleAnchor(s, world.layout);
  const r2 = RA_COLUMN_RADIUS * RA_COLUMN_RADIUS;
  let best: { aim: { x: number; y: number }; hits: number; d2: number } | null = null;
  for (const c of candidates) {
    const aim = raAimPoint(c.x, c.y);
    if (aim === null) continue;
    let hits = 0;
    for (let k = 0; k < RA_COLUMN_COUNT; k++) {
      const col = raStrikeColumnPos(seat, k, aim, charge);
      for (const t of targets) {
        const dx = t.x - col.x;
        const dy = t.y - col.y;
        if (dx * dx + dy * dy <= r2) hits++;
      }
    }
    const d2 = (aim.x - home.x) ** 2 + (aim.y - home.y) ** 2;
    // Strictly better only: an equal score keeps the EARLIER candidate unless it is nearer home.
    if (best === null || hits > best.hits || (hits === best.hits && d2 < best.d2)) {
      best = { aim, hits, d2 };
    }
  }
  if (best === null) return null;

  const endingSoon = world.phaseEndsAtTick - world.tick <= RA_RITUAL_TICKS + 2 * PHYSICS_HZ;
  if (best.hits < (endingSoon ? 1 : BOT_RA_MIN_HITS)) return null;
  return { type: 'CAST_POWER_OF_RA', playerId: seat, x: best.aim.x, y: best.aim.y };
}
