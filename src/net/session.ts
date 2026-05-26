/**
 * SPARK — NetSession state holder + teardown.
 *
 * Extracted from main.ts in S50 P2 (Council Battle Ledger C2 + C3 ADOPT
 * NetSession state holder pattern over factory closures + mutable record).
 * The four mutable network-related closure variables (netTransport,
 * hostSync, clientSync, lastSnapshotTick) are unified under a single
 * shape so the lobby callback factories + per-tick snapshot loop share
 * one identity-preserving reference.
 *
 * PRIME-AUDIT Δ1 invariant: handlers MUST read `session.netTransport`
 * per-invocation (not capture at factory creation), so that reconnects
 * (transport disposed in teardownNet then re-created in onHostStart/
 * onJoinAttempt) are observed by any later messages routed through the
 * same handler closure.
 */

import { ClientSync, HostSync } from './sync.ts';
import { NetTransport } from './transport.ts';
import type { Controls } from '../input/controls.ts';
import { triggerReset as triggerAudioCursorReset } from '../state/audioCursor.ts';
import type { World } from '../state/world.ts';
import type { PlayerId } from '../types.ts';

export interface NetSession {
  netTransport: NetTransport | null;
  hostSync: HostSync | null;
  clientSync: ClientSync | null;
  /** Last tick at which the host emitted a NETSNAPSHOT. 0 = none yet. */
  lastSnapshotTick: number;
}

export function makeNetSession(): NetSession {
  return {
    netTransport: null,
    hostSync: null,
    clientSync: null,
    lastSnapshotTick: 0,
  };
}

/**
 * Teardown the active net session. Called from RETURN_TO_TITLE paths:
 * onBackToTitle (lobby Back), onReturnFromConnectionLost (peer-drop),
 * resetIfPostgame (POSTGAME → TITLE).
 *
 * Audit Pass 1 fix 3c8630d7 (Δ4 carry-forward) + Pass 2 refactor 622a7c7f:
 * every production RTT path calls teardownNet first, so firing the cursor
 * reset here covers the full lifecycle. Pre-Pass-2 this was a direct
 * `resetAudioDrainCursor()` call (state→render dep edge — Pass-1 fix);
 * post-Pass-2 it routes through the state-layer publisher, which dispatches
 * to audioManager's registered handler. Without this, after a postgame→
 * TITLE round-trip and a fresh PLAYING entry, audio cues whose `effect.tick`
 * straddles the cursor's prior maximum silently drop (latent since S18 P1
 * introduced the cursor pattern).
 */
export function teardownNet(
  session: NetSession,
  world: World,
  controls: Controls,
  defaultPlayerId: PlayerId,
): void {
  if (session.netTransport !== null) {
    session.netTransport.disconnect();
    session.netTransport = null;
  }
  session.hostSync = null;
  if (session.clientSync !== null) {
    session.clientSync.reset();
    session.clientSync = null;
  }
  controls.setPlayerId(defaultPlayerId);
  world.isHost = true;
  session.lastSnapshotTick = 0;
  triggerAudioCursorReset();
}
