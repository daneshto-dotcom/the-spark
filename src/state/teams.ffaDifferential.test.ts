/**
 * ⭐⭐ S192 (owner R192-T1..T4) — **A FREE-FOR-ALL IS BYTE-IDENTICAL TO PRE-TEAMS MASTER.**
 *
 * Teams converted 69 enemy decisions to `state/teams.ts`. In a free-for-all (`world.teams` undefined)
 * every one of them must reduce to the comparison it replaced, or every live match changes. This
 * drives a long four-seat vs-bots match — three full waves through the REAL host tick, bots thinking,
 * the board topped up to 40 creatures every second of every FIGHT — and compares `hashWorldStateFull`
 * every 300 ticks against a series RECORDED ON MASTER `663c4c9` (pre-teams) by running this very file
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

/** Recorded on master 663c4c9 (`SPARK_TEAMS_RECORD=1 npx vitest run src/state/teams.ffaDifferential.test.ts`). */
const GOLDEN: readonly string[] = [
  '300:899346886',
  '600:4036070986',
  '900:2114114898',
  '1200:2916846106',
  '1500:1395860281',
  '1800:2792619113',
  '2100:3692639390',
  '2400:983095588',
  '2700:4102654113',
  '3000:1211477010',
  '3300:1326534280',
  '3600:1019352899',
  '3900:3811995776',
  '4200:3660182542',
  '4500:914224422',
  '4800:1197869516',
  '5100:4236739235',
  '5400:580980792',
  '5700:2894805485',
  '6000:3518792930',
  '6300:3841607531',
  '6600:1626691491',
  '6900:719603541',
  '7200:809964375',
  '7500:4208372272',
  '7800:2596179261',
  '8100:2960239420',
  '8400:1688584758',
  '8700:402471034',
  '9000:4060047605',
  '9300:1339509995',
  '9600:3775497014',
  '9900:4067024963',
  '10200:3279072369',
  '10500:1861356125',
  '10800:3149658471',
  '11100:3715534425',
  '11400:1012485448',
  '11700:2616241604',
  '12000:3341705431',
  '12300:2621338004',
  '12600:3819867280',
  '12900:3478760772',
  '13200:3863082523',
  '13500:1386427063',
  '13800:711667869',
  '14100:2356350425',
  '14400:298855162',
  '14700:2083598733',
  '15000:2433732190',
  '15300:1628392934',
  '15600:739801518',
  '15900:607449195',
  '16200:3631895507',
  '16500:1048173752',
  '16800:4221643561',
  '17100:2943304411',
  '17400:151045919',
  '17700:672041303',
  '18000:2571372284',
  '18300:154555206',
  '18600:1485254289',
  '18900:1466643962',
  '19200:3151486036',
  '19500:3761290754',
  '19800:4078841118',
  '20100:1815107788',
  '20400:1044671945',
  '20700:1040835489',
  '21000:2480331260',
  '21300:3638009686',
  '21600:2413889427',
  '21900:943246476',
  '22200:3719568417',
  '22500:4024247684',
  '22800:3704713118',
  '23100:2859781922',
  '23400:1849164293',
  '23700:2130982698',
  '24000:42685541',
  '24300:1231084009',
  '24600:3170336097',
  '24900:2158734601',
  '25200:3698353994',
  '25500:2616380162',
  '25800:3216497688',
  '26100:2933356737',
  '26400:923937445',
  '26700:2992692357',
  '27000:3739970998',
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
