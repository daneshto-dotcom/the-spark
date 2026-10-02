/**
 * SPARK — ⭐ S193 (owner R193-AI) — BOT PERSONALITIES: the table, the brain, and the MEASURED signature.
 *
 * Owner: *"not just smarter, but um, make them different … five personalities, and then per level."*
 * Spec: `S193_BOTS_SPEC.md`. Three layers of evidence, deliberately:
 *   1. IDENTITY — BALANCED below IMBA is the pre-S193 bot byte for byte, pinned by hashes measured on
 *      master a638565b BEFORE any bot code changed (a pin taken after would only prove self-consistency).
 *   2. UNIT — the knob table obeys its two rules (no capability crosses a tier; raids untouched), and each
 *      new brain function does what it says, with a negative case each.
 *   3. REACH — real four-seat bot-vs-bot matches on the real frame lifecycle (`runHostTick` → matcher →
 *      effects wipe), asserting each personality's SIGNATURE (first tower, tower mix, defence ratio, units
 *      fed, loose tempo) differs as designed and that a seed replays to the same hash. The assertions are
 *      pinned to what was MEASURED (the numbers are in the comments), never to what was hoped.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { PLAYER_COLORS, SparkType } from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { mulberry32 } from '../state/rng.ts';
import { snapshot } from '../state/save.ts';
import { makeWorkerSim } from '../state/workerSim.ts';
import { bankAdd, bankCountOf } from '../state/castleBank.ts';
import { blueprintBill } from '../state/blueprints.ts';
import { runGodlyMatcherCore } from '../state/godlyMatcherCore.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { asPlayerId, type PlayerId } from '../types.ts';
import { BOT_CONFIGS, botConfigFor, type BotConfig } from './botConfig.ts';
import {
  SAVE_HOLD_TICKS,
  chooseFeed,
  chooseTargetBlueprint,
  chooseTowerPlan,
  leaderTargetSeat,
  personaRungs,
  raidTargetSeat,
  seatTowerRungs,
} from './botBrain.ts';
import { BotManager } from './botManager.ts';
import {
  IDENTITY_KNOBS,
  IMBA_ADAPT_WINDOW_TICKS,
  personalityKnobs,
  towerRoleOf,
} from './botPersonality.ts';
import {
  runFrameMatchWithManager,
  runIdentityArm,
  runLockMatch,
  runManagerMatch,
  runSignatureMatch,
  type MatchSignature,
  type SeatSignature,
} from './botPersonality.fixtures.ts';
import {
  BOT_DIFFICULTIES,
  BOT_PERSONALITIES,
  BOT_PERSONALITY_CHOICES,
  BOT_PERSONALITY_LOCKED_TAGLINE,
  BOT_PERSONALITY_TAGLINES,
  BOT_TAGLINE_MAX_CHARS,
  resolvePersonality,
  type BotDifficulty,
  type BotPersonality,
} from './botTypes.ts';

const BOT = asPlayerId(1);

/*
 * ⚠ YIELD A MACROTASK AFTER EVERY TEST. Each match here is a few seconds of pure synchronous sim, and
 * vitest runs consecutive tests without returning to the event loop — so the worker could not service
 * its own `onTaskUpdate` RPC replies, and after ~60 s of back-to-back matches the run failed with an
 * unhandled "Timeout calling onTaskUpdate" while every test was green (measured: 55/55 passed, exit 1).
 */
afterEach(async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
});

function botsWorld(): World {
  const w = makeWorld(0xb07);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: 'bots',
    isHost: true,
    roster: [0, 1, 2].map((s) => ({ seat: s, color: PLAYER_COLORS[s] })),
    botSeats: [1, 2],
  });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  return w;
}

function bankTheBill(w: World, seat: PlayerId, id: GodlyId): void {
  for (const [type, n] of blueprintBill(id)) for (let i = 0; i < n; i++) bankAdd(w.castleBanks, seat, type);
}

