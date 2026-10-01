/**
 * ⭐⭐ S192 (owner R192-T1..T4) — **A FREE-FOR-ALL IS BYTE-IDENTICAL TO PRE-TEAMS MASTER.**
 *
 * Teams converted 69 enemy decisions to `state/teams.ts`. In a free-for-all (`world.teams` undefined)
 * every one of them must reduce to the comparison it replaced, or every live match changes. This
 * drives a long four-seat vs-bots match — three full waves through the REAL host tick, bots thinking,
 * the board topped up to 40 creatures every second of every FIGHT — and compares `hashWorldStateFull`
 * every 300 ticks against a series RECORDED ON MASTER `71abc27` (pre-teams; first `663c4c9`) by running this very file
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
 * Re-recorded S193 on master 71abc27 (the merge base after `git merge master`; first recorded S192 on
 * 663c4c9): `git checkout master -- src`, this file restored, `SPARK_TEAMS_RECORD=1 npx vitest run
 * src/state/teams.ffaDifferential.test.ts`, then `git checkout HEAD -- src`. Master moved the sim
 * (212 commits), so the old series no longer described master — this one does.
 */
const GOLDEN: readonly string[] = [
  '300:993921464',
  '600:3296798022',
  '900:603112270',
  '1200:2452992964',
  '1500:453126061',
  '1800:4129914815',
  '2100:978702244',
  '2400:2817991684',
  '2700:1792579133',
  '3000:511361172',
  '3300:1858736094',
  '3600:1080392259',
  '3900:1728590756',
  '4200:3483124838',
  '4500:1123803706',
  '4800:3797714261',
  '5100:3472496582',
  '5400:781839812',
  '5700:917420823',
  '6000:3669795171',
  '6300:2599067072',
  '6600:3503051080',
  '6900:1164552389',
  '7200:3713259644',
  '7500:162073139',
  '7800:3844345567',
  '8100:3848821444',
  '8400:2748413328',
  '8700:2242634046',
  '9000:1852375776',
  '9300:605898367',
  '9600:445130811',
  '9900:2719350395',
  '10200:1761865626',
  '10500:394188101',
  '10800:3279203189',
  '11100:1592497659',
  '11400:3293897911',
  '11700:432572911',
  '12000:519645965',
  '12300:1696008608',
  '12600:2862782496',
  '12900:3305643204',
  '13200:3461965110',
  '13500:3293541203',
  '13800:3803084264',
  '14100:530928226',
  '14400:2747099309',
  '14700:2053971577',
  '15000:262640231',
  '15300:2024593020',
  '15600:2107431945',
  '15900:3263470589',
  '16200:3258318944',
  '16500:1805402328',
  '16800:3127175090',
  '17100:2378650983',
  '17400:1347264540',
  '17700:7200171',
  '18000:34060036',
  '18300:4282540846',
  '18600:652714422',
  '18900:1121715685',
  '19200:691933177',
  '19500:2870922337',
  '19800:697186242',
  '20100:4177743024',
  '20400:2218107182',
  '20700:1151765842',
  '21000:18427480',
  '21300:3146356738',
  '21600:210093672',
  '21900:2044771895',
  '22200:265334856',
  '22500:198433284',
  '22800:1228259256',
  '23100:440701501',
  '23400:3191178813',
  '23700:3815711472',
  '24000:726312164',
  '24300:317479227',
  '24600:4191885431',
  '24900:906485561',
  '25200:3069143166',
  '25500:3754610212',
  '25800:1809454885',
  '26100:457634305',
  '26400:3570413539',
  '26700:1297925744',
  '27000:696260915',
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
