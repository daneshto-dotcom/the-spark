/**
 * SPARK — runtime diagnostic overlay (S23 P2).
 *
 * Toggleable via `?debug=1` URL param. Surfaces the 7 runtime gates + audio
 * chain wiring + live chain progress so the user can paste a snapshot at the
 * moment Voltkin SHOULD fire / SFX SHOULD play, and the root cause becomes
 * obvious from data alone (vs. screen-share or remote inspection).
 *
 * Position: fixed top-right, below the AUDIO settings panel. Monospace,
 * semi-transparent black. Always-on-top z-index:1001.
 *
 * Per-frame update via sync(world). Cheap — ~25 DOM writes per frame, all
 * static positions, no layout thrash.
 *
 * Click the panel to copy the full snapshot as text to the clipboard for
 * pasting into chat with Claude.
 */

import { inspectAudioChain, type AudioChainSnapshot } from './audioManager.ts';
import { listRecipes } from '../state/godlyRecipes/index.ts';
import { findLongestVoltkinPartial } from '../state/godlyRecipes/voltkin.ts';
import { SparkType } from '../constants.ts';
import type { World } from '../state/world.ts';
import { computePlayerComplexity, computeTerritorialRadius } from '../state/territory.ts';

export interface DebugOverlayHandle {
  sync(world: World, runtimeProbes: RuntimeProbes): void;
  destroy(): void;
}

/** Runtime probe values populated by main.ts (closure variables it owns). */
export interface RuntimeProbes {
  /** Last tick at which runGodlyMatcher was called. -1 if never. */
  lastMatcherTick: number;
  /** Last tick at which a BOND_FORMED effect was observed in world.effects. */
  lastBondFormedTick: number;
  /** Count of BOND_FORMED effects observed this session. */
  bondFormedCount: number;
  /** True if findGodlyMatch has ever returned non-null this session. */
  matcherFiredEver: boolean;
}

export function isDebugMode(): boolean {
  try {
    return typeof window !== 'undefined'
      && window.location !== undefined
      && window.location.search.includes('debug=1');
  } catch {
    return false;
  }
}

