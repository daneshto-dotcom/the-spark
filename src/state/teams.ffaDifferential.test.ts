/**
 * ⭐⭐ S192 (owner R192-T1..T4) — **A FREE-FOR-ALL IS BYTE-IDENTICAL TO PRE-TEAMS MASTER.**
 *
 * Teams converted 69 enemy decisions to `state/teams.ts`. In a free-for-all (`world.teams` undefined)
 * every one of them must reduce to the comparison it replaced, or every live match changes. This
 * drives a long four-seat vs-bots match — three full waves through the REAL host tick, bots thinking,
 * the board topped up to 40 creatures every second of every FIGHT — and compares `hashWorldStateFull`
 * every 300 ticks against a series RECORDED ON MASTER `814f1871` (pre-teams; earlier `01530fb1`, `0a37175e`, `656b106`, `71abc27`, first `663c4c9`) by running this very file
 * there with `SPARK_TEAMS_RECORD=1`.
 *
 * ⚠ THIS FILE IMPORTS NOTHING FROM `teams.ts` ON PURPOSE — it must run unchanged on the pre-teams tree
 * that produced the golden. If a later branch legitimately moves the sim, re-record on that branch's
 * merge base and say so in the commit; never edit a golden to match without re-recording.
 */
import { describe, expect, it } from 'vitest';
import { runHostTick } from './hostTick.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { startC5Match, topUpCreatures, WAVE_TICKS } from './c5WaveFiveBoard.fixtures.ts';

const WAVES = 3;
const CREATURES = 40;
const EVERY = 300;

/**
 * ⭐ Re-recorded S194 T11 re-audit merge (s194/rules 9f319f26 + master e9855ba9 PROTOCOL 66: rage, coherence,
 * weld-rebuild, matchboard): 86 checkpoints, md5 of the series f799248c52e031928c71b8d2abf18856. ⚠ A PRE-TEAMS reference
 * can no longer be built for this pair: s194/weld-rebuild and s194/matchboard already carry teams, and reverting the
 * teams merge on the merged tree conflicts in five files (save.ts, potatoLifecycle.ts, …). What WAS checked: a fresh
 * merge of the same two tips in a clean worktree gives a byte-identical src tree (`git diff` empty), and the last
 * pre-teams proof for s194/rules stands (cc6347aa…, below); nothing since touches a teams call site.
 * ⭐ (master's T10 note:) Re-recorded S194 T10 merge (s194/matchboard on master PROTOCOL 65): the stat board v2 adds INERT hash parts
 * (`matchStatsHashParts`: units lost, who-hit-whom, keep/structure split, unattributed, four running totals per wave
 * point), so every checkpoint's WIDE hash moves while the sim does not (same 83 checkpoints). Proof that teams adds no
 * change on top of that: the branch tree (e892adb7, `git checkout e892adb7 -- src`) and the merged tree record the SAME
 * series, md5 68609091879be7723572991648738e61 both (the re-auditor's equivalent proof on the previous pair: md5
 * 934115bf…). Recorded with `SPARK_TEAMS_RECORD=1 npx vitest run src/state/teams.ffaDifferential.test.ts`.
 * Re-recorded S194 fix round on master 814f1871 (bots-tune moved the sim) in a CLEAN temp worktree of master: master
 * series and merged teams series both md5 4781d982078f58dbe6618f37810ca2c5. Before that on master 01530fb1 (mres-card PROTOCOL 63, intentStamp fix, visuals-racial): the master
 * series and the merged teams series both md5 e511479e3313aa4a1573e6463f253526 (the auditor's number for
 * 2fe065fb). Before that: S194 on master 0a37175e (deploy #23; PROTOCOL 62) — master moved the sim
 * 324 commits since 656b106. Same recipe: `git checkout master -- src`, this file restored,
 * `SPARK_TEAMS_RECORD=1 npx vitest run src/state/teams.ffaDifferential.test.ts`, then `git checkout HEAD -- src`.
 * The merged teams tree recorded the SAME 90 checkpoints, byte for byte (S194). Earlier series: 656b106 (S193
 * round 2), 71abc27 (S193), 663c4c9 (first, S192).
 */
