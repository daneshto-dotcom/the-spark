/**
 * SPARK — S68 P1 tests for formatStrategySummary.
 *
 * Covers every render arm of the lobby strategy-diagnostic strip:
 *   - disabled  → omitted
 *   - failed    → "name:fail"
 *   - starting  → "name:…"
 *   - ready w/ relays    → "name:ok/total"
 *   - ready w/ no relays → "name:✓"
 *   - multi-strategy     → space-joined, disabled dropped
 */
import { describe, expect, it } from 'vitest';
import { formatStrategySummary } from './strategySummary.ts';
import type { NetDiagnostics } from './transport.ts';

// Indexed-access into the (non-exported) diagnostic shapes so fixtures stay
// type-checked without re-exporting StrategyDiagnostic / RelayDiagnostic.
type Strategy = NetDiagnostics['strategies'][number];
type Relay = Strategy['relays'][number];

const relay = (url: string, connected: boolean): Relay => ({ url, connected });

const strat = (
  name: Strategy['name'],
  state: Strategy['state'],
  relays: Relay[] = [],
): Strategy => ({ name, state, peerCount: 0, relays, lastError: null });

describe('formatStrategySummary', () => {
  it('returns an empty string for no strategies', () => {
    expect(formatStrategySummary([])).toBe('');
  });

  it('omits disabled strategies', () => {
    expect(formatStrategySummary([strat('mqtt', 'disabled')])).toBe('');
  });

  it('renders a failed strategy as name:fail', () => {
    expect(formatStrategySummary([strat('torrent', 'failed')])).toBe(
      'torrent:fail',
    );
  });

  it('renders a starting strategy as name:… (U+2026 ellipsis)', () => {
    expect(formatStrategySummary([strat('nostr', 'starting')])).toBe('nostr:…');
  });

  it('renders a ready strategy as connected/total of its relays', () => {
    const s = strat('nostr', 'ready', [
      relay('wss://a', true),
      relay('wss://b', true),
      relay('wss://c', false),
    ]);
    expect(formatStrategySummary([s])).toBe('nostr:2/3');
  });

  it('counts zero connected relays as 0/total', () => {
    const s = strat('nostr', 'ready', [
      relay('wss://a', false),
      relay('wss://b', false),
    ]);
    expect(formatStrategySummary([s])).toBe('nostr:0/2');
  });

  it('renders a ready strategy with no relays as name:✓ (U+2713 check)', () => {
    expect(formatStrategySummary([strat('torrent', 'ready')])).toBe(
      'torrent:✓',
    );
  });

  it('space-joins multiple strategies and drops disabled ones', () => {
    const summary = formatStrategySummary([
      strat('nostr', 'ready', [relay('wss://a', true)]),
      strat('torrent', 'failed'),
      strat('mqtt', 'disabled'),
    ]);
    expect(summary).toBe('nostr:1/1 torrent:fail');
  });
});
