/**
 * SPARK — S181: **THE FLOATER IS THE SWING, NOT WHAT WAS LEFT TO TAKE.**
 *
 * Owner, S181 playtest, twice — first on the keep:
 *
 * > *"it says that it hits 40 per shot, but it only does 6 damage. I saw it hit a monster and just a
 * > regular castle spawn, and it only did 6 damage to him … oh yeah, it is, because now I saw it hit
 * > the zombie hound for 10 because that's his total HP, so it only shows the maximum. We need to
 * > show the ACTUAL damage being taken. And if it's over his total health amount, that's fine. He
 * > just dies. It shouldn't be capped at his health."*
 *
 * and then on creatures, so it could not be dismissed as a castle quirk:
 *
 * > *"my soul eaters are fighting the zombie. Soul eater supposed to do fourteen a swing … but
 * > they're only doing like six. It's the same issue … it's capped when buildings are targeted and
 * > the same when creatures are targeted."*
 *
 * ⛔ WHY IT WAS CAPPED, AND WHY IT WAS DELIBERATE. A creature leaves `world.creatures` on the same
 * tick its pool empties, so the fatal blow is never visible as a diff. S172 printed the remainder
 * and recorded the trade: *"the numbers over a creature's whole life now sum to precisely its
 * pool."* That summing property is what he has overruled.
 *
 * THE FIX IS TWO SOURCES, BEST FIRST — the exact swing recorded at the damage site, and a reach
 * derivation for the peer that has no record. Both are asserted here.
 */
import { describe, expect, it } from 'vitest';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { asPlayerId } from '../types.ts';
import { fatalBlowFifths } from './damageNumbers.ts';
import { attackFifths } from '../state/stats.ts';
import { castleShotFifths } from '../state/castleGuns.ts';
import { castleShotFifthsFor } from '../state/castleUpgrades.ts';
import { getCreatureConfig } from '../state/creatures/voltkin-config.ts';
import { CASTLE_ATTACK_RANGE, CASTLE_MAX_HP } from '../constants.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';

const P = (n: number) => asPlayerId(n);

/** A board with two seats, both keeps alive. */
function board(): World {
  // START_GAME is what MINTS the seats — `makeWorld` alone has none, so the castle arm of
  // `fatalBlowFifths` had nothing to iterate. Mirrors `castleGuns.test.ts`'s own fightWorld.
  const w = makeWorld(0xca57);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.creatures.clear();
  for (const p of w.players.values()) p.castleHp = CASTLE_MAX_HP;
  return w;
}

/** Drop a creature of `type` owned by `seat` at (x, y), bypassing spawn rules. */
function put(w: World, type: string, seat: number, x: number, y: number): void {
  const id = (w.creatures.size + 1) as never;
  w.creatures.set(id, {
    id,
    type: type as never,
    ownerPlayerId: P(seat),
    pos: { x, y },
    ehp: 999,
  } as never);
}

