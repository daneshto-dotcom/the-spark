/**
 * SPARK — S189 (C5) MEASUREMENT INSTRUMENT: what a wave-5 board costs the host, on the CPU and on
 * the wire. Owner, S189: *"it was lagging at about wave five. I thought we fixed the lags"*.
 *
 * ⛔ OPT-IN, NOT A GATE. It drives a real four-seat bots match through `runHostTick` for ~45 000
 * ticks per pass (minutes of CPU), so it runs only with `SPARK_C5_MEASURE=1`:
 *
 *     SPARK_C5_MEASURE=1 npx vitest run src/net/c5WaveFiveMeasure.test.ts
 *
 * It prints numbers and asserts only anti-vacuity (the match really reached wave 5 with creatures on
 * the board). Its purpose is that the numbers in `S189_PROGRESS_net.md` are reproducible by anyone,
 * from the shipped code, rather than being Claude's word.
 *
 * Two passes, because the question the brief asked is about the draft BUFF:
 *   A · DEFAULT — every seat takes the deadline's pick (its race's perk where one exists — S188).
 *   B · ALL-HP  — every seat drafts HP at the opening draft, so every creature it spawns carries a
 *       buffed pool — the case where `Creature.maxEhp` rides the wire on every creature, damaged or not.
 */
import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { Session } from 'node:inspector';

import { BotManager } from '../bots/botManager.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from '../state/rng.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { applyNetSnapshot, netSnapshot, stripWirePrevPos, wireNumberReplacer } from '../state/save.ts';
import { asPlayerId } from '../types.ts';
import type { Controls } from '../input/controls.ts';
import { PLAYER_COLORS, FIGHT_PHASE_TICKS, PHASE_DURATION_TICKS } from '../constants.ts';
import { makeCreature, type CreatureType } from '../state/creatures/creature.ts';
import { CREATURE_CONFIGS } from '../state/creatures/voltkin-config.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { asCreatureId } from '../types.ts';

const MEASURE = process.env.SPARK_C5_MEASURE === '1';
const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
const WAVE_TICKS = PHASE_DURATION_TICKS + FIGHT_PHASE_TICKS;

function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function wireOf(world: World): string {
  const msg = { kind: 'NETSNAPSHOT' as const, snapshotSeq: 1, snapshot: netSnapshot(world) };
  return JSON.stringify(stripWirePrevPos(msg), wireNumberReplacer);
}

function pct(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
}

interface Bucket { host: number[]; bots: number[]; creatures: number[]; primitives: number[] }

/** Self + inclusive time by function over a V8 CPU profile — what DOMINATES a window, not a guess. */
function summarise(profile: { nodes: Array<{ id: number; callFrame: { functionName: string; url: string; lineNumber: number }; hitCount?: number; children?: number[] }>; samples: number[]; startTime: number; endTime: number }): void {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const totalHits = profile.nodes.reduce((a, n) => a + (n.hitCount ?? 0), 0);
  const usPerHit = (profile.endTime - profile.startTime) / Math.max(1, totalHits);
  const key = (n: (typeof profile.nodes)[number]): string =>
    `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`;
  const self = new Map<string, number>();
  for (const n of profile.nodes) self.set(key(n), (self.get(key(n)) ?? 0) + (n.hitCount ?? 0));
  const subtree = new Map<number, number>();
  const sub = (id: number): number => {
    const c = subtree.get(id);
    if (c !== undefined) return c;
    const n = byId.get(id)!;
    let t = n.hitCount ?? 0;
    for (const ch of n.children ?? []) t += sub(ch);
    subtree.set(id, t);
    return t;
  };
  const incl = new Map<string, number>();
  const walk = (id: number, onStack: Set<string>): void => {
    const n = byId.get(id)!;
    const k = key(n);
    const fresh = !onStack.has(k);
    if (fresh) { incl.set(k, (incl.get(k) ?? 0) + sub(id)); onStack.add(k); }
    for (const ch of n.children ?? []) walk(ch, onStack);
    if (fresh) onStack.delete(k);
  };
  walk(profile.nodes[0]!.id, new Set());
  const top = (m: Map<string, number>, n: number): string =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
      .map(([k, v]) => `    ${((100 * v) / totalHits).toFixed(1).padStart(5)} %  ${((v * usPerHit) / 1000).toFixed(0).padStart(6)} ms  ${k}`).join('\n');
  console.log(`  PROFILE: ${totalHits} samples, ${((profile.endTime - profile.startTime) / 1000).toFixed(0)} ms`);
  console.log('  top SELF:\n' + top(self, 25));
  console.log('  top INCLUSIVE:\n' + top(incl, 40));
}

