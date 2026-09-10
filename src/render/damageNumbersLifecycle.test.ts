/**
 * SPARK — S172 P5 (owner) — **EVERY HIT SHOWS, INCLUDING THE LAST ONE. AND HEALS SHOW IN GREEN.**
 *
 * > *"I don't think damage is shown on the last hit when a creature dies, but it should show. It
 * > should show every hit — every damage a creature takes, whether it's the last hit or the first
 * > hit, it doesn't matter. Always damage should be visible."*
 *
 * > *"when a creature gets healed — so for example Vlad does his life sap, or in the future we will
 * > have other healing effects — then the same number of how much he was healed for, near the
 * > creature that was healed, but in green with white outline."*
 *
 * ⚠ `DamageNumbers` constructs Pixi `Text`, which needs a canvas, so the behaviour is pinned two
 * ways: the pure `damageAnchor` is exercised directly, and the parts that live inside the class are
 * pinned as source-text assertions. That split is deliberate — the killing-blow defect was NOT
 * arithmetic, it was a code path that returned early, and only a structural assertion catches
 * someone deleting it again.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { asPlayerId, type CreatureId } from '../types.ts';
import { damageAnchor } from './damageNumbers.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const src = (): string => readFileSync(new URL('./damageNumbers.ts', import.meta.url), 'utf8');

function twoSeat(): World {
  const world = makeWorld(0);
  world.isHost = true;
  world.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  world.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  world.matchPhase = 'FIGHT';
  world.phaseEndsAtTick = world.tick + 1_000_000;
  return world;
}

let spawner = 7000;
function spawn(world: World, type: string, owner: ReturnType<typeof asPlayerId>, x: number, y = 500): CreatureId {
  dispatch(world, {
    type: 'SPAWN_CREATURE',
    creatureType: type as never,
    ownerPlayerId: owner,
    pos: { x, y },
    targetPos: { x, y },
    sourceSpawnerId: spawner++ as never,
  });
  let newest: CreatureId | null = null;
  for (const c of world.creatures.values()) {
    if (newest === null || (c.id as number) > (newest as number)) newest = c.id;
  }
  return newest!;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('S172 P5 — the KILLING BLOW is drawn, and it points the right way', () => {
  it('⭐⭐ THE OWNER RULING — the death path emits, it does not just clean up', () => {
    /*
     * The first version deleted the map entry and returned, because by the time a death is
     * observable the creature is gone from `world.creatures` and there was no position to anchor
     * to. That is the exact line the owner noticed was missing.
     */
    const s = src();
    expect(s, 'the death sweep must EMIT, not merely delete').toMatch(
      /if \(seen\.has\(id\)\) continue;[\s\S]{0,300}?this\.emit\(/,
    );
    expect(s, 'and it must carry the remembered position and owner').toMatch(
      /this\.emit\(world, id, last\.x, last\.y, last\.ehp, 'damage', last\.owner\)/,
    );
  });

  it('⭐⭐ POSITION AND OWNER ARE REMEMBERED — without them the fatal number cannot be placed', () => {
    // Both are unavailable once the creature leaves world.creatures, so the watcher has to carry
    // them forward. This is the whole reason the map holds a record and not just a number.
    expect(src()).toMatch(/interface Watched \{[\s\S]{0,200}?ehp: number;[\s\S]{0,200}?owner: PlayerId;/);
  });

  it('⛔ THE DEAD VICTIM MUST NOT POINT AT ITS OWN ALLY — the owner is passed, never looked up', () => {
    /*
     * ⛔ THIS IS THE SUBTLE ONE AND IT WOULD HAVE SHIPPED LOOKING FINE. `damageAnchor` normally
     * finds the owner via `world.creatures.get(victim)`. For a killing blow that lookup returns
     * undefined, so EVERY creature counts as "another owner" — including the victim's own
     * team-mates — and the fatal number would fly toward a friend standing nearby.
     *
     * Here: the victim (P0) died at 500 with a P0 ALLY right beside it at 510 and the real enemy
     * (P1) far away at 900. With the owner passed, the anchor must ignore the ally.
     */
    const world = twoSeat();
    spawn(world, 'goblinMelee', P0, 510, 500); // the surviving ally, very close
    spawn(world, 'goblinMelee', P1, 900, 500); // the actual killer, far off
    const deadId = 999_999 as unknown as CreatureId; // already removed from world.creatures

    const withOwner = damageAnchor(world, deadId, 500, 500, P0);
    expect(withOwner.x, 'points at the distant ENEMY, a quarter of 400 px').toBeCloseTo(600, 5);

    const withoutOwner = damageAnchor(world, deadId, 500, 500);
    expect(withoutOwner.x, 'CONTROL — with no owner it wrongly picks the nearby ally')
      .toBeCloseTo(502.5, 5);
    expect(withOwner.x, 'so the owner argument is doing real work').not.toBeCloseTo(withoutOwner.x, 1);
  });

  it('⭐ a live victim still resolves its own owner when none is passed', () => {
    const world = twoSeat();
    const victim = spawn(world, 'goblinMelee', P0, 500, 500);
    spawn(world, 'goblinMelee', P0, 510, 500);
    spawn(world, 'goblinMelee', P1, 900, 500);
    expect(damageAnchor(world, victim, 500, 500).x, 'ignores the ally without being told')
      .toBeCloseTo(600, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('S172 P5 — healing reads as healing', () => {
  it('⭐⭐ a RISE in ehp emits a heal, a DROP emits damage — both, from one comparison', () => {
    const s = src();
    expect(s, 'a drop is damage').toMatch(/delta > 0.*'damage'/);
    expect(s, 'a rise is a heal, and the sign is flipped so the number is positive')
      .toMatch(/delta < 0.*-delta.*'heal'/);
  });

  it('⭐ green fill, white outline — and the DAMAGE style is left exactly as he approved it', () => {
    /*
     * Owner on the shipped damage look: *"It looks sick. We made it really look good. I like that."*
     * ⚠ He then said *"red without white outline is the damage"*, which contradicts both the
     * shipped code he had just praised and his own earlier ruling. Treated as a slip: damage keeps
     * its white outline. Flagged to him rather than silently resolved either way.
     */
    const s = src();
    expect(s, 'damage stays red').toMatch(/fill: 0xe01b1b/);
    expect(s, 'healing is green').toMatch(/fill: 0x2fbf3f/);
    expect(
      (s.match(/stroke: \{ color: 0xffffff, width: 3, join: 'round' \}/g) ?? []).length,
      'BOTH styles carry the white outline',
    ).toBe(2);
  });

  it('⭐ the two styles differ ONLY in hue, so heals and hits stack against each other correctly', () => {
    // Same face, size and geometry means a heal landing in the same frame as a hit offsets by the
    // same row height instead of overlapping it.
    const s = src();
    expect((s.match(/fontSize: 20,/g) ?? []).length).toBe(2);
    expect((s.match(/fontStyle: 'italic',/g) ?? []).length).toBe(2);
    expect((s.match(/fontWeight: '900',/g) ?? []).length).toBe(2);
  });
});