export function createDebugOverlay(): DebugOverlayHandle {
  const root = document.createElement('div');
  root.style.position = 'fixed';
  root.style.top = '230px';
  root.style.right = '24px';
  root.style.zIndex = '1001';
  root.style.fontFamily = 'monospace';
  root.style.fontSize = '11px';
  root.style.lineHeight = '1.4';
  root.style.color = '#ffffff';
  root.style.background = 'rgba(0, 0, 0, 0.85)';
  root.style.border = '1px solid #ff3b3b';
  root.style.borderRadius = '6px';
  root.style.padding = '10px 12px';
  root.style.minWidth = '320px';
  root.style.maxWidth = '420px';
  root.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.5)';
  root.style.cursor = 'pointer';
  root.title = 'click to copy snapshot to clipboard';

  const title = document.createElement('div');
  title.textContent = 'DEBUG  (click to copy)';
  title.style.color = '#ff3b3b';
  title.style.letterSpacing = '0.2em';
  title.style.marginBottom = '6px';
  title.style.borderBottom = '1px solid rgba(255, 59, 59, 0.3)';
  title.style.paddingBottom = '4px';
  root.appendChild(title);

  const body = document.createElement('pre');
  body.style.margin = '0';
  body.style.whiteSpace = 'pre-wrap';
  body.style.fontFamily = 'monospace';
  body.style.fontSize = '11px';
  body.style.color = '#ffffff';
  root.appendChild(body);

  document.body.appendChild(root);

  let lastSnapshotText = '';

  function render(world: World, probes: RuntimeProbes): string {
    const audio = inspectAudioChain();
    const recipes = listRecipes();
    const recipeIds = recipes.map((r) => r.id).join(',') || '(EMPTY)';

    // Count squares + triangles in world.
    let sqCount = 0;
    let trCount = 0;
    for (const p of world.primitives.values()) {
      if (p.type === SparkType.Square) sqCount++;
      else if (p.type === SparkType.Triangle) trCount++;
    }
    const longest = findLongestVoltkinPartial(world);

    // Build per-player cooldown summary.
    const playerLines: string[] = [];
    for (const p of world.players.values()) {
      const cd = p.godlyCooldownEndsAtTick === null
        ? 'none'
        : `${p.godlyCooldownEndsAtTick}t${p.godlyCooldownEndsAtTick > world.tick ? ' (ACTIVE)' : ''}`;
      playerLines.push(
        `  P${p.id}: color=0x${p.color.toString(16).padStart(6, '0')} cd=${cd} kind=${p.kind}`,
      );
    }

    const matcherWillRun = world.isHost
      && world.gameState === 'PLAYING'
      && world.activeCinematicPlayerId === null;

    const matcherReasons: string[] = [];
    if (!world.isHost) matcherReasons.push('!isHost');
    if (world.gameState !== 'PLAYING') matcherReasons.push(`gameState=${world.gameState}`);
    if (world.activeCinematicPlayerId !== null) {
      matcherReasons.push(`cinematic=${world.activeCinematicPlayerId}`);
    }

    // S25 P0 — creatures section (Voltkin Phase 2A scaffold). Lists every live
    // creature so the user can paste a snapshot at SPAWN, mid-life, and DESPAWN
    // moments + verify lifecycle.
    const creatureLines: string[] = [];
    for (const c of world.creatures.values()) {
      const ticksLeft = Math.max(0, c.despawnAtTick - world.tick);
      creatureLines.push(
        `  C${c.id}: type=${c.type} owner=P${c.ownerPlayerId} state=${c.state} `
        + `pos=(${c.pos.x.toFixed(1)},${c.pos.y.toFixed(1)}) `
        + `ticksInState=${c.ticksInState} ticksLeft=${ticksLeft}`,
      );
    }

    // S48 P3 (Sym A diagnostic) — surface per-reason intent rejection
    // counters. raceRejects is the legacy aggregate; rejectReasons is the
    // new bucket breakdown. Helps pinpoint silent-drop paths in live 2-peer
    // smoke (e.g. "joiner LMB doesn't place" → check pickupReachFail).
    const rr = world.diagnostics.rejectReasons;

    // S49 P1 (Sym F) — per-player territory diagnostics.
    const territoryLines: string[] = [];
    for (const [pid, player] of world.players) {
      const complexity = computePlayerComplexity(pid, world);
      const R = computeTerritorialRadius(pid, world);
      const shrink = player.territorialShrinkUntilTick !== null && world.tick < player.territorialShrinkUntilTick
        ? `shrink until t${player.territorialShrinkUntilTick} (${player.territorialShrinkUntilTick - world.tick}t left)`
        : 'none';
      territoryLines.push(
        `  P${pid}: complexity=${complexity.toFixed(1)}  R=${R.toFixed(1)}  shrink=${shrink}`,
      );
    }

    return [
      `=== GAME STATE ===`,
      `tick:           ${world.tick}`,
      `gameState:      ${world.gameState}`,
      `gameMode:       ${world.gameMode}`,
      `isHost:         ${world.isHost}`,
      `cinematicActive: ${world.activeCinematicPlayerId ?? 'null'}`,
      ``,
      `=== INTENT REJECTS (S48 P3) ===`,
      `raceRejects (sum):     ${world.diagnostics.raceRejects}`,
      `  pickupPosShape:      ${rr.pickupPosShape}`,
      `  pickupSparkNotFree:  ${rr.pickupSparkNotFree}`,
      `  pickupReachFail:     ${rr.pickupReachFail}`,
      `  pickupPoopedTooFar:  ${rr.pickupPoopedTooFar}`,
      `  placeTargetMissing:  ${rr.placeTargetMissing}`,
      `  actorBenched:        ${rr.actorBenched}`,
      `  territoryBlock:      ${world.diagnostics.territoryBlockRejects}`,
      ``,
      `=== TERRITORY (S49 Sym F) ===`,
      ...territoryLines,
      ``,
      `=== GODLY MATCHER ===`,
      `WILL_RUN:       ${matcherWillRun}${matcherReasons.length ? ` (BLOCKED: ${matcherReasons.join(', ')})` : ''}`,
      `recipes:        [${recipeIds}]`,
      `lastMatcherTick: ${probes.lastMatcherTick}`,
      `firedEver:      ${probes.matcherFiredEver}`,
      ``,
      `=== BOND_FORMED FLOW ===`,
      `lastTick:       ${probes.lastBondFormedTick}`,
      `total seen:     ${probes.bondFormedCount}`,
      `currentBondsInWorld: ${world.bonds.size}`,
      ``,
      `=== VOLTKIN CHAIN PROGRESS ===`,
      `squares in world:   ${sqCount}`,
      `triangles in world: ${trCount}`,
      `longest partial:    ${longest}/8  ${longest === 8 ? '<-- READY' : ''}`,
      ``,
      `=== PLAYERS ===`,
      ...playerLines,
      ``,
      `=== CREATURES ===`,
      `count:          ${world.creatures.size}`,
      ...creatureLines,
      ``,
      `=== AUDIO ===`,
      `ctxState:       ${audio.contextState}${audio.contextState === 'running' ? '' : '  !!!'}`,
      `master.gain:    ${fmt(audio.masterGainValue)}`,
      `music.gain:     ${fmt(audio.musicGainValue)}`,
      `sfx.gain:       ${fmt(audio.sfxGainValue)}`,
      `musicSource:    ${audio.musicSourceActive ? 'PLAYING' : 'stopped'}`,
      `clave calls:    total=${audio.claveCallsTotal}  synthed=${audio.claveCallsSynthed}`,
      `fart  calls:    total=${audio.fartCallsTotal}  synthed=${audio.fartCallsSynthed}`,
      ``,
      `=== LOCALSTORAGE ===`,
      audioStorageLine(audio),
    ].join('\n');
  }

  root.addEventListener('click', () => {
    if (lastSnapshotText.length === 0) return;
    void writeToClipboard(lastSnapshotText);
    const orig = title.textContent;
    title.textContent = 'COPIED ✓';
    setTimeout(() => { title.textContent = orig; }, 1200);
  });

  return {
    sync(world, probes) {
      lastSnapshotText = render(world, probes);
      body.textContent = lastSnapshotText;
    },
    destroy() {
      if (root.parentNode !== null) root.parentNode.removeChild(root);
    },
  };
}

function fmt(n: number | null): string {
  if (n === null) return 'null';
  return n.toFixed(3);
}

function audioStorageLine(a: AudioChainSnapshot): string {
  const s = a.storageKeys;
  return [
    `  spark_audio_muted:  ${s.masterMuted ?? '(unset)'}`,
    `  audio.musicMuted:   ${s.musicMuted ?? '(unset)'}`,
    `  audio.sfxMuted:     ${s.sfxMuted ?? '(unset)'}`,
    `  audio.musicVolume:  ${s.musicVolume ?? '(unset)'}`,
    `  audio.sfxVolume:    ${s.sfxVolume ?? '(unset)'}`,
  ].join('\n');
}

async function writeToClipboard(text: string): Promise<void> {
  try {
    if (navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch { /* fallthrough to textarea hack */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch { /* ignore */ }
  document.body.removeChild(ta);
}
