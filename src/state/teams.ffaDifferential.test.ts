/**
 * ⭐⭐ S192 (owner R192-T1..T4) — **A FREE-FOR-ALL IS BYTE-IDENTICAL TO PRE-TEAMS MASTER.**
 *
 * Teams converted 69 enemy decisions to `state/teams.ts`. In a free-for-all (`world.teams` undefined)
 * every one of them must reduce to the comparison it replaced, or every live match changes. This
 * drives a long four-seat vs-bots match — three full waves through the REAL host tick, bots thinking,
 * the board topped up to 40 creatures every second of every FIGHT — and compares `hashWorldStateFull`
 * every 300 ticks against a series RECORDED ON MASTER `656b106` (pre-teams; earlier `71abc27`, first `663c4c9`) by running this very file
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
 * Re-recorded S193 round 2 on master 656b106 (deploy #17, units-ai; = the auditor's a684ce5 series); earlier 71abc27; first recorded S192 on
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
  '6000:324807874',
  '6300:3847540294',
  '6600:957912747',
  '6900:3292156677',
  '7200:2326989921',
  '7500:1040285428',
  '7800:786554228',
  '8100:2855207234',
  '8400:4105796270',
  '8700:1692644570',
  '9000:854420613',
  '9300:1293253364',
  '9600:3155095375',
  '9900:657945147',
  '10200:4073951178',
  '10500:3286204728',
  '10800:1042364998',
  '11100:2228762661',
  '11400:2002642205',
  '11700:3841853072',
  '12000:696595317',
  '12300:2182639727',
  '12600:3275989956',
  '12900:4294391541',
  '13200:3779836750',
  '13500:198335398',
  '13800:2967590617',
  '14100:1600442836',
  '14400:2603680578',
  '14700:3710415519',
  '15000:2151797239',
  '15300:55916412',
  '15600:2480867190',
  '15900:2174566055',
  '16200:3266618002',
  '16500:2246283051',
  '16800:438475106',
  '17100:1785769059',
  '17400:662426702',
  '17700:1107886343',
  '18000:2751029165',
  '18300:3498195754',
  '18600:3974741612',
  '18900:1510350334',
  '19200:2134438606',
  '19500:1638014610',
  '19800:3671549387',
  '20100:144159686',
  '20400:3655299631',
  '20700:3345830459',
  '21000:1385098442',
  '21300:4033368726',
  '21600:4091329549',
  '21900:3300387167',
  '22200:3938379341',
  '22500:1209239695',
  '22800:3897433165',
  '23100:737780256',
  '23400:1959481494',
  '23700:4245227693',
  '24000:3242048644',
  '24300:2009692969',
  '24600:2578613201',
  '24900:3410647814',
  '25200:1364111526',
  '25500:2878871302',
  '25800:1391945594',
  '26100:453241575',
  '26400:4000172038',
  '26700:888513046',
  '27000:166844488',
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
