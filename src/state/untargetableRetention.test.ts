/**
 * SPARK — S171 (owner R142, R121 and R171-A) — **THE GATES, ASSERTED AS GATES.**
 *
 * ## Why this file exists alongside `untargetableGates.test.ts`
 *
 * S169 built the condition and tested it. The S171 A.0 sweep then measured what that test actually
 * covers, and the answer was less than it reads: of its six tests, two exercise the chokepoint as a
 * gate, two test the helper in isolation, one asserts non-invulnerability, and **one is a
 * `readFileSync` substring check** — it asserts that `castleGuns.ts` and `defenderLifecycle.ts`
 * each CONTAIN the string `findNearestEnemyCreatureFrom`, which passes on a comment mentioning the
 * name and cannot see a second, ungated scan added to either file.
 *
 * Worse, that file's docblock records an audit which undercounted:
 *
 * > *"⚠ THE BYPASSES WERE AUDITED RATHER THAN ASSUMED. Three places iterate `world.creatures`
 * > directly: `underDroneCaps`, `recallArmies` and the boss-death bookkeeping in `hostTick`. None of
 * > them picks a victim, so none needs the gate."*
 *
 * Roughly forty production sites iterate `world.creatures`. The three named are correctly benign;
 * the audit missed the Kraken's aim pick, the Archdemon's teleport victim, the Voltkin chain hop,
 * the raid picker AND the authoritative raid reducer, the projectile renderer's own scan, and the
 * whole retention family. **The chokepoint's own docblock claims it "COVERS EVERY CREATURE-TARGETING
 * PATH IN THE GAME"; it covers six of thirteen.**
 *
 * ⛔ SO THE POINT OF THIS FILE IS THAT EVERY GATE IS DRIVEN, NOT GREPPED. Each test below spawns a
 * real untargetable unit into a real world and runs the real production entry point.
 *
 * ## The two sources of untargetability behave differently, and both are pinned here
 *
 *   · BY TYPE  — the locust cloud, untargetable from birth. Never acquired, so retention can never
 *                hold one.
 *   · BY STATE — the Pharaoh mid-ritual (R171-A: *"he's not really in the game"*). Acquired
 *                normally all fight, then phases out — so a STORED target must be re-validated.
 *
 * The second is the case `SPARK_RACES_SPEC.md:533` predicted in writing and which shipped
 * unactioned for two sessions: *"a defender that has ALREADY COMMITTED to a naga which then
 * submerges mid-windup."*
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { nearestEnemyFor } from './bossSkillsKraken.ts';
import { runArchdemonTeleport } from './bossSkillsArchdemon.ts';
import { resolveProjectileShot } from '../render/creatureProjectile.ts';
import { ARCHDEMON_TELEPORT_INTERVAL_TICKS } from '../constants.ts';
import { findNearestEnemyCreatureFrom } from './creatures/creatureAI.ts';
import { voltkinChainFrom } from './creatures/voltkinChain.ts';
import { CREATURE_CONFIGS, getCreatureConfig } from './creatures/voltkin-config.ts';
import { isChannellingRa, isUntargetable, type CreatureType } from './creatures/creature.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asPlayerId, type CreatureId } from '../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function twoSeat(): World {
  const world = makeWorld(0);
  world.isHost = true;
  world.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  world.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  world.matchPhase = 'FIGHT';
  world.phaseEndsAtTick = world.tick + 1_000_000;
  return world;
}

let spawner = 5000;
function spawn(world: World, type: string, owner: ReturnType<typeof asPlayerId>, x: number, y = 500): CreatureId {
  const before = world.creatures.size;
  dispatch(world, {
    type: 'SPAWN_CREATURE',
    creatureType: type as never,
    ownerPlayerId: owner,
    pos: { x, y },
    targetPos: { x, y },
    sourceSpawnerId: spawner++ as never,
  });
  if (world.creatures.size !== before + 1) throw new Error(`fixture: spawn of ${type} refused`);
  let newest: CreatureId | null = null;
  for (const c of world.creatures.values()) {
    if (newest === null || (c.id as number) > (newest as number)) newest = c.id;
  }
  return newest!;
}

/** Temporarily flag a TYPE untargetable — the locust-cloud shape, before that unit exists. */
function withUntargetable(type: CreatureType, fn: () => void): void {
  const cfg = CREATURE_CONFIGS[type] as { untargetable?: boolean };
  const had = cfg.untargetable;
  cfg.untargetable = true;
  try {
    fn();
  } finally {
    if (had === undefined) delete cfg.untargetable;
    else cfg.untargetable = had;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
describe('S171 R171-A — untargetability now has a STATE source, read in one place', () => {
  it('⭐⭐ a creature mid-Ra-ritual is untargetable WITHOUT its type being flagged', () => {
    const world = twoSeat();
    const id = spawn(world, 'goblinMelee', P1, 600);
    const c = world.creatures.get(id)!;

    expect(isUntargetable(c, world.tick), 'ordinarily targetable').toBe(false);

    c.raRitualUntilTick = world.tick + 600;
    expect(isChannellingRa(c, world.tick), 'the ritual read').toBe(true);
    expect(isUntargetable(c, world.tick), 'and it flows through the ONE targetability read').toBe(true);
  });

  it('⭐ STRICTLY `<`, matching isStunned — the deadline tick is the first targetable tick again', () => {
    const world = twoSeat();
    const c = world.creatures.get(spawn(world, 'goblinMelee', P1, 600))!;
    c.raRitualUntilTick = 100;

    expect(isUntargetable(c, 99), 'still channelling at 99').toBe(true);
    expect(isUntargetable(c, 100), 'back in the world exactly at the deadline').toBe(false);
  });

  it('⛔ and the ritual is NOT invulnerability by itself — that guard lives at damage/removal', () => {
    // Pinned so a future editor does not read `isUntargetable` as a damage shield and then wonder
    // why an area sweep still lands. Untargetable = cannot be SELECTED. The Pharaoh needs more than
    // this, and gets it separately.
    const world = twoSeat();
    const c = world.creatures.get(spawn(world, 'goblinMelee', P1, 600))!;
    const before = c.ehp;
    c.raRitualUntilTick = world.tick + 600;
    c.ehp -= 5; // any area sweep, applied directly as they all ultimately do
    expect(c.ehp).toBe(before - 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('S171 — every acquisition path refuses an untargetable unit (driven, not grepped)', () => {
  it('⭐ GATE 3 — the Kraken\'s sonar AIM pick skips it and aims at the next enemy', () => {
    const world = twoSeat();
    const bossId = spawn(world, 't9BossNagas', P0, 500);
    const boss = world.creatures.get(bossId)!;
    const near = spawn(world, 'chewer', P1, 560);
    const far = spawn(world, 'goblinMelee', P1, 640);

    expect(nearestEnemyFor(world, boss, 1e9)?.id, 'control: the near one').toBe(near);
    withUntargetable('chewer', () => {
      expect(
        nearestEnemyFor(world, boss, 1e9)?.id,
        'a locust cloud must not be able to swing the whole wave axis',
      ).toBe(far);
    });
  });

  it('⭐ GATE 3 — and the Kraken refuses a ritual-phased boss as an aim point (STATE source)', () => {
    const world = twoSeat();
    const boss = world.creatures.get(spawn(world, 't9BossNagas', P0, 500))!;
    const victim = world.creatures.get(spawn(world, 't9BossMummies', P1, 560))!;
    const fallback = spawn(world, 'goblinMelee', P1, 640);

    expect(nearestEnemyFor(world, boss, 1e9)?.id, 'control').toBe(victim.id);
    victim.raRitualUntilTick = world.tick + 600;
    expect(nearestEnemyFor(world, boss, 1e9)?.id, 'between realities — not an aim point').toBe(fallback);
  });

  it('⭐ GATE 5 — the Voltkin chain HOPS PAST an untargetable unit', () => {
    const world = twoSeat();
    const attacker = world.creatures.get(spawn(world, 'voltkin', P0, 500))!;
    const seedId = spawn(world, 'goblinMelee', P1, 520);
    const seed = world.creatures.get(seedId)!;
    const ghost = spawn(world, 'chewer', P1, 528);
    const nextHop = spawn(world, 'goblinMelee', P1, 536);

    const link = { kind: 'creature' as const, id: seedId, pos: { x: seed.pos.x, y: seed.pos.y } };

    const control = voltkinChainFrom(world, attacker, link)
      .filter((l) => l.kind === 'creature').map((l) => l.id);
    expect(control, 'control: the chain reaches the chewer').toContain(ghost);

    withUntargetable('chewer', () => {
      const hops = voltkinChainFrom(world, attacker, link)
        .filter((l) => l.kind === 'creature').map((l) => l.id);
      expect(hops, 'the arc must not choose an untargetable unit').not.toContain(ghost);
      expect(hops, 'and it hops on past to a real one').toContain(nextHop);
    });
  });

  it('⭐⭐ GATE 1 — the AUTHORITATIVE raid reducer refuses, AND DOES NOT SPEND THE POINT', () => {
    /*
     * ⛔ THE SITE THE CARRIED BYPASS LIST NEVER NAMED. The input picker in `input/controls.ts` only
     * decides what the cursor aims at; THIS reducer spends the raid point and deals the damage, and
     * a replayed or hand-built action reaches it without touching the input layer at all. Gating the
     * picker alone would have LOOKED like a fix.
     *
     * The second assertion is the one that matters most: the reducer documents "paid but got nothing
     * must be unrepresentable", so a refusal placed after the decrement would charge for a raid that
     * never landed.
     */
    const world = twoSeat();
    const victim = spawn(world, 'chewer', P1, 600);
    const raider = world.players.get(P0)!;
    raider.raidPoints = 3;
    const ehpBefore = world.creatures.get(victim)!.ehp;

    withUntargetable('chewer', () => {
      dispatch(world, { type: 'RAID_TARGET', target: { kind: 'creature', id: victim }, playerId: P0 });
      expect(world.creatures.get(victim)!.ehp, 'took no damage').toBe(ehpBefore);
      expect(raider.raidPoints, '⛔ and was NOT charged — atomicity holds').toBe(3);
    });

    // CONTROL — the very same raid lands once the flag is gone, so the test cannot pass vacuously.
    // ⚠ A chewer DIES to one raid (R78's published kill table puts it at 1), so the landed raid is
    // asserted as a REMOVAL, not as a reduced pool. Written this way because the first draft checked
    // `.ehp` and threw on an undefined corpse — the control was working and the assertion was wrong.
    dispatch(world, { type: 'RAID_TARGET', target: { kind: 'creature', id: victim }, playerId: P0 });
    expect(world.creatures.has(victim), 'control: an ordinary raid still lands, and kills a chewer').toBe(false);
    expect(raider.raidPoints, 'and IS charged for the one that landed').toBe(2);
  });

  it('⭐ GATE 1 — the raid also refuses a ritual-phased Pharaoh (the STATE source, end to end)', () => {
    const world = twoSeat();
    const pharaoh = spawn(world, 't9BossMummies', P1, 600);
    const raider = world.players.get(P0)!;
    raider.raidPoints = 2;
    const c = world.creatures.get(pharaoh)!;
    c.raRitualUntilTick = world.tick + 600;
    const ehpBefore = c.ehp;

    dispatch(world, { type: 'RAID_TARGET', target: { kind: 'creature', id: pharaoh }, playerId: P0 });
    expect(world.creatures.get(pharaoh)!.ehp, 'you cannot raid what is between realities').toBe(ehpBefore);
    expect(raider.raidPoints, 'and you are not charged for trying').toBe(2);
  });

  it('⭐ the shared chokepoint refuses the STATE source too, so all six of its inheritors do', () => {
    // castle guns, all three defender kinds, creature-vs-creature and the gatherer preview all
    // funnel through this one function — driving it once is driving them all.
    const world = twoSeat();
    const victim = world.creatures.get(spawn(world, 'goblinMelee', P1, 560))!;
    const other = spawn(world, 'goblinMelee', P1, 700);

    expect(findNearestEnemyCreatureFrom(world, { x: 500, y: 500 }, P0)).toBe(victim.id);
    victim.raRitualUntilTick = world.tick + 600;
    expect(findNearestEnemyCreatureFrom(world, { x: 500, y: 500 }, P0)).toBe(other);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('S171 — the two gates that are easy to forget: a boss REPOSITION and a RENDERER', () => {
  /** Advance to the next tick on which this demon's phase-spread cadence fires, then run it. */
  function fireTeleport(world: World, demonId: CreatureId): void {
    for (let i = 0; i < ARCHDEMON_TELEPORT_INTERVAL_TICKS + 2; i++) {
      world.tick++;
      if ((world.tick + (demonId as number)) % ARCHDEMON_TELEPORT_INTERVAL_TICKS === 0) {
        runArchdemonTeleport(world);
        return;
      }
    }
    throw new Error('fixture: the teleport cadence never fired');
  }

  it('⭐ GATE 4 — the Archdemon does not TELEPORT ONTO an untargetable unit', () => {
    /*
     * Worth its own test because it is not a strike: nothing takes damage, so a missing gate here
     * costs no HP and shows up only as a boss inexplicably relocating onto a locust cloud. A
     * repositioning skill that picks a victim is still an acquisition.
     */
    const world = twoSeat();
    const demonId = spawn(world, 't9BossDemons', P0, 500);
    const lonelyGhost = spawn(world, 'chewer', P1, 900, 900);   // very lonely — the preferred pick
    const crowd = spawn(world, 'goblinMelee', P1, 560);
    spawn(world, 'goblinMelee', P1, 566);                        // gives `crowd` an ally, so it is worse
    void crowd;

    withUntargetable('chewer', () => {
      fireTeleport(world, demonId);
      const demon = world.creatures.get(demonId)!;
      const ghost = world.creatures.get(lonelyGhost)!;
      const dx = demon.pos.x - ghost.pos.x;
      const dy = demon.pos.y - ghost.pos.y;
      expect(
        Math.sqrt(dx * dx + dy * dy),
        'he must not have jumped to the untargetable unit, however lonely it is',
      ).toBeGreaterThan(100);
    });
  });

  it('⭐ GATE 6 — the projectile renderer does not AIM AN ARROW at an untargetable unit', () => {
    /*
     * A renderer-only leak, and the reason it matters is FOG rather than damage: an arrow leaning
     * toward a locust cloud advertises a target the sim will never shoot at.
     */
    const world = twoSeat();
    const archerId = spawn(world, 'goblinArcher', P0, 500);
    const archer = world.creatures.get(archerId)!;
    spawn(world, 'chewer', P1, 520);

    /*
     * ⚠ THE FIXTURE HAS TO PUT HIM MID-SHOT. `resolveProjectileShot` returns null unless the archer
     * is ATTACKING and `ticksInState` sits inside the arrow's flight window
     * (`attackFireTick - ARROW_FLIGHT_TICKS .. attackFireTick`) — a freshly spawned creature is
     * SEEKING and draws nothing. The first draft omitted this and the CONTROL arm failed, which is
     * the fixture being wrong rather than the gate: worth recording, because a control that fails
     * for the same reason the assertion would have is how a vacuous test gets written.
     */
    archer.state = 'ATTACKING';
    archer.ticksInState = getCreatureConfig('goblinArcher').attackFireTick;

    const control = resolveProjectileShot(world, archer);
    expect(control, 'control: it aims at the chewer').not.toBeNull();

    withUntargetable('chewer', () => {
      const shot = resolveProjectileShot(world, archer);
      // Either it draws nothing, or it has fallen through to a structure — what it must NOT do is
      // point at the cloud. With no other enemy and no committed shape, the honest answer is null.
      expect(shot, 'no arrow may be drawn at an untargetable unit').toBeNull();
    });
  });
});
