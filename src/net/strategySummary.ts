/**
 * SPARK — S68 P1: lobby strategy-diagnostic summary formatter.
 *
 * Extracted (Council-deferred from S67 P2) from the two byte-identical inline
 * blocks in main.ts — the joiner-side strip and the host-side strip of the
 * lobby wire-diagnostics — so the multi-strategy health string is defined once
 * and unit-tested. Pure function, no side effects.
 *
 * DEV/lobby diagnostic ONLY — non-gameplay, non-wire. Surfaces the S44
 * multi-strategy connection health (Council G-NEW-2 / GE-NEW-2):
 *   - "nostr:6/7"   — 6 of 7 relays connected
 *   - "torrent:fail" — strategy failed
 *   - "nostr:…"      — strategy still starting
 *   - "nostr:✓"      — ready with no relay list (e.g. torrent)
 * Disabled strategies are omitted from the strip; entries are space-joined.
 *
 * The param is typed as the indexed-access `NetDiagnostics['strategies']` so
 * the non-exported `StrategyDiagnostic` interface stays internal to
 * transport.ts (no re-export, no knip regression).
 */
import type { NetDiagnostics } from './transport.ts';

export function formatStrategySummary(
  strategies: NetDiagnostics['strategies'],
): string {
  return strategies
    .filter((s) => s.state !== 'disabled')
    .map((s) => {
      if (s.state === 'failed') return `${s.name}:fail`;
      if (s.state === 'starting') return `${s.name}:…`;
      const ok = s.relays.filter((r) => r.connected).length;
      const total = s.relays.length;
      return total > 0 ? `${s.name}:${ok}/${total}` : `${s.name}:✓`;
    })
    .join(' ');
}