/**
 * PASS C's lever: keep the board at `target` live creatures, spread evenly over the four seats, each
 * spawned at its own castle heading for the middle — the brother's S182 count (120) on a wave-5 board.
 * Inserted directly (the per-(owner,type) summon latch would refuse a burst) with a real factory, so
 * every one is a creature the sim treats normally.
 */
const TOPUP_TYPES: readonly CreatureType[] = ['goblinMelee', 'goblinArcher', 'goblinShield', 'goblinHound', 'raceUnit'];
function topUpCreatures(w: World, target: number): void {
  let i = 0;
  while (w.creatures.size < target) {
    const seat = i % 4;
    const type = TOPUP_TYPES[Math.floor(i / 4) % TOPUP_TYPES.length]!;
    const home = castleAnchor(seat, w.layout);
    const id = asCreatureId(w.nextCreatureId++);
    const c = makeCreature(CREATURE_CONFIGS[type], {
      id,
      ownerPlayerId: asPlayerId(seat),
      pos: { x: home.x + ((i * 7) % 40) - 20, y: home.y + ((i * 13) % 40) - 20 },
      targetPos: { x: 960, y: 540 },
      spawnedAtTick: w.tick,
      clock: w,
      draftPicks: w.players.get(asPlayerId(seat))?.draftPicks,
    });
    w.creatures.set(id, c);
    i++;
  }
}