describe('S181 — fatalBlowFifths derives the real blow from reach', () => {
  it('returns null when nothing hostile is anywhere near — the aura / blast / scrap case', () => {
    const w = board();
    // ⚠ The fallback matters: a death with no attacker in reach must still print SOMETHING, and the
    // caller falls back to the remainder. Returning 0 here instead of null would print "0".
    expect(fatalBlowFifths(w, { x: 900, y: 900 }, P(0))).toBeNull();
  });

  it("⭐ HIS CREATURE CASE: an enemy in reach yields ITS swing, not the victim's remaining pool", () => {
    const w = board();
    const cfg = getCreatureConfig('goblinMelee');
    put(w, 'goblinMelee', 1, 500, 500);
    const got = fatalBlowFifths(w, { x: 500, y: 500 }, P(0));
    expect(got).toBe(attackFifths(cfg.atk, cfg.pen));
    // ⛔ and that is strictly MORE than a one-HP victim could ever have absorbed, which is the
    // whole point: the number is no longer bounded by the target.
    expect(got).toBeGreaterThan(1);
  });

  it('ignores an attacker that is out of its own reach', () => {
    const w = board();
    put(w, 'goblinMelee', 1, 500, 500);
    // A melee goblin's reach is 35px; 400px away it cannot have landed the blow.
    expect(fatalBlowFifths(w, { x: 900, y: 500 }, P(0))).toBeNull();
  });

  it('⛔ NEVER credits a FRIENDLY unit standing on the corpse', () => {
    const w = board();
    put(w, 'goblinMelee', 0, 500, 500); // same owner as the victim
    expect(fatalBlowFifths(w, { x: 500, y: 500 }, P(0))).toBeNull();
  });

  it('takes the LARGEST swing in reach, never a sum — a creature dies to ONE blow', () => {
    const w = board();
    put(w, 'goblinMelee', 1, 500, 500);
    put(w, 'goblinShield', 1, 500, 500);
    const melee = getCreatureConfig('goblinMelee');
    const shield = getCreatureConfig('goblinShield');
    const biggest = Math.max(
      attackFifths(melee.atk, melee.pen),
      attackFifths(shield.atk, shield.pen),
    );
    const got = fatalBlowFifths(w, { x: 500, y: 500 }, P(0));
    expect(got).toBe(biggest);
    // A sum would invent damage that was never dealt.
    expect(got).toBeLessThan(
      attackFifths(melee.atk, melee.pen) + attackFifths(shield.atk, shield.pen),
    );
  });

  it("⭐⭐ HIS CASTLE CASE: a keep that FIRED this tick prints its own shot, which is 40", () => {
    const w = board();
    const anchor = castleAnchor(1, w.layout);
    // Wind the tick to one where seat 1's gun actually fires — the schedule is a pure function of
    // (seat, tick), which is exactly why a renderer may re-derive the shot with no wire field.
    for (let i = 0; i < 600; i++) {
      const got = fatalBlowFifths(w, { x: anchor.x, y: anchor.y }, P(0));
      if (got !== null) {
        expect(got).toBe(castleShotFifths());
        expect(got).toBe(40); // the shipped number he read off the card
        return;
      }
      w.tick++;
    }
    throw new Error('seat 1 never fired in 600 ticks — castleFiresOnTick changed shape');
  });

  it('⭐ S188 P3 — a keep that BOUGHT ATK and PEN prints its UPGRADED shot, not the base 40', () => {
    const w = board();
    const seat1 = w.players.get(P(1))!;
    seat1.castleUpgrades = { hpLevel: 0, hpBonus: 0, atkLevel: 1, defLevel: 0, penLevel: 2 };
    const anchor = castleAnchor(1, w.layout);
    for (let i = 0; i < 600; i++) {
      const got = fatalBlowFifths(w, { x: anchor.x, y: anchor.y }, P(0));
      if (got !== null) {
        // the number castleGunsTick actually deals: 6 × (5 + 5) = 60
        expect(got).toBe(castleShotFifthsFor(seat1.castleUpgrades));
        expect(got).toBe(attackFifths(6, 5));
        expect(got).not.toBe(castleShotFifths());
        return;
      }
      w.tick++;
    }
    throw new Error('seat 1 never fired in 600 ticks — castleFiresOnTick changed shape');
  });

  it('⛔ a keep does NOT claim a kill on a tick it did not fire', () => {
    const w = board();
    const anchor = castleAnchor(1, w.layout);
    let quiet = 0;
    for (let i = 0; i < 600; i++) {
      if (fatalBlowFifths(w, { x: anchor.x, y: anchor.y }, P(0)) === null) quiet++;
      w.tick++;
    }
    // Without the firing gate EVERY death near a keep would print 40. Most ticks must be silent.
    expect(quiet).toBeGreaterThan(300);
  });

  it('a keep out of range never claims the kill', () => {
    const w = board();
    const anchor = castleAnchor(1, w.layout);
    for (let i = 0; i < 300; i++) {
      const far = { x: anchor.x + CASTLE_ATTACK_RANGE * 4, y: anchor.y };
      expect(fatalBlowFifths(w, far, P(0))).toBeNull();
      w.tick++;
    }
  });

  it('an eliminated keep cannot claim a kill', () => {
    const w = board();
    const p = w.players.get(P(1));
    if (p !== undefined) p.castleHp = 0;
    const anchor = castleAnchor(1, w.layout);
    for (let i = 0; i < 300; i++) {
      expect(fatalBlowFifths(w, { x: anchor.x, y: anchor.y }, P(0))).toBeNull();
      w.tick++;
    }
  });
});

describe('S181 — the exact swing is RECORDED at the damage site, which is the only place that knows', () => {
  const src = (): string => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    return readFileSync('src/state/creatures/creatureLifecycle.ts', 'utf-8');
  };

  it('damageCreature pushes the full amount when the pool empties', () => {
    // ⛔ The overkill is discarded on the `c.ehp -= amountFifths` line. If this push is ever removed
    // the renderer silently falls back to the reach derivation, which is good but approximate — so
    // this assertion is what keeps the EXACT path alive.
    expect(src()).toMatch(/world\.creatureKillHits\.push\(\{[\s\S]{0,200}?amount: amountFifths/);
  });

  it('⚠ it records BEFORE any branch that can restore ehp and return without a death', () => {
    // The channelling-Pharaoh branch sets `ehp = 1` and returns. The blow WAS dealt and must print,
    // exactly as it would on any other creature that survived it.
    const s = src();
    const push = s.indexOf('world.creatureKillHits.push(');
    const restore = s.indexOf('c.ehp = 1;');
    expect(push).toBeGreaterThan(-1);
    expect(restore).toBeGreaterThan(-1);
    expect(push).toBeLessThan(restore);
  });

  it('the channel is per-frame and wiped everywhere connectorBreakHits is', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    for (const f of ['src/state/gameMode.ts', 'src/state/gameState.ts', 'src/state/save.ts']) {
      const t = readFileSync(f, 'utf-8');
      expect(t.includes('world.creatureKillHits.length = 0'), `${f} must wipe it`).toBe(true);
    }
  });
});
