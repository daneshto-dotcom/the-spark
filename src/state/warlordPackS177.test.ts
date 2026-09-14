/**
 * SPARK — S177 P3 (owner) — THE WARLORD'S PACK: CAPPED AT THREE, REPLACED EVERY THIRTY SECONDS.
 *
 * Owner: *"There should be a maximum of three direwolves per world lord, and he spawns new ones every
 * thirty seconds. And the old ones die and despawn — no matter how much health they have left or how
 * many there are left of them, maybe one left, maybe none, maybe three still. They despawn and die
 * out, with the whole dying loop, and then new ones spawn. Kind of the same as we tweaked Pharaoh."*
 */
import { describe, expect, it } from 'vitest';
import {
  DIREWOLF_LIFETIME_TICKS,
  DIREWOLF_MAX_PER_OWNER,
  DIREWOLF_SUMMON_COUNT,
  DIREWOLF_SUMMON_INTERVAL_TICKS,
  PHARAOH_LOCUST_LAUNCH_INTERVAL_TICKS,
  PHYSICS_HZ,
} from '../constants.ts';
import { DIREWOLF_CONFIG } from './creatures/voltkin-config.ts';

describe('S177 P3 — his numbers, asserted', () => {
  it('a maximum of THREE per world lord', () => {
    // Was 6 — a ceiling the constant's own docblock called MINE. His number supersedes it.
    expect(DIREWOLF_MAX_PER_OWNER).toBe(3);
    // And the cap must not be below the summon size, or a pack could never arrive whole.
    expect(DIREWOLF_MAX_PER_OWNER).toBe(DIREWOLF_SUMMON_COUNT);
  });

  it('a new pack every THIRTY seconds', () => {
    expect(DIREWOLF_SUMMON_INTERVAL_TICKS).toBe(30 * PHYSICS_HZ); // was 15 s
  });

  it('⭐ THE OLD PACK DIES EXACTLY AS THE NEW ONE LANDS — one expression, so they cannot drift', () => {
    expect(DIREWOLF_LIFETIME_TICKS).toBe(DIREWOLF_SUMMON_INTERVAL_TICKS);
    expect(DIREWOLF_CONFIG.lifetimeTicks).toBe(DIREWOLF_LIFETIME_TICKS);
  });

  /**
   * ⛔ THE HALF THAT WOULD HAVE SHIPPED A NO-OP. `makeT3Config` sets `persistent: true`, and its own
   * comment says that is *"what keeps it alive"* past `lifetimeTicks`. A lifetime without clearing
   * persistence is a change that cannot possibly do anything — the exact defect S153 P1 shipped on
   * this same factory. This assertion is the guard against re-shipping it.
   */
  it('⛔ and it is NOT persistent, which is what makes the lifetime bite at all', () => {
    expect(DIREWOLF_CONFIG.persistent).toBe(false);
  });

  /**
   * ⭐ *"the whole dying loop"* — the wolf must walk through DESPAWNING (the `die` row) rather than
   * being deleted out from under the renderer. A non-zero despawning window is what buys that.
   */
  it('⭐ it despawns through the DIE row rather than vanishing', () => {
    expect(DIREWOLF_CONFIG.despawningTicks).toBeGreaterThan(0);
    expect(DIREWOLF_CONFIG.fadeTicks).toBeGreaterThan(0);
    expect(DIREWOLF_CONFIG.fadeTicks).toBeLessThanOrEqual(DIREWOLF_CONFIG.despawningTicks);
  });

  /**
   * ⭐ HE SAID IT IS THE SAME MECHANIC AS THE PHARAOH'S: *"pretty much the same mechanic, same
   * ability, just different stats and different looks."* Asserted, so the two cannot silently
   * diverge into two designs again.
   */
  it('⭐ it is the Pharaoh mechanic — same cadence, same expire-and-replace shape', () => {
    expect(DIREWOLF_SUMMON_INTERVAL_TICKS).toBe(PHARAOH_LOCUST_LAUNCH_INTERVAL_TICKS);
    expect(DIREWOLF_CONFIG.persistent).toBe(false);
  });
});