/** Really stamp and IGNITE `id` for `seat` (the matcher is what turns a stamp into a spawner). */
function raiseTower(w: World, seat: PlayerId, id: GodlyId, cfg: BotConfig): void {
  bankTheBill(w, seat, id);
  const plan = chooseTowerPlan(w, seat, { ...cfg, persona: { ...IDENTITY_KNOBS, towerOrder: [towerRoleOf(id)!] } });
  expect(plan?.blueprintId, `a legal site for ${id}`).toBe(id);
  dispatch(w, { type: 'BUILD_BLUEPRINT', playerId: seat, blueprintId: id, centre: plan!.centre });
  runGodlyMatcherCore(w, { lastMatcherTick: -1 });
  w.effects.length = 0;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S193 — IDENTITY: BALANCED below IMBA is the pre-personality bot, byte for byte', () => {
  /*
   * ⭐ S193 audit MED-1 — A DIFFERENTIAL, NOT AN ABSOLUTE PIN. The first version pinned two hashes measured
   * on master a638565b; one merge later (deploy #20, endgame) they were stale, though BALANCED had not
   * changed — every unrelated sim change moves an absolute hash. The auditor re-derived identity on the
   * merged tree four ways (master == merged bare == merged BALANCED); this asserts the same relation on
   * whatever tree it runs on: the bare tier config (no persona read anywhere) vs the lobby's BALANCED,
   * same seed, real frame lifecycle (towers ignite and feed), 300 s. No absolute pin is kept: none can be
   * justified that would not go red on the next unrelated merge.
   */
  const CELLS: ReadonlyArray<readonly BotDifficulty[]> = [
    ['NOOB', 'MID', 'HARD'],
    ['HARD', 'MID', 'HARD'],
    ['MID', 'MID', 'MID'],
    ['HARD', 'HARD', 'HARD'],
  ];
  for (const cell of CELLS) {
    it(`${cell.join('/')}: stripped (no persona) === explicit BALANCED`, () => {
      expect(runIdentityArm(cell, 300, 'balanced')).toBe(runIdentityArm(cell, 300, 'stripped'));
    }, 60_000);
  }

  it('the older harness agrees: a bare BotManager === explicit BALANCED', () => {
    expect(runManagerMatch(['NOOB', 'MID', 'HARD'], 200, ['BALANCED', 'BALANCED', 'BALANCED']))
      .toBe(runManagerMatch(['NOOB', 'MID', 'HARD'], 200));
  });

  it('⚠ NEGATIVE: the differential is not vacuous — IMBA BALANCED carries Q4/Q6, so it differs', () => {
    expect(runIdentityArm(['IMBA', 'IMBA', 'IMBA'], 300, 'balanced'))
      .not.toBe(runIdentityArm(['IMBA', 'IMBA', 'IMBA'], 300, 'stripped'));
  }, 60_000);

  it('⚠ NEGATIVE: a non-BALANCED lobby differs from the bare manager', () => {
    expect(runManagerMatch(['HARD', 'MID', 'HARD'], 200, ['FORTRESS', 'BALANCED', 'WARMONGER']))
      .not.toBe(runManagerMatch(['HARD', 'MID', 'HARD'], 200));
  }, 60_000);

  it('BALANCED NOOB/MID/HARD carry the identity knobs and the tier row untouched', () => {
    expect(IDENTITY_KNOBS.saveHoldTicks).toBe(SAVE_HOLD_TICKS);
    for (const tier of ['NOOB', 'MID', 'HARD'] as const) {
      const { persona, ...rest } = botConfigFor(tier, 'BALANCED');
      expect(rest).toEqual(BOT_CONFIGS[tier]);
      expect({ ...persona, personality: 'BALANCED' }).toEqual(IDENTITY_KNOBS);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S193 — the knob table obeys its two rules', () => {
  /** Every tier field EXCEPT the one a personality may move (loose-build tempo). */
  const TIER_OWNED = (Object.keys(BOT_CONFIGS.HARD) as Array<keyof BotConfig>).filter(
    (k) => k !== 'buildCooldownTicks',
  );

  it('⛔ a personality never moves a tier field — capability, skill, or raid rate (§10 Q1/Q2)', () => {
    for (const tier of BOT_DIFFICULTIES) {
      for (const p of BOT_PERSONALITIES) {
        const cfg = botConfigFor(tier, p);
        for (const k of TIER_OWNED) expect(cfg[k], `${tier}×${p}.${String(k)}`).toEqual(BOT_CONFIGS[tier][k]);
      }
    }
    // Q2 by name, because it is the ruling most likely to be "tuned" by a later session.
    for (const p of BOT_PERSONALITIES) expect(botConfigFor('IMBA', p).severChance).toBe(BOT_CONFIGS.IMBA.severChance);
  });

  it('loose-build tempo stays whole ticks', () => {
    for (const tier of BOT_DIFFICULTIES) for (const p of BOT_PERSONALITIES) {
      expect(Number.isInteger(botConfigFor(tier, p).buildCooldownTicks)).toBe(true);
    }
  });

  it('⛔ NOOB is locked to BALANCED (Council S193, Gemini M3)', () => {
    for (const p of BOT_PERSONALITIES) {
      expect(personalityKnobs(p, 'NOOB')).toEqual({ ...IDENTITY_KNOBS, personality: 'BALANCED' });
    }
  });

  it('⭐ the IMBA floor: every IMBA personality targets the goblin tower first and feeds (§10 Q4)', () => {
    const w = botsWorld();
    for (const p of BOT_PERSONALITIES) {
      const cfg = botConfigFor('IMBA', p);
      expect(chooseTargetBlueprint(w, BOT, cfg), `IMBA ${p}`).toBe('goblinTower');
      expect(cfg.persona!.feed, `IMBA ${p}`).not.toBe('never');
      expect(cfg.persona!.adaptsAtBell, `IMBA ${p} adapts (Q6)`).toBe(true);
    }
    // ⚠ NEGATIVE: HARD waits (Q6) — no HARD personality adapts.
    for (const p of BOT_PERSONALITIES) expect(botConfigFor('HARD', p).persona!.adaptsAtBell).toBe(false);
  });

  it('a personality re-orders the tier set, never widens it', () => {
    const w = botsWorld();
    for (const tier of ['MID', 'HARD', 'IMBA'] as const) {
      const set = new Set(seatTowerRungs(w, BOT).slice(0, BOT_CONFIGS[tier].towerTiers));
      for (const p of BOT_PERSONALITIES) {
        const ordered = personaRungs(w, BOT, botConfigFor(tier, p));
        expect(new Set(ordered), `${tier}×${p}`).toEqual(set);
      }
    }
  });

  it('opening targets per personality at HARD are the designed ones', () => {
    const w = botsWorld();
    const first = (p: BotPersonality): GodlyId | null => chooseTargetBlueprint(w, BOT, botConfigFor('HARD', p));
    expect(first('BALANCED')).toBe(seatTowerRungs(w, BOT)[0]); // cheapest — the race tower
    expect(first('WARMONGER')).toBe('goblinTower');
    expect(first('FORTRESS')).toBe('stinkTower');
    expect(first('SABOTEUR')).toBe('pentagram');
    expect(first('TYCOON')).toBe(seatTowerRungs(w, BOT)[0]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S193 — RANDOM resolves from (seed, seat), never the bot stream', () => {
  it('pass-through, deterministic, never RANDOM, and covers all five', () => {
    for (const p of BOT_PERSONALITIES) expect(resolvePersonality(p, 123, 1)).toBe(p);
    const seen = new Set<BotPersonality>();
    for (let seed = 0; seed < 400; seed++) for (let seat = 1; seat <= 3; seat++) {
      const a = resolvePersonality('RANDOM', seed, seat);
      expect(resolvePersonality('RANDOM', seed, seat)).toBe(a);
      seen.add(a);
    }
    expect(seen).toEqual(new Set(BOT_PERSONALITIES));
    expect(BOT_PERSONALITY_CHOICES).toContain('RANDOM');
  });

  it('the BotManager resolves RANDOM the same way twice (host and worker build from the same inputs)', () => {
    const a = new BotManager(['HARD', 'IMBA', 'MID'], 0x5eed, ['RANDOM', 'RANDOM', 'RANDOM']).personalities();
    const b = new BotManager(['HARD', 'IMBA', 'MID'], 0x5eed, ['RANDOM', 'RANDOM', 'RANDOM']).personalities();
    expect(a).toEqual(b);
    for (const s of a) expect(BOT_PERSONALITIES).toContain(s.personality);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S193 — the new brain functions, each with its negative', () => {
  it('leaderTargetSeat: the top enemy; null on a flat board', () => {
    const w = botsWorld();
    expect(leaderTargetSeat(w, BOT)).toBeNull(); // 0–0–0
    w.scoreByPlayer.set(asPlayerId(0), 40);
    w.scoreByPlayer.set(asPlayerId(2), 10);
    w.scoreByPlayer.set(BOT, 20);
    expect(leaderTargetSeat(w, BOT)).toBe(asPlayerId(0));
    // With the bot at the BOTTOM the two rules diverge: one rung up is seat 2 (10), the leader seat 0 (40).
    w.scoreByPlayer.set(BOT, 5);
    expect(raidTargetSeat(w, BOT, botConfigFor('HARD', 'BALANCED'))).toBe(asPlayerId(2)); // one rung up
    expect(raidTargetSeat(w, BOT, botConfigFor('HARD', 'SABOTEUR'))).toBe(asPlayerId(0)); // the leader
  });

  it('chooseFeed: never ⇒ null; leftovers reserve the target bill; eager in FIGHT feeds it all', () => {
    const w = botsWorld();
    raiseTower(w, BOT, 'goblinTower', BOT_CONFIGS.IMBA);
    const goblin = [...w.creatureSpawners.values()].find((s) => s.ownerPlayerId === BOT && s.recipeId === 'goblinTower');
    expect(goblin, 'the stamped goblin tower IGNITED').toBeDefined();

    // HARD SABOTEUR's target is the pentagram; bank exactly its bill, and with `leftovers` NOTHING is spare.
    const saboteur = botConfigFor('HARD', 'SABOTEUR');
    const target = chooseTargetBlueprint(w, BOT, saboteur)!;
    expect(target).toBe('pentagram');
    bankTheBill(w, BOT, target);
    expect(chooseFeed(w, BOT, saboteur), 'the whole bank is the next bill').toBeNull();
    // ⚠ NEGATIVE: BALANCED HARD never feeds, whatever it holds.
    expect(chooseFeed(w, BOT, botConfigFor('HARD', 'BALANCED'))).toBeNull();

    // One shape BEYOND the bill is a leftover, and it is fed to the goblin tower.
    bankAdd(w.castleBanks, BOT, SparkType.Dot);
    const pick = chooseFeed(w, BOT, saboteur);
    expect(pick).toEqual({ spawnerId: goblin!.id, sparkType: SparkType.Dot });

    // EAGER in FIGHT reserves nothing: with the Dot removed, the bill itself is fed.
    dispatch(w, { type: 'FEED_TOWER', playerId: BOT, spawnerId: goblin!.id, sparkType: SparkType.Dot });
    expect(bankCountOf(w.castleBanks, BOT, SparkType.Dot)).toBe(0);
    const warmonger = botConfigFor('HARD', 'WARMONGER');
    w.matchPhase = 'FIGHT';
    expect(chooseFeed(w, BOT, warmonger)).not.toBeNull();
  });

  it('Q6: IMBA substitutes an affordable rung only inside the bell window; HARD keeps waiting', () => {
    const w = botsWorld();
    raiseTower(w, BOT, 'goblinTower', BOT_CONFIGS.IMBA);
    // Target is now the race tower (cheapest unowned after the goblin, Q4 order). Make it unaffordable and
    // the stink tower affordable; a stamped seat with an unaffordable target SAVES — except at the bell.
    const imba = botConfigFor('IMBA', 'BALANCED');
    const target = chooseTargetBlueprint(w, BOT, imba)!;
    expect(target).not.toBe('stinkTower');
    bankTheBill(w, BOT, 'stinkTower');
    w.phaseEndsAtTick = w.tick + IMBA_ADAPT_WINDOW_TICKS + 60;
    expect(chooseTowerPlan(w, BOT, imba), 'outside the window: save').toBeNull();
    w.phaseEndsAtTick = w.tick + IMBA_ADAPT_WINDOW_TICKS;
    expect(chooseTowerPlan(w, BOT, imba)?.blueprintId, 'inside the window: adapt').toBe('stinkTower');
    // ⚠ NEGATIVE: HARD waits, at the bell too.
    expect(chooseTowerPlan(w, BOT, botConfigFor('HARD', 'BALANCED'))).toBeNull();
  });

  it('⭐ S194 substitute "listed": at the bell IMBA FORTRESS saves rather than raise an unlisted race tower', () => {
    const w = botsWorld();
    raiseTower(w, BOT, 'goblinTower', BOT_CONFIGS.IMBA);
    const fort = botConfigFor('IMBA', 'FORTRESS');
    expect(fort.persona!.substitute).toBe('listed');
    expect(chooseTargetBlueprint(w, BOT, fort)).toBe('laserTurret');
    // Only the seat's race tower is affordable (3 of one shape; laser and stink are not).
    const race = seatTowerRungs(w, BOT).find((id) => towerRoleOf(id) === 'race')!;
    bankTheBill(w, BOT, race);
    w.phaseEndsAtTick = w.tick + IMBA_ADAPT_WINDOW_TICKS;
    expect(chooseTowerPlan(w, BOT, fort), 'listed: no race-tower substitute').toBeNull();
    // ⚠ NEGATIVE: the same seat with `substitute: 'any'` (every other personality) takes the race tower.
    const anyFort = { ...fort, persona: { ...fort.persona!, substitute: 'any' as const } };
    expect(chooseTowerPlan(w, BOT, anyFort)?.blueprintId).toBe(race);
    // And a LISTED substitute still lands: bank the stink bill → the stink tower, not the race tower.
    bankTheBill(w, BOT, 'stinkTower');
    expect(chooseTowerPlan(w, BOT, fort)?.blueprintId).toBe('stinkTower');
  });

  it('S194: only WARMONGER and IMBA FORTRESS narrow their substitutes — every other cell keeps the pre-S194 "any"', () => {
    for (const tier of BOT_DIFFICULTIES) for (const p of BOT_PERSONALITIES) {
      // WARMONGER at every tier that has one (Q-E + the HARD re-pin), FORTRESS at IMBA. NOOB is BALANCED.
      const want = tier !== 'NOOB' && (p === 'WARMONGER' || (tier === 'IMBA' && p === 'FORTRESS')) ? 'listed' : 'any';
      expect(botConfigFor(tier, p).persona!.substitute, `${tier} ${p}`).toBe(want);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S193 — REACH: bot-vs-bot through the real frame lifecycle', () => {
  const SECONDS = 300;
  const cache = new Map<string, MatchSignature>();
  const sig = (tier: 'MID' | 'HARD' | 'IMBA', p: BotPersonality): MatchSignature => {
    const key = `${tier}:${p}`;
    if (!cache.has(key)) cache.set(key, runSignatureMatch([tier, tier, tier], [p, p, p], SECONDS));
    return cache.get(key)!;
  };
  const sum = (m: MatchSignature, f: (s: SeatSignature) => number): number => m.seats.reduce((a, s) => a + f(s), 0);
  const meanDef = (m: MatchSignature): number => sum(m, (s) => s.defenceRatio) / m.seats.length;

  /*
   * ⚠ ONE MATCH PER `it`, measured first and cached. A single synchronous test running five 300-s matches
   * blocked the worker long enough under `--maxWorkers=3` load that vitest reported an unhandled
   * "Timeout calling onTaskUpdate" (all tests green, run exit 1). Vitest yields between tests, so
   * splitting the measurement keeps the RPC heartbeat alive; the assertions below read the cache.
   */
  for (const tier of ['HARD', 'IMBA'] as const) {
    for (const p of BOT_PERSONALITIES) {
      it(`measure ${tier} ${p}`, () => {
        expect(sig(tier, p).seats).toHaveLength(3);
      }, 60_000);
    }
  }

  it('the instrumented harness IS the BotManager (observation only)', () => {
    const lobby = ['WARMONGER', 'FORTRESS', 'SABOTEUR'] as const;
    expect(runSignatureMatch(['HARD', 'IMBA', 'MID'], lobby, 120).hash)
      .toBe(runFrameMatchWithManager(['HARD', 'IMBA', 'MID'], lobby, 120));
  });

  it('⭐ deterministic: same seed, same lobby ⇒ same hash and same signature', () => {
    const lobby = ['TYCOON', 'SABOTEUR', 'WARMONGER'] as const;
    const a = runSignatureMatch(['IMBA', 'HARD', 'IMBA'], lobby, 180);
    const b = runSignatureMatch(['IMBA', 'HARD', 'IMBA'], lobby, 180);
    expect(a.hash).toBe(b.hash);
    expect(a.seats).toEqual(b.seats);
  }, 60_000);

  it('⭐ HARD: five different signatures', () => {
    const bal = sig('HARD', 'BALANCED');
    const war = sig('HARD', 'WARMONGER');
    const fort = sig('HARD', 'FORTRESS');
    const tyc = sig('HARD', 'TYCOON');
    const sab = sig('HARD', 'SABOTEUR');
    for (const [p, m] of [['BALANCED', bal], ['WARMONGER', war], ['FORTRESS', fort], ['TYCOON', tyc], ['SABOTEUR', sab]] as const) {
      console.log(`[S193] HARD ${p}: ${m.seats.map((s) => `${s.stamps.join('>') || '-'} feeds=${s.feeds} def=${s.defenceRatio.toFixed(2)} loose=${s.loosePlaced}`).join(' | ')}`);
    }
    // SABOTEUR — measured: pentagram first on 3/3 seats.
    for (const s of sab.seats) expect(s.stamps[0], `SABOTEUR s${s.seat}`).toBe('pentagram');
    // WARMONGER — measured: 15+6+4 = 25 units fed, 0 defence stamps; nobody else at HARD feeds except a
    // Saboteur's late leftovers (2). First paid unit at tick 4303, inside the opening BUILD.
    expect(sum(war, (s) => s.feeds)).toBeGreaterThan(10);
    /*
     * ⚠ S193 P3-2 RE-PIN (s193/playtest3 merge seam) — was `toBe(0)`. The owner's "nearest enemy first"
     * (canon §5c) ended the FFA spread, so an army now hits the NEIGHBOUR's buildings instead of thinning
     * over all three seats. Measured after: one Warmonger seat lost its opening goblin tower and, through
     * the S154 "take what you can" escape (nothing stamped ⇒ cheapest legal rung), stamped ONE stink tower
     * before re-raising the goblin (goblin>stink>goblin>nagas, def 0.25; 0.00 / 0.00 on the others).
     * Its PLANNED order still lists no defence. What survives as the signature: the LOWEST defence of the five.
     * ⚠ S193 MED-1 RE-MEASURE (bots no longer build within 34 px of their own porch slots, `isLegalBuildPos`):
     * every assertion here still holds, re-measured, and none was loosened. What moved, HARD only (IMBA is
     * byte-identical): BALANCED s2 t3Mummies>t3Mummies def 0.00 → t3Mummies>stinkTower 0.50 (its pulls land
     * again, so it affords the stink); FORTRESS s2 stink>mummies>stink 0.67 → stink>mummies 0.50, mean 0.44 →
     * 0.39 (still the highest; BALANCED 0.28); loose counts ±1 (BALANCED s1 15→14, TYCOON s2 18→19).
     */
    /*
     * ⭐ S194 (T7) — and the `toBe(0)` is BACK. WARMONGER now carries `substitute: 'listed'`, so the take-what-
     * you-can escape after a razed goblin tower re-raises an ARMY rung instead of a stink tower. Measured
     * (S194 tree): goblin>goblin>nagas | goblin>mummies | zombies×2, def 0.00 on every seat, 17 fed.
     */
    for (const s of war.seats) expect(s.defenceRatio, `WARMONGER s${s.seat} stamps no defence`).toBe(0);
    for (const m of [bal, fort, tyc, sab]) expect(meanDef(war)).toBeLessThan(meanDef(m));
    for (const m of [bal, fort, tyc]) expect(sum(m, (s) => s.feeds)).toBe(0);
    expect(Math.min(...war.seats.map((s) => (s.firstFeedTick < 0 ? Infinity : s.firstFeedTick)))).toBeLessThan(5400);
    // FORTRESS — measured mean defence ratio 0.44, the highest; stink first on 2/3 seats.
    for (const m of [bal, war, tyc, sab]) expect(meanDef(fort)).toBeGreaterThan(meanDef(m));
    expect(fort.seats.filter((s) => s.stamps[0] === 'stinkTower').length).toBeGreaterThanOrEqual(2);
    // TYCOON — measured 54 loose shapes vs BALANCED's 34: the fast, wide builder.
    expect(sum(tyc, (s) => s.loosePlaced)).toBeGreaterThan(sum(bal, (s) => s.loosePlaced) + 8);
  }, 120_000);

  it('⭐ IMBA: the goblin floor holds and the styles still differ above it', () => {
    const all = BOT_PERSONALITIES.map((p) => [p, sig('IMBA', p)] as const);
    for (const [p, m] of all) {
      console.log(`[S193] IMBA ${p}: ${m.seats.map((s) => `${s.stamps.join('>') || '-'} feeds=${s.feeds} def=${s.defenceRatio.toFixed(2)}`).join(' | ')}`);
      // Q4 — measured: the goblin tower is raised on ≥ 2 of 3 seats for EVERY personality (seat 3 opens
      // on its race tower through the S154 "take what you can" escape and then saves for the goblin).
      expect(m.seats.filter((s) => s.stamps.includes('goblinTower')).length, `IMBA ${p} goblin`).toBeGreaterThanOrEqual(2);
      // Q4 — "then buy goblins with leftover shapes": every IMBA personality fed units.
      expect(sum(m, (s) => s.feeds), `IMBA ${p} feeds`).toBeGreaterThan(0);
    }
    const fort = sig('IMBA', 'FORTRESS');
    /*
     * ⭐ S194 (T7) — THE FORTRESS IDENTITY IS RESTORED, and both S193 pins are back.
     * History: S193 measured Fortress as the only IMBA laser and the highest mean defence (0.44). Deploy #23's
     * nearest-enemy-first targeting (canon §5c) made adjacent IMBA armies raze each other's goblin towers;
     * the old row spent its BUILDs re-raising them and filled the bell with race towers (0.25 < BALANCED
     * 0.28, no laser) and S193 re-pinned it down to "a defence on ≥ 2 seats". S194 re-tuned the ROW, not the
     * test (`botPersonality.ts`, FORTRESS IMBA: laser 2nd, substitute 'listed', hold 3300). MEASURED after
     * (final S194 tree): goblin>laser>stink | goblin | goblin>laser — mean defence 0.39 (BALANCED 0.28,
     * TYCOON 0.17, WARMONGER 0.00, SABOTEUR 0.00), two lasers, 8 units fed, 13 loose shapes.
     */
    for (const [p, m] of all) {
      if (p === 'FORTRESS') continue;
      expect(meanDef(fort), `FORTRESS out-defends ${p}`).toBeGreaterThan(meanDef(m));
      expect(m.seats.some((s) => s.stamps.includes('laserTurret')), `${p} fields no laser`).toBe(false);
    }
    expect(fort.seats.filter((s) => s.stamps.includes('laserTurret')).length, 'FORTRESS lasers').toBeGreaterThanOrEqual(1);
    // Measured S194 after the T7 PLACE/PULL fixes moved the bot rng stream: goblin>laser>stink | goblin |
    // goblin>laser — a defence on 2 of 3 seats (3 of 3 on the pre-fix stream), mean 0.39 vs BALANCED 0.28.
    expect(fort.seats.filter((s) => s.defenceRatio > 0).length, 'FORTRESS stamps a defence on ≥ 2 seats').toBeGreaterThanOrEqual(2);
    // ⚠ It still PLAYS between towers: the 3300 hold leaves a spend window (3600 measured 0 loose — rejected).
    expect(sum(fort, (s) => s.loosePlaced)).toBeGreaterThan(0);
    const keys = all.map(([, m]) => JSON.stringify(m.seats.map((s) => [s.stamps, s.feeds, s.defenceRatio])));
    expect(new Set(keys).size, 'the five IMBA signatures are still pairwise different').toBe(all.length);
    // SABOTEUR — measured: a pentagram behind its goblin tower; no other IMBA personality but Warmonger
    // (which ranks it third) reaches for one in five minutes.
    expect(sig('IMBA', 'SABOTEUR').seats.some((s) => s.stamps.includes('pentagram'))).toBe(true);
    // ⚠ NEGATIVE: no IMBA personality's defence-ratio signature is accidentally Fortress's.
    expect(meanDef(sig('IMBA', 'WARMONGER'))).toBeLessThan(meanDef(fort));
  }, 180_000);

  it('⭐ S194 Q-E — IMBA WARMONGER and TYCOON are two different bots', () => {
    /*
     * Before (S193 rows, same harness): WARMONGER def 0.22 · fed 6 · loose 46; TYCOON def 0.17 · fed 3 ·
     * loose 51 — one bot with two names. After (`botPersonality.ts`, WARMONGER `substitute: 'listed'` +
     * IMBA hold 3000): WARMONGER def 0.00 · fed 17 · loose 18 · a pentagram; TYCOON unchanged.
     */
    const war = sig('IMBA', 'WARMONGER');
    const tyc = sig('IMBA', 'TYCOON');
    expect(meanDef(war), 'the army bot stamps no defence').toBe(0);
    expect(meanDef(tyc)).toBeGreaterThan(0);
    expect(sum(war, (s) => s.feeds), 'units bought').toBeGreaterThanOrEqual(2 * sum(tyc, (s) => s.feeds) + 5);
    expect(sum(tyc, (s) => s.loosePlaced), 'loose shapes').toBeGreaterThanOrEqual(2 * sum(war, (s) => s.loosePlaced));
    expect(war.seats.some((s) => s.stamps.includes('pentagram')), 'WARMONGER climbs an army rung').toBe(true);
    expect(tyc.seats.some((s) => s.stamps.includes('pentagram'))).toBe(false);
  }, 60_000);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S193 — the lobby pick REACHES both bot managers', () => {
  it('the worker INIT forwards botPersonalities to its BotManager factory (REACH)', () => {
    const w = botsWorld();
    const seen: unknown[] = [];
    makeWorkerSim(
      {
        type: 'INIT',
        saveJson: JSON.stringify(snapshot(w, { spawnerState: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)).getState() })),
        hostSeats: [],
        localPlayerId: 0,
        botDifficulties: ['HARD', 'IMBA'],
        botMatchSeed: 0x5eed,
        botPersonalities: ['SABOTEUR', 'RANDOM'],
      },
      (d, seed, p) => {
        seen.push([d, seed, p]);
        return new BotManager(d, seed, p);
      },
    );
    expect(seen).toEqual([[['HARD', 'IMBA'], 0x5eed, ['SABOTEUR', 'RANDOM']]]);
    // ⚠ NEGATIVE: an INIT without the field builds BALANCED bots (the pre-S193 message still works).
    const seen2: unknown[] = [];
    makeWorkerSim(
      {
        type: 'INIT',
        saveJson: JSON.stringify(snapshot(w, { spawnerState: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)).getState() })),
        hostSeats: [],
        localPlayerId: 0,
        botDifficulties: ['HARD'],
        botMatchSeed: 1,
      },
      (d, seed, p) => {
        seen2.push(p);
        return new BotManager(d, seed, p);
      },
    );
    expect(seen2).toEqual([[]]);
  });

  /*
   * Source-text guards for the two main-thread sites no unit test can construct (Pixi + the lobby).
   * ⚠ A guard proves a line EXISTS, not that it is REACHED — the worker REACH test above and the
   * BotManager tests are the reach half; these only stop a refactor silently dropping the argument.
   */
  it('main.ts passes the lobby personalities to BOTH managers; simWorker forwards them', () => {
    const main = readFileSync('src/main.ts', 'utf-8');
    expect(main).toMatch(/onStart: \(difficulties, races, personalities\) =>/);
    expect(main).toMatch(/new mod\.BotManager\(difficulties, matchSeed, personalities\)/);
    expect(main).toMatch(/botPersonalities: workerBotInit\.personalities/);
    const worker = readFileSync('src/simWorker.ts', 'utf-8');
    expect(worker).toMatch(/new BotManager\(difficulties, matchSeed, personalities\)/);
    const overlay = readFileSync('src/render/botSetupOverlay.ts', 'utf-8');
    expect(overlay).toMatch(/this\.personalities\.slice\(0, this\.botCount\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('⛔ S193 audit HIGH — under the ENDGAME BUILD LOCK a bot stops placing and FEEDS', () => {
  /*
   * Live on deploy #20 before this fix, and on pure master for BALANCED: from BUILD of wave 27 every bot
   * stood still re-sending a refused PLACE_PRIMITIVE each tick (~9.8k `endgameBuildLocked` rejects per
   * 60 s across three bots, auditor's repro) and never fed, although the owner allowed it — *"they can
   * build more goblins"*. 200 s of play, then the lock falls at the start of a BUILD phase (wave forced
   * to 27) with one shape of each type banked per bot, 80 s locked.
   *
   * MEASURED after the fix, every cell: 0 lock rejects. Feeds ≥ seats owning a feedable tower in every
   * cell (e.g. HARD FORTRESS 19 over 3 seats, IMBA SABOTEUR 15 over 2, MID FORTRESS 0 over 0 — a stink
   * tower eats nothing).
   */
  // One `it` per cell: a single synchronous test running five matches starves vitest's RPC heartbeat
  // ("Timeout calling onTaskUpdate", measured) even though every assertion passes.
  for (const tier of ['MID', 'HARD', 'IMBA'] as const) {
    for (const p of BOT_PERSONALITIES) {
      it(`${tier} ${p}: zero refused builds, and every seat with a feedable tower feeds`, () => {
        const r = runLockMatch(tier, p, 200, 80, 27);
        expect(r.lockRejects, 'lock rejects').toBe(0);
        expect(r.feedsLanded, `feeds (${r.seatsWithTower} seats with a tower)`).toBeGreaterThanOrEqual(r.seatsWithTower);
      }, 60_000);
    }
  }
  it('anti-vacuity: the cells as a whole own feedable towers and fed', () => {
    let towers = 0;
    let feeds = 0;
    /*
     * ⚠ S194 (T7) RE-PIN — was WARMONGER + BALANCED. After the S194 Warmonger row, its one seat that owns a
     * feedable tower at the lock owns a RACE tower (nagas) and a pentagram — its goblin tower was razed —
     * and a race tower eats ONE shape type, of which one is banked: 1 feed for 1 tower (verified with a
     * spawner dump, not assumed; the per-cell test above still passes for it). The goblin-tower seat that
     * makes this test non-vacuous is SABOTEUR's (measured 7 feeds over 1 tower).
     */
    for (const p of ['SABOTEUR', 'BALANCED'] as const) {
      const r = runLockMatch('IMBA', p, 200, 80, 27);
      towers += r.seatsWithTower;
      feeds += r.feedsLanded;
    }
    expect(towers).toBeGreaterThan(0);
    expect(feeds).toBeGreaterThan(towers);
  }, 60_000);

  it('a bot CARRYING a shape when the lock falls drops it instead of re-sending PLACE every tick', () => {
    // Measured with the controller's drop arm disabled (mutation): the brain-side skip alone does NOT
    // catch this — the HAUL arm keeps re-sending the refused placement. With it: 0 rejects, hands empty.
    for (const tier of ['MID', 'HARD', 'IMBA'] as const) {
      const r = runLockMatch(tier, 'BALANCED', 30, 10, 27, false, 'midHaul');
      expect(r.lockRejects, `${tier} rejects`).toBe(0);
      expect(r.carryingAtEnd, `${tier} still carrying`).toBe(false);
    }
  }, 60_000);

  it('⚠ NEGATIVE: one wave BEFORE the lock (26) nothing changes — the bot still builds', () => {
    // Wave 26 is a normal BUILD: placements are not refused, so the lock counter stays 0 trivially, and
    // the HARD BALANCED bot (feed: never) does NOT feed — the "everyone feeds" rule is the lock's only.
    const r = runLockMatch('HARD', 'BALANCED', 200, 40, 26);
    expect(r.lockRejects).toBe(0);
    expect(r.feedsLanded).toBe(0);
  }, 60_000);
});

describe('S193 audit LOW-2 — every lobby tagline clears the race chip', () => {
  it('no tagline is longer than BOT_TAGLINE_MAX_CHARS (27 = 196 px / 7.2 px a glyph)', () => {
    // The arithmetic, re-derived from the overlay's layout so a re-layout that moves the chips is caught
    // by re-reading this line: (RACE_X − 92) − (−PANEL_W/2 + 64) − 8 with PANEL_W 860, RACE_X 430 − 500.
    const free = (860 / 2 - 500 - 92) - (-860 / 2 + 64) - 8;
    expect(free).toBe(196);
    expect(Math.floor(free / (0.6 * 12))).toBe(BOT_TAGLINE_MAX_CHARS);
    for (const t of [...Object.values(BOT_PERSONALITY_TAGLINES), BOT_PERSONALITY_LOCKED_TAGLINE]) {
      expect(t.length, t).toBeLessThanOrEqual(BOT_TAGLINE_MAX_CHARS);
    }
  });

  it('the overlay still lays the chips out where the arithmetic assumes', () => {
    const overlay = readFileSync('src/render/botSetupOverlay.ts', 'utf-8');
    expect(overlay).toMatch(/const PANEL_W = 860;/);
    expect(overlay).toMatch(/const RACE_X = PANEL_W \/ 2 - 500;/);
    expect(overlay).toMatch(/roundRect\(-92, -18, 184, 36, 6\)/);
    expect(overlay).toMatch(/tagline\.position\.set\(-PANEL_W \/ 2 \+ 64,/);
  });
});
