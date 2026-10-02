/**
 * ⭐⭐ S192 (owner R192-T1..T4) — **A FREE-FOR-ALL IS BYTE-IDENTICAL TO PRE-TEAMS MASTER.**
 *
 * Teams converted 69 enemy decisions to `state/teams.ts`. In a free-for-all (`world.teams` undefined)
 * every one of them must reduce to the comparison it replaced, or every live match changes. This
 * drives a long four-seat vs-bots match — three full waves through the REAL host tick, bots thinking,
 * the board topped up to 40 creatures every second of every FIGHT — and compares `hashWorldStateFull`
 * every 300 ticks against a series RECORDED ON MASTER `01530fb1` (pre-teams; earlier `0a37175e`, `656b106`, `71abc27`, first `663c4c9`) by running this very file
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
 * Re-recorded S194 fix round on master 01530fb1 (mres-card PROTOCOL 63, intentStamp fix, visuals-racial): the master
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
  '3900:3608806330',
  '4200:1630550273',
  '4500:2229657476',
  '4800:2955583275',
  '5100:4026842464',
  '5400:1665219523',
  '5700:1279985493',
  '6000:566659021',
  '6300:2660121594',
  '6600:31835613',
  '6900:3213965647',
  '7200:4184372116',
  '7500:766111931',
  '7800:3637785748',
  '8100:4114126594',
  '8400:1960375495',
  '8700:1319491951',
  '9000:1823740647',
  '9300:1521835124',
  '9600:368199731',
  '9900:1281262619',
  '10200:2654476707',
  '10500:3141748428',
  '10800:3384405425',
  '11100:745318279',
  '11400:1585725131',
  '11700:221208412',
  '12000:1187035901',
  '12300:3547530022',
  '12600:3841953297',
  '12900:179320594',
  '13200:68514709',
  '13500:3157012175',
  '13800:3228472645',
  '14100:2756560567',
  '14400:4126756533',
  '14700:3971858139',
  '15000:2270231155',
  '15300:3788186237',
  '15600:658905886',
  '15900:1054657020',
  '16200:71037267',
  '16500:2885811522',
  '16800:759991768',
  '17100:3023620556',
  '17400:647026340',
  '17700:2817726068',
  '18000:2034423189',
  '18300:3150707191',
  '18600:1510408866',
  '18900:594815277',
  '19200:1646143198',
  '19500:4160399177',
  '19800:2822671326',
  '20100:2331684319',
  '20400:2058898197',
  '20700:792996568',
  '21000:1271236567',
  '21300:4017350226',
  '21600:3583849608',
  '21900:401553281',
  '22200:709310691',
  '22500:2751358008',
  '22800:1428678649',
  '23100:3124931037',
  '23400:568164514',
  '23700:2469430050',
  '24000:2084813465',
  '24300:572556375',
  '24600:86564927',
  '24900:3647325910',
  '25200:3211275999',
  '25500:3231032706',
  '25800:1419322013',
  '26100:4233549119',
  '26400:232611074',
  '26700:3523943610',
  '27000:2360277626',
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
