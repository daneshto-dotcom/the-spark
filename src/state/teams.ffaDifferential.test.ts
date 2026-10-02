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
 * ⭐ Re-recorded S194 T10 merge (s194/matchboard on master PROTOCOL 65): the stat board v2 adds INERT hash parts
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
  '300:2124197789',
  '600:463310726',
  '900:987127325',
  '1200:4104925390',
  '1500:2670313869',
  '1800:2036616194',
  '2100:1931413727',
  '2400:1131343646',
  '2700:2017032568',
  '3000:4231910160',
  '3300:3952246993',
  '3600:4032387692',
  '3900:3514270678',
  '4200:1638698333',
  '4500:4099517646',
  '4800:574926345',
  '5100:1663284131',
  '5400:2648616760',
  '5700:1261080355',
  '6000:723447362',
  '6300:2007403771',
  '6600:1946563116',
  '6900:2013856190',
  '7200:1605366357',
  '7500:1328998791',
  '7800:2825757595',
  '8100:3756223771',
  '8400:3315744945',
  '8700:3731765146',
  '9000:3609904115',
  '9300:2439499328',
  '9600:1234300015',
  '9900:536319113',
  '10200:982453407',
  '10500:595365797',
  '10800:2324550135',
  '11100:1308259091',
  '11400:888630754',
  '11700:1734016638',
  '12000:629087821',
  '12300:2352654974',
  '12600:1424087142',
  '12900:2300845586',
  '13200:2216986976',
  '13500:989940742',
  '13800:1636390364',
  '14100:2138640514',
  '14400:3207744049',
  '14700:3938413801',
  '15000:530990162',
  '15300:3950063990',
  '15600:182809434',
  '15900:1785650456',
  '16200:526969758',
  '16500:1668441609',
  '16800:2704104066',
  '17100:1245256424',
  '17400:529873218',
  '17700:1477172325',
  '18000:2769657227',
  '18300:2562884912',
  '18600:3448431369',
  '18900:4214449234',
  '19200:1744373006',
  '19500:1999999190',
  '19800:3968809986',
  '20100:3261490257',
  '20400:772249424',
  '20700:1696412915',
  '21000:1553689669',
  '21300:1399635774',
  '21600:3038879396',
  '21900:4104216779',
  '22200:1973822453',
  '22500:2444442585',
  '22800:876236155',
  '23100:2856832372',
  '23400:2903048968',
  '23700:682782696',
  '24000:583605914',
  '24300:1683156901',
  '24600:2152378920',
  '24900:2961898250',
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