const GOLDEN: readonly string[] = [
  '300:1847170003',
  '600:489865535',
  '900:1384976913',
  '1200:4283688382',
  '1500:958001588',
  '1800:3434078231',
  '2100:1373286730',
  '2400:2606256867',
  '2700:1204152598',
  '3000:3181228550',
  '3300:2036241121',
  '3600:1814818058',
  '3900:1666443814',
  '4200:3342314141',
  '4500:3066108804',
  '4800:4249554519',
  '5100:4189039278',
  '5400:1400054180',
  '5700:1047678721',
  '6000:1356726832',
  '6300:1602259256',
  '6600:3763483056',
  '6900:4113938231',
  '7200:2765282532',
  '7500:2064558133',
  '7800:1336222892',
  '8100:177469474',
  '8400:1825503406',
  '8700:3706559559',
  '9000:2695730940',
  '9300:3579367001',
  '9600:3148374882',
  '9900:2918186775',
  '10200:2737859721',
  '10500:3269365278',
  '10800:641969405',
  '11100:3224348980',
  '11400:536260483',
  '11700:3118588816',
  '12000:3424234865',
  '12300:1121297179',
  '12600:2744708319',
  '12900:2599265190',
  '13200:1224760664',
  '13500:623566625',
  '13800:388666852',
  '14100:3447398917',
  '14400:936165419',
  '14700:2108029456',
  '15000:423256150',
  '15300:2089655310',
  '15600:2913817962',
  '15900:398789203',
  '16200:2333844283',
  '16500:2454517016',
  '16800:819732072',
  '17100:3739621684',
  '17400:4270243694',
  '17700:3331144653',
  '18000:2291007816',
  '18300:744100315',
  '18600:1094165077',
  '18900:3963063176',
  '19200:2703353102',
  '19500:2092787740',
  '19800:3597903914',
  '20100:3847696227',
  '20400:2568127810',
  '20700:3167457929',
  '21000:573171492',
  '21300:44657403',
  '21600:347656099',
  '21900:3282821267',
  '22200:3938807364',
  '22500:3296435091',
  '22800:3223357379',
  '23100:2103583649',
  '23400:2618614953',
  '23700:535122003',
  '24000:1564006508',
  '24300:1926430338',
  '24600:4229643748',
  '24900:262959010',
  '25200:959632896',
  '25500:2662674416',
  '25800:2647340176',
];

describe('S192 — teams: a free-for-all match is byte-identical to pre-teams master', () => {
  it('⛔ hashWorldStateFull every 300 ticks over three waves of a four-seat bots match', async () => {
    const m = startC5Match(true);
    const series: string[] = [];
    const end = WAVES * WAVE_TICKS;
    while (m.world.tick < end && (m.world.gameState as string) === 'PLAYING') {
      if (m.world.tick % 500 === 0) await new Promise<void>((r) => setImmediate(r));
      if (m.world.matchPhase === 'FIGHT' && m.world.tick % 60 === 0) topUpCreatures(m.world, CREATURES);
      m.bots.tick(m.world);
      runHostTick(m.world, m.deps, m.state);
      m.world.effects.length = 0;
      if (m.world.tick % EVERY === 0) series.push(`${m.world.tick}:${hashWorldStateFull(m.world)}`);
    }
    if (process.env.SPARK_TEAMS_RECORD === '1') {
      // eslint-disable-next-line no-console
      console.log(`GOLDEN_SERIES=${JSON.stringify(series)}`);
      return;
    }
    expect(series.length, 'the match ran its three waves').toBeGreaterThan(40);
    expect(m.world.teams, 'a roster with no team picks is the free-for-all').toBeUndefined();
    const firstDiff = series.findIndex((h, i) => h !== GOLDEN[i]);
    expect(firstDiff, `first divergence from master at checkpoint ${firstDiff} (${series[firstDiff]})`).toBe(-1);
    expect(series.length).toBe(GOLDEN.length);
  }, 600_000);
});
