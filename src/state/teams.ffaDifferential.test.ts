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
  '300:1828055887',
  '600:3970497242',
  '900:801419081',
  '1200:2794695136',
  '1500:3584411837',
  '1800:2098168114',
  '2100:249566923',
  '2400:3924748362',
  '2700:3879245772',
  '3000:2584935884',
  '3300:2887267845',
  '3600:3045184580',
  '3900:1325488826',
  '4200:3228002717',
  '4500:1354711102',
  '4800:2379961945',
  '5100:4017730467',
  '5400:3310343692',
  '5700:2480348526',
  '6000:365295719',
  '6300:368780590',
  '6600:4075670879',
  '6900:3318534729',
  '7200:714147174',
  '7500:4026675981',
  '7800:562875738',
  '8100:3920245922',
  '8400:3258305494',
  '8700:2876326584',
  '9000:2939222121',
  '9300:3871485874',
  '9600:1902025319',
  '9900:1446846517',
  '10200:3790947321',
  '10500:1176757801',
  '10800:760296415',
  '11100:1493755865',
  '11400:4094706458',
  '11700:4105678126',
  '12000:3550117977',
  '12300:586924730',
  '12600:287861002',
  '12900:711921840',
  '13200:3946502686',
  '13500:1321623928',
  '13800:377490836',
  '14100:1906923604',
  '14400:1453386931',
  '14700:1973912597',
  '15000:2028291967',
  '15300:2978677026',
  '15600:2886409164',
  '15900:3975477055',
  '16200:2774987604',
  '16500:837724824',
  '16800:4152745150',
  '17100:2637564279',
  '17400:3097807563',
  '17700:3726535173',
  '18000:4080878043',
  '18300:199245296',
  '18600:2420321021',
  '18900:2742760990',
  '19200:3239767042',
  '19500:274100618',
  '19800:723553474',
  '20100:159832041',
  '20400:3223087780',
  '20700:546039611',
  '21000:114381053',
  '21300:1730962358',
  '21600:157591472',
  '21900:3841963607',
  '22200:2170805885',
  '22500:1416037077',
  '22800:375619383',
  '23100:2294987216',
  '23400:1877872848',
  '23700:3817684491',
  '24000:1624235252',
  '24300:841464081',
  '24600:2945781031',
  '24900:19627010',
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