function runPass(label: string, allHp: boolean, creatureTarget = 0): void {
  const w = makeWorld(0xb07);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: 'bots',
    isHost: true,
    roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s] })),
    botSeats: [1, 2, 3],
  });
  if (allHp) {
    for (const s of [0, 1, 2, 3]) dispatch(w, { type: 'CHOOSE_DRAFT', playerId: asPlayerId(s), pick: 'hp' });
  }
  const m = new BotManager(['HARD', 'IMBA', 'IMBA'], 0xbeef);
  const d = deps();
  const st = makeHostTickState(w);
  const buckets = new Map<string, Bucket>();
  const endTick = 5 * WAVE_TICKS; // the end of wave 5's FIGHT
  const wireSamples: Array<{ tick: number; wave: number; phase: string; bytes: number; creatures: number;
    prims: number; bonds: number; withMaxEhp: number; withEhp: number; maxEhpBytes: number; ehpBytes: number;
    sections: Record<string, number>; buildMs: number; applyMs: number }> = [];

  const session = new Session();
  session.connect();
  let profiling = false;
  let profile: Parameters<typeof summarise>[0] | null = null;
  while (w.tick < endTick && (w.gameState as string) === 'PLAYING') {
    if (creatureTarget > 0 && w.waveNumber === 5 && w.matchPhase === 'FIGHT' && w.tick % 60 === 0) {
      topUpCreatures(w, creatureTarget);
    }
    if ((!allHp || creatureTarget > 0) && !profiling && profile === null && w.waveNumber === 5 && w.matchPhase === 'FIGHT') {
      session.post('Profiler.enable');
      session.post('Profiler.setSamplingInterval', { interval: 200 });
      session.post('Profiler.start');
      profiling = true;
    }
    if (profiling && (w.tick >= 5 * WAVE_TICKS - 1 || w.tick >= 4 * WAVE_TICKS + PHASE_DURATION_TICKS + 2400)) {
      session.post('Profiler.stop', (err, res) => { if (!err) profile = res.profile as unknown as typeof profile; });
      profiling = false;
    }
    const key = `w${w.waveNumber}-${w.matchPhase}`;
    let b = buckets.get(key);
    if (b === undefined) buckets.set(key, (b = { host: [], bots: [], creatures: [], primitives: [] }));
    const t0 = performance.now();
    m.tick(w);
    const t1 = performance.now();
    runHostTick(w, d, st);
    const t2 = performance.now();
    b.bots.push(t1 - t0);
    b.host.push(t2 - t1);
    /*
     * ⛔ THE RENDERER'S WIPE, MODELLED. In the game `effectsRenderer.sync` empties `world.effects`
     * every render frame (1-3 ticks). Headless, nothing does, and the first run of this instrument
     * measured 22.8 KiB of "effects" on the wire at wave 5 that production never sends. Sampled
     * BEFORE the wipe below, so a sample still carries one tick's worth — what a frame sends.
     */
    if (!(w.waveNumber >= 4 && w.tick % 600 === 0)) w.effects.length = 0;
    b.creatures.push(w.creatures.size);
    b.primitives.push(w.primitives.size);

    if (w.waveNumber >= 4 && w.tick % 600 === 0) {
      const tb0 = performance.now();
      const json = wireOf(w);
      const tb1 = performance.now();
      const client = makeWorld(0);
      const ta0 = performance.now();
      applyNetSnapshot(JSON.parse(json).snapshot, client);
      const ta1 = performance.now();
      const snap = JSON.parse(json).snapshot as Record<string, unknown>;
      const sections: Record<string, number> = {};
      for (const [k, v] of Object.entries(snap)) sections[k] = JSON.stringify(v).length;
      const creatures = (snap.creatures ?? []) as Array<Record<string, unknown>>;
      let withMaxEhp = 0, withEhp = 0, maxEhpBytes = 0, ehpBytes = 0;
      for (const c of creatures) {
        if (c.maxEhp !== undefined) { withMaxEhp++; maxEhpBytes += `,"maxEhp":${JSON.stringify(c.maxEhp)}`.length; }
        if (c.ehp !== undefined) { withEhp++; ehpBytes += `,"ehp":${JSON.stringify(c.ehp)}`.length; }
      }
      w.effects.length = 0;
      wireSamples.push({
        tick: w.tick, wave: w.waveNumber, phase: w.matchPhase, bytes: json.length,
        creatures: creatures.length, prims: w.primitives.size, bonds: w.bonds.size,
        withMaxEhp, withEhp, maxEhpBytes, ehpBytes, sections,
        buildMs: tb1 - tb0, applyMs: ta1 - ta0,
      });
    }
  }

  if (profiling) {
    session.post('Profiler.stop', (err, res) => { if (!err) profile = res.profile as unknown as typeof profile; });
  }
  session.disconnect();
  console.log(`\n══════ C5 PASS ${label} — reached tick ${w.tick}, wave ${w.waveNumber} ${w.matchPhase}, state ${w.gameState}`);
  console.log('bucket          ticks  host mean  host p95  host max  bots mean  bots p95  creatures(max)  prims(max)');
  for (const [key, b] of buckets) {
    const mean = (xs: number[]): number => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);
    console.log(
      `${key.padEnd(14)} ${String(b.host.length).padStart(6)}  ${mean(b.host).toFixed(3).padStart(9)}  ${pct(b.host, 0.95).toFixed(3).padStart(8)}  ${Math.max(...b.host).toFixed(2).padStart(8)}  ${mean(b.bots).toFixed(3).padStart(9)}  ${pct(b.bots, 0.95).toFixed(3).padStart(8)}  ${String(Math.max(...b.creatures)).padStart(14)}  ${String(Math.max(...b.primitives)).padStart(10)}`,
    );
  }
  console.log('wire samples (NETSNAPSHOT as NetTransport.send serializes it):');
  for (const s of wireSamples) {
    const perCreature = s.creatures > 0 ? (s.sections.creatures ?? 0) / s.creatures : 0;
    console.log(
      `  t=${s.tick} w${s.wave} ${s.phase.padEnd(5)} ${(s.bytes / 1024).toFixed(1)} KiB  creatures ${s.creatures} (${perCreature.toFixed(0)} B each; maxEhp on ${s.withMaxEhp} = ${s.maxEhpBytes} B; ehp on ${s.withEhp} = ${s.ehpBytes} B)  prims ${s.prims} bonds ${s.bonds}  build+stringify ${s.buildMs.toFixed(2)} ms  parse+apply ${s.applyMs.toFixed(2)} ms`,
    );
    console.log(`      sections: ${Object.entries(s.sections).filter(([, v]) => v > 200).map(([k, v]) => `${k} ${(v / 1024).toFixed(1)}K`).join(' · ')}`);
  }
  if (profile !== null) summarise(profile);
  expect(w.waveNumber, 'the match reached wave 5').toBeGreaterThanOrEqual(5);
  expect(wireSamples.length).toBeGreaterThan(0);
}

describe.runIf(MEASURE)('S189 C5 — a wave-5 board, measured (opt-in)', () => {
  it('PASS A — default draft (bots take their racial)', () => {
    runPass('A default', false);
  }, 1_800_000);
  it('PASS B — every seat drafts HP (maxEhp on every creature)', () => {
    runPass('B all-HP', true);
  }, 1_800_000);
  it("PASS C — all-HP AND the brother's 120 creatures, held through wave 5's FIGHT", () => {
    runPass('C all-HP + 120 creatures', true, 120);
  }, 1_800_000);
});
