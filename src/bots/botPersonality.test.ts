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

import { describe, expect, it } from 'vitest';
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
  runManagerMatch,
  runSignatureMatch,
  type MatchSignature,
  type SeatSignature,
} from './botPersonality.fixtures.ts';
import {
  BOT_DIFFICULTIES,
  BOT_PERSONALITIES,
  BOT_PERSONALITY_CHOICES,
  resolvePersonality,
  type BotPersonality,
} from './botTypes.ts';

const BOT = asPlayerId(1);

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
describe('S193 — IDENTITY: BALANCED below IMBA is the pre-S193 bot, byte for byte', () => {
  /*
   * Measured on master a638565b with the UNCHANGED bot code, through this exact harness (bots before
   * `runHostTick`, the `firstTowerSpeed.test.ts` fixture), world seed 0xb07, bot seed 0xbeef, 200 s.
   * If either number moves, BALANCED is no longer the bot the owner has been ruling on.
   */
  const PRE_S193_NOOB_MID_HARD = 3272847274;
  const PRE_S193_HARD_MID_HARD = 2679319443;

  it('a bare BotManager (no personalities) reproduces the pre-S193 hash', () => {
    expect(runManagerMatch(['NOOB', 'MID', 'HARD'], 200)).toBe(PRE_S193_NOOB_MID_HARD);
    expect(runManagerMatch(['HARD', 'MID', 'HARD'], 200)).toBe(PRE_S193_HARD_MID_HARD);
  });

  it('explicit BALANCED reproduces it too', () => {
    expect(runManagerMatch(['NOOB', 'MID', 'HARD'], 200, ['BALANCED', 'BALANCED', 'BALANCED']))
      .toBe(PRE_S193_NOOB_MID_HARD);
  });

  it('⚠ NEGATIVE: a non-BALANCED personality DOES move the hash (the pin is not vacuous)', () => {
    expect(runManagerMatch(['HARD', 'MID', 'HARD'], 200, ['FORTRESS', 'BALANCED', 'WARMONGER']))
      .not.toBe(PRE_S193_HARD_MID_HARD);
  });

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
    expect(sum(war, (s) => s.defenceRatio)).toBe(0);
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
    // FORTRESS — measured: the only IMBA personality to field a laser turret, mean defence ratio 0.44.
    expect(fort.seats.some((s) => s.stamps.includes('laserTurret'))).toBe(true);
    for (const [p, m] of all) if (p !== 'FORTRESS') expect(meanDef(fort), `vs ${p}`).toBeGreaterThan(meanDef(m));
    // SABOTEUR — measured: a pentagram behind its goblin tower; no other IMBA personality but Warmonger
    // (which ranks it third) reaches for one in five minutes.
    expect(sig('IMBA', 'SABOTEUR').seats.some((s) => s.stamps.includes('pentagram'))).toBe(true);
    // ⚠ NEGATIVE: no IMBA personality's defence-ratio signature is accidentally Fortress's.
    expect(meanDef(sig('IMBA', 'WARMONGER'))).toBeLessThan(meanDef(fort));
  }, 180_000);
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
