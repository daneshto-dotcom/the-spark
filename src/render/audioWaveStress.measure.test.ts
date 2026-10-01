/**
 * SPARK — S192 T15 (H2): HOW MANY SFX DOES A REAL WAVE-8 FIGHT ASK FOR? Measured, opt-in.
 *
 * The real four-seat bots match on the real host tick (`c5WaveFiveBoard.fixtures.ts`), driven to wave
 * `SPARK_AUDIO_STRESS_WAVE` (default 8 — the owner's wave), its FIGHT held at `SPARK_AUDIO_STRESS_N`
 * creatures (default 120, the brother's S182 count). Every tick's `world.effects` is fed to the REAL
 * `drainAudioEffects` on the fake bus, the context clock advanced 1/60 s per tick, and the renderer's
 * wipe modelled. Reports, per FIGHT: the worst tick's audible effects, and the peak live voices and
 * source nodes with the cap ON vs OFF (two identical worlds — the sim never reads audio, so they stay
 * identical, which the final hash compare re-proves).
 *
 * ⚠ It measures the EFFECT-DRIVEN SFX only (clave, fart, crackle, gnaw-final, charge, boom). The
 * renderer-driven ones (splat, zap-burst, laser, slap, the chewing rasp) fire from render watchers
 * this headless run has no renderer for — so the real peak is HIGHER than this, never lower.
 *
 *     SPARK_AUDIO_STRESS=1 npx vitest run src/render/audioWaveStress.measure.test.ts
 */
import { afterAll, describe, expect, it } from 'vitest';

import { runHostTick } from '../state/hostTick.ts';
import { hashWorldState } from '../state/stateHash.ts';
import { fightStartTick, startC5Match, topUpCreatures, WAVE_TICKS, type C5Match } from '../state/c5WaveFiveBoard.fixtures.ts';
import {
  _resetAudioForTest, drainAudioEffects, getAudioDebugApi, initAudio, inspectAudioChain,
  playLaserSFX, playSlapSFX, playSplatSFX, playZapBurstSFX,
} from './audioManager.ts';
import { PHASE_DURATION_TICKS } from '../constants.ts';
import { installFakeAudio, flushAudio, type FakeAudioEnv } from './audioFakeContext.fixtures.ts';

const MEASURE = process.env.SPARK_AUDIO_STRESS === '1';
/*
 * ⚠ MEASURED: this fixed-seed bots match ENDS IN A WIN AT TICK 61 522 (wave 7) — it never reaches wave 8.
 * So the window opens at wave `SPARK_AUDIO_STRESS_WAVE` (default 5, the owner's earlier lag report) and
 * runs until the match ends, holding every FIGHT in it at N creatures: waves 5–7, the deepest this
 * board reaches, as the stand-in for his wave 8.
 */
const WAVE = Number(process.env.SPARK_AUDIO_STRESS_WAVE ?? 5);
const N = Number(process.env.SPARK_AUDIO_STRESS_N ?? 120);
const AUDIBLE = new Set(['BOND_FORMED', 'BOND_SEVERED', 'CREATURE_CHARGE', 'BOMB_EXPLODE']);

interface Run { kindsSeen: string; endTick: number; endWave: number; endState: string; fightTicks: number; rendererEvents: number; worstTickEffects: number; worstTick: number; peakVoices: number; peakNodes: number; dropped: number; hash: string }

