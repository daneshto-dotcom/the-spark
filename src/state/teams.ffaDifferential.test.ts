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
 * ⭐ Re-recorded S195 T22 (s195/fixes, integration tip 7624534 + the `lostToEntropy` counter): `matchStatsHashParts`
 * gained ONE inert part per seat (`:le{n}`), so every checkpoint's WIDE hash moved while the sim did not. Proof, three
 * recordings of this file on the same tree: pre-change md5 606b70d891e39cba12520c4eb9e44e62 (= the series below it
 * replaced); the change with the `:le` hash string removed, md5 606b70d8… (IDENTICAL — `applyEntropyTax` reads
 * `sampleBuilt` and writes a stat, nothing the sim reads); the full change, md5 45af2a1417ae8769c35ced2dce752c57 (this
 * series). 86 checkpoints, unchanged count.
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
  '300:3076153460',
  '600:2647859070',
  '900:3056497510',
  '1200:2399670767',
  '1500:2868904523',
  '1800:4374955',
  '2100:2548311886',
  '2400:3990941815',
  '2700:1494015130',
  '3000:2399266178',
  '3300:3512726789',
  '3600:2768964286',
  '3900:9257650',
  '4200:2074069457',
  '4500:2289472256',
  '4800:1823609339',
  '5100:2660071962',
  '5400:225361192',
  '5700:28238585',
  '6000:3995515886',
  '6300:2631661248',
  '6600:1047287188',
  '6900:374929357',
  '7200:2538422022',
  '7500:4080593853',
  '7800:2954314614',
  '8100:180685996',
  '8400:2403554606',
  '8700:38755533',
  '9000:3334638840',
  '9300:551441649',
  '9600:93178682',
  '9900:1389772599',
  '10200:298521113',
  '10500:1524254502',
  '10800:1674088709',
  '11100:2817836236',
  '11400:3092811499',
  '11700:3790695368',
  '12000:866832177',
  '12300:1081596979',
  '12600:1060753599',
  '12900:1414524378',
  '13200:1078843748',
  '13500:3773063005',
  '13800:2617726784',
  '14100:4147180817',
  '14400:1117804439',
  '14700:1879548876',
  '15000:235431176',
  '15300:908651226',
  '15600:4164789554',
  '15900:4127303887',
  '16200:1415310815',
  '16500:3507203106',
  '16800:4160928346',
  '17100:57576686',
  '17400:2893614280',
  '17700:2199936315',
  '18000:1038397150',
  '18300:1258063301',
  '18600:3111035563',
  '18900:3290025358',
  '19200:2261903972',
  '19500:491187038',
  '19800:593058528',
  '20100:4050791381',
  '20400:212414292',
  '20700:1431228623',
  '21000:4088666490',
  '21300:1934384385',
  '21600:4073532069',
  '21900:3201338377',
  '22200:3161433722',
  '22500:4200186561',
  '22800:472359885',
  '23100:4209031291',
  '23400:611089495',
  '23700:2071242553',
  '24000:121677218',
  '24300:3065408600',
  '24600:8674652',
  '24900:2922317316',
  '25200:3622221866',
  '25500:2210704642',
  '25800:1739295706',
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
