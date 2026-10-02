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
 * Re-recorded S194 T7 R3 on `s194/rules` (porch +74 → +42 R194-16, R194-26/27 pants, bot re-tune — all move the sim):
 * the PRE-TEAMS reference was a clean temp worktree of master d650db33 (post-entropy, pre-teams) with s194/rules
 * 82ceff39 merged (clean) and the re-tuned `botPersonality.ts` copied in; the merged teams tree (rules + master
 * b2c9a478) recorded the SAME series, both md5 cc6347aacba02d929cf1d7780d6546a5 (86 checkpoints).
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
  '300:383802313',
  '600:2275594155',
  '900:437137485',
  '1200:2957968336',
  '1500:3729314106',
  '1800:964443943',
  '2100:1736964126',
  '2400:963845311',
  '2700:59234690',
  '3000:3605835858',
  '3300:801820541',
  '3600:1682993010',
  '3900:2559832866',
  '4200:2705811037',
  '4500:1159454004',
  '4800:2630762263',
  '5100:3305348974',
  '5400:2980514988',
  '5700:20894463',
  '6000:1892091557',
  '6300:991970945',
  '6600:147861201',
  '6900:836342052',
  '7200:2777124474',
  '7500:2751338250',
  '7800:2118075397',
  '8100:3843610478',
  '8400:47419377',
  '8700:2246276758',
  '9000:4225308263',
  '9300:3170073260',
  '9600:2235538177',
  '9900:1360233278',
  '10200:404986636',
  '10500:977373215',
  '10800:986543838',
  '11100:3530631873',
  '11400:2212248638',
  '11700:1747074509',
  '12000:46365238',
  '12300:1584528644',
  '12600:2025319950',
  '12900:231079397',
  '13200:4092906135',
  '13500:831069718',
  '13800:484148705',
  '14100:757719148',
  '14400:626015050',
  '14700:1830662532',
  '15000:677242888',
  '15300:1880357334',
  '15600:1168750079',
  '15900:2075924772',
  '16200:1110862358',
  '16500:3789474576',
  '16800:1478832936',
  '17100:2842350784',
  '17400:1121756361',
  '17700:3005050932',
  '18000:2174980902',
  '18300:198919695',
  '18600:2738893293',
  '18900:1706072196',
  '19200:483223714',
  '19500:3400790408',
  '19800:2954393574',
  '20100:204525753',
  '20400:2024242024',
  '20700:752119707',
  '21000:907625570',
  '21300:1460936649',
  '21600:2962774737',
  '21900:2156408403',
  '22200:2683214952',
  '22500:3480056983',
  '22800:931789443',
  '23100:2718785901',
  '23400:2147113885',
  '23700:3260950867',
  '24000:4175439824',
  '24300:2748679940',
  '24600:2227231372',
  '24900:2453346887',
  '25200:1604574033',
  '25500:2175688145',
  '25800:3910495510',
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
