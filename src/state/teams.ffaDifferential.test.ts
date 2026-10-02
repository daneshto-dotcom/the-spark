/**
 * ⭐⭐ S192 (owner R192-T1..T4) — **A FREE-FOR-ALL IS BYTE-IDENTICAL TO PRE-TEAMS MASTER.**
 *
 * Teams converted 69 enemy decisions to `state/teams.ts`. In a free-for-all (`world.teams` undefined)
 * every one of them must reduce to the comparison it replaced, or every live match changes. This
 * drives a long four-seat vs-bots match — three full waves through the REAL host tick, bots thinking,
 * the board topped up to 40 creatures every second of every FIGHT — and compares `hashWorldStateFull`
 * every 300 ticks against a series RECORDED ON MASTER `0a37175e` (pre-teams; earlier `656b106`, `71abc27`, first `663c4c9`) by running this very file
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
 * Re-recorded S194 on master 0a37175e (deploy #23 + the S194 PDR commit; PROTOCOL 62) — master moved the sim
 * 324 commits since 656b106. Same recipe: `git checkout master -- src`, this file restored,
 * `SPARK_TEAMS_RECORD=1 npx vitest run src/state/teams.ffaDifferential.test.ts`, then `git checkout HEAD -- src`.
 * The merged teams tree recorded the SAME 90 checkpoints, byte for byte (S194). Earlier series: 656b106 (S193
 * round 2), 71abc27 (S193), 663c4c9 (first, S192).
 */
const GOLDEN: readonly string[] = [
  '300:590150179',
  '600:2422860158',
  '900:2613065893',
  '1200:267615938',
  '1500:2615131473',
  '1800:690429980',
  '2100:2633332579',
  '2400:2539066834',
  '2700:1389171558',
  '3000:736427726',
  '3300:551373749',
  '3600:2766503148',
  '3900:3177049708',
  '4200:3225746331',
  '4500:3678248230',
  '4800:315197631',
  '5100:2345738588',
  '5400:1860698315',
  '5700:3415888297',
  '6000:2852155609',
  '6300:574200356',
  '6600:4116969115',
  '6900:1035820599',
  '7200:2462661536',
  '7500:658946553',
  '7800:1637764120',
  '8100:1518038070',
  '8400:762718883',
  '8700:3809020361',
  '9000:1125360909',
  '9300:1811951980',
  '9600:3521722651',
  '9900:163962779',
  '10200:944636929',
  '10500:1861106652',
  '10800:1529549343',
  '11100:2465860679',
  '11400:1447179037',
  '11700:1801482414',
  '12000:1839628703',
  '12300:3679757516',
  '12600:575179201',
  '12900:1385015306',
  '13200:3322461813',
  '13500:972443975',
  '13800:215336543',
  '14100:614320975',
  '14400:649537091',
  '14700:2507615465',
  '15000:463677283',
  '15300:465146897',
  '15600:2753647268',
  '15900:1606311214',
  '16200:2365684789',
  '16500:101866204',
  '16800:18650274',
  '17100:655152076',
  '17400:1171505772',
  '17700:3135180292',
  '18000:334895667',
  '18300:2017035743',
  '18600:543735922',
  '18900:2195965005',
  '19200:2052366426',
  '19500:3254312849',
  '19800:3289338460',
  '20100:2565332457',
  '20400:899877615',
  '20700:1328525958',
  '21000:2302673189',
  '21300:2298448436',
  '21600:3714594186',
  '21900:3395940741',
  '22200:2555444847',
  '22500:1258574092',
  '22800:1139289445',
  '23100:3697536137',
  '23400:1222197180',
  '23700:3420980884',
  '24000:3026524759',
  '24300:1959015345',
  '24600:2267380767',
  '24900:1401397366',
  '25200:2771060041',
  '25500:2316950718',
  '25800:325573789',
  '26100:3442319481',
  '26400:3186687644',
  '26700:720152476',
  '27000:2622043630',
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