async function run(capOn: boolean, env: FakeAudioEnv): Promise<Run> {
  _resetAudioForTest();
  initAudio();
  getAudioDebugApi().setVoiceCap(capOn);
  const m: C5Match = startC5Match(true);
  const w = m.world;
  const measureFrom = fightStartTick(WAVE) - PHASE_DURATION_TICKS; // the wave's BUILD too: bots stamp claves there
  const fightEnd = (WAVE + 4) * WAVE_TICKS;
  let worstTickEffects = 0;
  let worstTick = -1;
  let peakNodes = 0;
  // Voices are counted by the ledger when ON; with the cap OFF the ledger books nothing, so count the
  // nodes the bus actually built inside a 0.45 s (the longest effect SFX) sliding window instead.
  const nodeStarts: number[] = [];
  let fightTicks = 0;
  let rendererEvents = 0;
  const kinds = new Set<string>();
  /*
   * THE RENDER WATCHERS, MODELLED (upper bound: fog ignored). turretRenderer → laser on a FIRE edge;
   * princessRenderer → slap on a FIRE edge; chewerRenderer → splat when a chewer vanishes from a live
   * state; creatureRenderer → zap-burst when a Voltkin / lightning drone does.
   */
  const prevDef = new Map<unknown, string>();
  const prevCre = new Map<unknown, { type: string; state: string; pos: { x: number; y: number } }>();
  while (w.tick < fightEnd && w.gameState === 'PLAYING') {
    if (w.tick % 500 === 0) await new Promise<void>((r) => setImmediate(r));
    if (w.tick >= measureFrom && w.matchPhase === 'FIGHT' && w.tick % 60 === 0) topUpCreatures(w, N);
    m.bots.tick(w);
    runHostTick(w, m.deps, m.state);
    if (w.tick >= measureFrom) {
      fightTicks += 1;
      const t = w.tick / 60;
      env.setTime(t);
      const before = env.sources.length;
      let audible = w.effects.filter((e) => AUDIBLE.has(e.kind)).length;
      drainAudioEffects(w.effects, w.tick);
      for (const d of w.defenders.values()) {
        if (d.state === 'FIRE' && prevDef.get(d.id) !== 'FIRE') {
          if (d.kind === 'turret') { void playLaserSFX(d.pos); audible += 1; rendererEvents += 1; }
          if (d.kind === 'princess') { void playSlapSFX(d.pos); audible += 1; rendererEvents += 1; }
        }
      }
      for (const [id, c] of prevCre) {
        if (w.creatures.has(id as never) || c.state === 'DESPAWNING') continue;
        if (c.type === 'chewer') { void playSplatSFX(c.pos); audible += 1; rendererEvents += 1; }
        if (c.type === 'voltkin' || c.type === 'lightningDrone') { void playZapBurstSFX(c.pos); audible += 1; rendererEvents += 1; }
      }
      if (audible > worstTickEffects) { worstTickEffects = audible; worstTick = w.tick; }
      if (audible > 0) await flushAudio();
      for (let i = before; i < env.sources.length; i++) nodeStarts.push(t);
      while (nodeStarts.length > 0 && nodeStarts[0]! <= t - 0.45) nodeStarts.shift();
      if (nodeStarts.length > peakNodes) peakNodes = nodeStarts.length;
    }
    w.effects.length = 0; // the renderer's per-frame wipe, modelled
    if (w.tick >= measureFrom) { for (const d of w.defenders.values()) kinds.add(`def:${d.kind}`); for (const c of w.creatures.values()) kinds.add(c.type); }
    prevDef.clear();
    for (const d of w.defenders.values()) prevDef.set(d.id, d.state);
    prevCre.clear();
    for (const c of w.creatures.values()) prevCre.set(c.id, { type: c.type, state: c.state, pos: { x: c.pos.x, y: c.pos.y } });
  }
  const a = inspectAudioChain();
  return {
    kindsSeen: [...kinds].sort().join(','),
    endTick: w.tick, endWave: w.waveNumber, endState: String(w.gameState), fightTicks, rendererEvents,
    worstTickEffects, worstTick, peakVoices: a.sfxVoices.peakLive, peakNodes,
    dropped: a.sfxVoices.droppedGlobal + Object.values(a.sfxVoices.droppedByKind).reduce((x, y) => x + (y ?? 0), 0),
    hash: String(hashWorldState(w)),
  };
}

describe.runIf(MEASURE)(`S192 T15 — SFX demand of real fights from wave ${WAVE} to the end, at ${N} creatures (opt-in)`, () => {
  let env: FakeAudioEnv;
  afterAll(() => { _resetAudioForTest(); env?.restore(); });

  it('measures cap OFF vs cap ON on identical worlds', async () => {
    env = installFakeAudio();
    const off = await run(false, env);
    env.restore();
    env = installFakeAudio();
    const on = await run(true, env);
    console.log(`[S192 audio stress] waves ${WAVE}+, ${N} creatures — cap OFF: ${JSON.stringify(off)}`);
    console.log(`[S192 audio stress] waves ${WAVE}+, ${N} creatures — cap ON:  ${JSON.stringify(on)}`);
    expect(on.hash).toBe(off.hash); // the sim never reads audio
    expect(on.peakVoices).toBeLessThanOrEqual(32);
  }, 1_800_000);
});
