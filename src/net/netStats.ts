/**
 * SPARK — S182 STEP 0: net bandwidth + snapshot-arrival instrumentation.
 *
 * ## WHY THIS EXISTS
 *
 * The owner's brother could not play past wave 5: *"He already built a lot of towers … nothing was
 * moving, barely. Every five seconds the characters moved. I saw it perfectly fine."*
 *
 * "Every five seconds" is ~0.2 Hz of DISCRETE JUMPS, which is the signature of snapshot ARRIVAL
 * RATE, not frame rate. A joiner runs no simulation — 100% of entity motion comes from
 * `applyNetSnapshot`, and between arrivals `ClientSync.pickBracket` clamps to the newest buffered
 * snapshot with `t=0`, so the board freezes and then snaps. Frame rate can be a perfect 60 while
 * the board is stationary.
 *
 * `transport.ts`'s own docblock predicted this in S44 and the action never followed:
 *   *"the 10 Hz snapshot cadence is a CAP, not a delivered rate: this repo has measured it
 *   collapsing to 2.2 Hz under a TD-heavy sim, below what the 150 ms render-delay buffer needs."*
 *
 * ⭐ THIS MODULE IS THE MEASUREMENT THAT DECIDES THE FIX. One reading from one real match falsifies
 * or confirms the whole diagnosis before a single byte of wire format is touched. Guessing wrong
 * about WHICH of the three candidate causes is live (payload size · double-send · host CPU) costs
 * the whole branch.
 *
 * ## THE THREE NUMBERS AND WHAT EACH ONE DECIDES
 *
 *   1. **`net out` (host)** — is the host's uplink saturated? The prediction is ~8.8 Mbit/s at the
 *      brother's wave-5 board, which no ordinary consumer uplink carries.
 *   2. **`snap rx` + `snap gap` (joiner)** — is the peer STARVED or merely slow? Starved means a low
 *      accept rate with long gaps while FPS stays high. This is the number that matches the video.
 *   3. **`dup` (joiner)** — ⭐ THE DOUBLE-SEND, MEASURED DIRECTLY. `iceConfig.ts` has BOTH `nostr`
 *      and `torrent` on, and `transport.send` loops every ready strategy, so every snapshot goes out
 *      twice over two independent RTCPeerConnections to the same machine. The joiner `JSON.parse`s
 *      both and drops the second on the seq gate (`ClientSync.receive`). **If `dup ≈ accepted`, the
 *      doubling is confirmed empirically and Lever 1 is worth ~50% of all bytes.** If `dup ≈ 0`, one
 *      strategy never carried a peer and Lever 1 buys nothing — which would be worth knowing BEFORE
 *      trading away connectivity redundancy the owner deliberately paid for in S157/S162.
 *
 * ## ⛔ WHY THIS SHIPS IN THE PRODUCTION BUNDLE, RATHER THAN BEHIND `import.meta.env.DEV`
 *
 * The measurement can only be taken in the match that exhibits the bug, and that match is played by
 * two people on **spark-online.space** — a production build. `import.meta.env.DEV` is tree-shaken
 * from that build, so a DEV-gated counter would be structurally incapable of producing the reading
 * Step 0 exists to produce. The seam used instead is the one this repo ALREADY ships to production
 * for exactly this purpose: a URL parameter (`?debug=1`, `main.ts`'s debug-overlay gate).
 *
 * The cost of shipping it is bounded by construction:
 *   • disabled is the default, and every call site tests `netStats.isEnabled()` BEFORE evaluating
 *     its arguments — so a normal build pays one predictable-branch boolean read per send/receive
 *     (~20/sec at `NET_SNAPSHOT_HZ`), and never calls `performance.now()`;
 *   • nothing here allocates on the hot path, and nothing here is reachable from the simulation.
 *
 * ## MEASUREMENT HONESTY
 *
 * ⚠ **Sizes are UTF-16 code units (`String.length`), not bytes.** For this payload — JSON of ASCII
 * keys and numbers — the two are equal to within a fraction of a percent, and the brief's own
 * per-entity figures were derived the same way, so the numbers are directly comparable. The exact
 * alternative (`TextEncoder().encode(s).length`) would allocate a ~100 KiB Uint8Array per send per
 * strategy at 10 Hz — ~2 MiB/s of garbage on the host that is already the bottleneck, i.e. the
 * instrument would perturb the thing it measures. Labelled `≈` everywhere it is displayed.
 *
 * ⚠ This counts what the app hands to Trystero, NOT what leaves the NIC. It excludes WebRTC/DTLS/SCTP
 * framing and any chunking Trystero applies, so true wire cost is somewhat HIGHER than reported.
 * Reported figures are therefore a floor, never an overstatement.
 *
 * ## DETERMINISM
 *
 * `now` is an explicit parameter on every record call — there is no wall clock inside this module.
 * It is not reachable from the sim (no import from `state/`), and it is deterministically testable.
 */

/** Rolling window over which per-second rates are averaged. */
const WINDOW_MS = 1000;

/** One strategy's outbound rate, for the per-strategy breakdown. */
export interface StrategyOutReading {
  readonly name: string;
  readonly bytesPerSec: number;
}

/** A point-in-time read of every counter. All sizes are ≈bytes (see the module docblock). */
export interface NetStatsReading {
  readonly enabled: boolean;
  /** Outbound ≈bytes/sec summed across strategies — this peer's application-level upload. */
  readonly outBytesPerSec: number;
  /** Per-strategy outbound ≈bytes/sec, in strategy-start order. Two near-equal rows = the double-send. */
  readonly outByStrategy: ReadonlyArray<StrategyOutReading>;
  /** Inbound ≈bytes/sec at the transport receive boundary — PRE-dedup, so it counts both copies. */
  readonly inBytesPerSec: number;
  /** NETSNAPSHOT envelopes SENT per second (host side). The 10 Hz cap, as actually delivered. */
  readonly snapTxPerSec: number;
  /** ≈size of the most recent NETSNAPSHOT envelope sent (host side). */
  readonly snapTxBytes: number;
  /** NETSNAPSHOT envelopes ACCEPTED per second (joiner side). ⭐ THE STARVATION NUMBER. */
  readonly snapRxPerSec: number;
  /** NETSNAPSHOTs dropped by the SEQ gate per second (joiner side). ⭐ THE DOUBLE-SEND, MEASURED. */
  readonly snapDupPerSec: number;
  /** NETSNAPSHOTs dropped by the EPOCH gate per second — a deposed host, never a duplicate. */
  readonly snapEpochDropPerSec: number;
  /** Cumulative accepted snapshots since the counter was enabled. */
  readonly acceptedTotal: number;
  /** Cumulative SEQ-gate drops since the counter was enabled. */
  readonly dupTotal: number;
  /** Cumulative EPOCH-gate drops since the counter was enabled. */
  readonly epochDropTotal: number;
  /**
   * ⭐ MILLISECONDS SINCE THE LAST ACCEPTED SNAPSHOT, LIVE. −1 before the first one arrives.
   *
   * ⛔ THIS IS THE ONE READING THAT SHOWS A FREEZE **WHILE IT IS HAPPENING**, and the first cut of
   * this instrument did not have it. Every other gap field — `gapLastMs`, `gapAvgMs`, `gapMaxMs` —
   * is written inside `recordSnapshotAccepted`, so during a stall NOTHING MOVES: the display holds
   * whatever it showed when the last snapshot landed and looks merely stale, not broken. A 4-second
   * freeze is indistinguishable from a paused game until the snapshot that ENDS it finally arrives
   * and retroactively reveals the gap.
   *
   * The owner's brother was frozen for ~5 seconds at a time. This field counts up in real time
   * while that is happening, which is exactly the evidence his video could not carry.
   */
  readonly msSinceLastAcceptMs: number;
  /** Gap between the two most recent ACCEPTED snapshots, ms. */
  readonly gapLastMs: number;
  /** Mean accepted-snapshot gap over the current window, ms. */
  readonly gapAvgMs: number;
  /** Worst accepted-snapshot gap since enable, ms. ⭐ The "every five seconds" number. */
  readonly gapMaxMs: number;
}

/**
 * The counters. A module singleton (`netStats`) is what the call sites use; the class is exported
 * so tests can drive an isolated instance without cross-test bleed.
 */
export class NetStats {
  private enabled = false;

  // --- rolling window ---
  private windowStartMs = 0;
  private windowOpen = false;

  // --- accumulators (reset each window) ---
  private outAcc = 0;
  private readonly outByStrategyAcc = new Map<string, number>();
  private inAcc = 0;
  private snapTxAcc = 0;
  private snapRxAcc = 0;
  private snapDupAcc = 0;
  private snapEpochAcc = 0;
  private gapSumMs = 0;
  private gapCount = 0;

  // --- last closed window's rates ---
  private outRate = 0;
  private readonly outByStrategyRate = new Map<string, number>();
  private inRate = 0;
  private snapTxRate = 0;
  private snapRxRate = 0;
  private snapDupRate = 0;
  private snapEpochRate = 0;
  private gapAvgMs = 0;

  // --- session-cumulative / last-value state ---
  private snapTxBytes = 0;
  private acceptedTotal = 0;
  private dupTotal = 0;
  /** Snapshots refused by the EPOCH gate (a deposed host) — kept apart from `dupTotal`. */
  private epochDropTotal = 0;
  private lastAcceptMs = 0;
  /**
   * Whether `lastAcceptMs` holds a real timestamp yet.
   *
   * ⚠ AN EXPLICIT FLAG, NOT `lastAcceptMs > 0`. Zero is a perfectly legal reading — `performance.now()`
   * is relative to time origin, and every test clock starts there — so the obvious sentinel silently
   * swallows the gap after an accept recorded at t=0. Caught by the "5 s stall" test, which is exactly
   * the measurement this whole branch exists to take.
   */
  private hasAccepted = false;
  private gapLastMs = 0;
  private gapMaxMs = 0;

  /**
   * Turn the counters on. Idempotent, and zeroes every accumulator so a mid-match re-enable reads
   * a clean window rather than one polluted by whatever was already there.
   */
  enable(): void {
    this.enabled = true;
    this.reset();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Zero every counter. Exposed for A-B probing mid-match (`__SPARK__.netStats.reset()`). */
  reset(): void {
    this.windowOpen = false;
    this.windowStartMs = 0;
    this.outAcc = 0;
    this.outByStrategyAcc.clear();
    this.inAcc = 0;
    this.snapTxAcc = 0;
    this.snapRxAcc = 0;
    this.snapDupAcc = 0;
    this.snapEpochAcc = 0;
    this.gapSumMs = 0;
    this.gapCount = 0;
    this.outRate = 0;
    this.outByStrategyRate.clear();
    this.inRate = 0;
    this.snapTxRate = 0;
    this.snapRxRate = 0;
    this.snapDupRate = 0;
    this.snapEpochRate = 0;
    this.gapAvgMs = 0;
    this.snapTxBytes = 0;
    this.acceptedTotal = 0;
    this.dupTotal = 0;
    this.epochDropTotal = 0;
    this.lastAcceptMs = 0;
    this.hasAccepted = false;
    this.gapLastMs = 0;
    this.gapMaxMs = 0;
  }

  /**
   * Close the current window into rates if it has run long enough, and open the next one.
   *
   * Called from every record path AND from `read()`. The `read()` call is what makes a STALL read
   * correctly: when traffic stops entirely nothing records, and without a read-side roll the last
   * healthy rate would sit frozen on screen — showing 10 Hz while the board is visibly stuck, which
   * is precisely the misreading this instrument exists to prevent.
   */
  private roll(now: number): void {
    if (!this.windowOpen) {
      this.windowOpen = true;
      this.windowStartMs = now;
      return;
    }
    const elapsed = now - this.windowStartMs;
    if (elapsed < WINDOW_MS) return;
    const perSec = 1000 / elapsed;
    this.outRate = this.outAcc * perSec;
    this.outByStrategyRate.clear();
    for (const [name, acc] of this.outByStrategyAcc) {
      this.outByStrategyRate.set(name, acc * perSec);
    }
    this.inRate = this.inAcc * perSec;
    this.snapTxRate = this.snapTxAcc * perSec;
    this.snapRxRate = this.snapRxAcc * perSec;
    this.snapDupRate = this.snapDupAcc * perSec;
    this.snapEpochRate = this.snapEpochAcc * perSec;
    // ⛔ CARRY THE LAST REAL AVERAGE FORWARD — DO NOT ZERO IT. A window with no accepted snapshot has
    // no gaps to average, and the first cut reported 0 for it. At the brother's 0.2 Hz that is four
    // windows in every five, so the overlay printed `gap avg 0` — the HEALTHIEST POSSIBLE READING —
    // during the exact starvation the instrument exists to measure. Holding the last measured
    // average is the honest answer to "no new data"; `gapLastMs` and `gapMaxMs` carry the rest.
    if (this.gapCount > 0) this.gapAvgMs = this.gapSumMs / this.gapCount;

    this.windowStartMs = now;
    this.outAcc = 0;
    for (const name of this.outByStrategyAcc.keys()) this.outByStrategyAcc.set(name, 0);
    this.inAcc = 0;
    this.snapTxAcc = 0;
    this.snapRxAcc = 0;
    this.snapDupAcc = 0;
    this.snapEpochAcc = 0;
    this.gapSumMs = 0;
    this.gapCount = 0;
  }

  /**
   * One outbound application MESSAGE, counted ONCE per `send()` call regardless of how many
   * strategies carry it. This is what makes `snap tx` the host's true cadence — see `recordSend`.
   */
  recordSendEnvelope(kind: string, chars: number, now: number): void {
    if (!this.enabled) return;
    this.roll(now);
    if (kind === 'NETSNAPSHOT') {
      this.snapTxAcc++;
      this.snapTxBytes = chars;
    }
  }

  /**
   * One outbound payload handed to ONE strategy. Call once per strategy — that duplication is the
   * phenomenon under measurement, so collapsing it here would hide it.
   *
   * `peerCount` multiplies the payload because `action.send()` transmits to every peer in that
   * strategy's room: the wire cost is payload × peers. Equal in the owner's 1v1; up to 3× larger at
   * `MAX_PLAYERS`.
   */
  recordSend(strategy: string, chars: number, peerCount: number, now: number): void {
    if (!this.enabled) return;
    this.roll(now);
    const bytes = chars * Math.max(0, peerCount);
    this.outAcc += bytes;
    this.outByStrategyAcc.set(strategy, (this.outByStrategyAcc.get(strategy) ?? 0) + bytes);
  }

  /**
   * One inbound application message at the transport receive boundary — BEFORE any dedup, so the
   * redundant second-strategy copy is counted. This is what the joiner actually pays to `JSON.parse`.
   */
  recordReceive(chars: number, now: number): void {
    if (!this.enabled) return;
    this.roll(now);
    this.inAcc += chars;
  }

  /**
   * A NETSNAPSHOT that passed `ClientSync`'s seq + epoch gates and will be applied. The gap from the
   * previous accepted snapshot is the interval over which the joiner's board is FROZEN.
   */
  recordSnapshotAccepted(now: number): void {
    if (!this.enabled) return;
    this.roll(now);
    this.snapRxAcc++;
    this.acceptedTotal++;
    if (this.hasAccepted) {
      const gap = now - this.lastAcceptMs;
      this.gapLastMs = gap;
      this.gapSumMs += gap;
      this.gapCount++;
      if (gap > this.gapMaxMs) this.gapMaxMs = gap;
    }
    this.lastAcceptMs = now;
    this.hasAccepted = true;
  }

  /**
   * A NETSNAPSHOT dropped by `ClientSync`'s **seq** gate — a snapshot whose seq we have already
   * accepted. In a 1v1 with both strategies carrying the peer this tracks the accept rate
   * one-for-one, and THAT IS THE DOUBLE-SEND, measured on the wire.
   *
   * ⛔ KEPT SEPARATE FROM THE EPOCH GATE ON PURPOSE. The first cut funnelled both gate arms into this
   * one counter while both the field docs and the overlay called it "duplicates". An epoch drop is
   * not a duplicate — it is a snapshot from a DEPOSED HOST after a migration. Folding the two
   * together would inflate `dup` during exactly the host-migration window, and `dup` is the single
   * number the owner's Lever 1 approval hangs on. A number that decides a decision may not be
   * approximately right.
   */
  recordSnapshotDropped(now: number): void {
    if (!this.enabled) return;
    this.roll(now);
    this.snapDupAcc++;
    this.dupTotal++;
  }

  /**
   * A NETSNAPSHOT dropped by `ClientSync`'s **epoch** gate — a zombie host from an older term.
   * Reported separately so it can never be mistaken for the double-send.
   */
  recordSnapshotEpochDropped(now: number): void {
    if (!this.enabled) return;
    this.roll(now);
    this.snapEpochAcc++;
    this.epochDropTotal++;
  }

  /** Read every counter. Rolls the window so a total stall reads as zero rather than freezing. */
  read(now: number): NetStatsReading {
    if (this.enabled) this.roll(now);
    const outByStrategy: StrategyOutReading[] = [];
    for (const [name, bytesPerSec] of this.outByStrategyRate) {
      outByStrategy.push({ name, bytesPerSec });
    }
    return {
      enabled: this.enabled,
      outBytesPerSec: this.outRate,
      outByStrategy,
      inBytesPerSec: this.inRate,
      snapTxPerSec: this.snapTxRate,
      snapTxBytes: this.snapTxBytes,
      snapRxPerSec: this.snapRxRate,
      snapDupPerSec: this.snapDupRate,
      snapEpochDropPerSec: this.snapEpochRate,
      acceptedTotal: this.acceptedTotal,
      dupTotal: this.dupTotal,
      epochDropTotal: this.epochDropTotal,
      // Computed from `now` at READ time, not at record time — that is the whole point of it.
      msSinceLastAcceptMs: this.hasAccepted ? now - this.lastAcceptMs : -1,
      gapLastMs: this.gapLastMs,
      gapAvgMs: this.gapAvgMs,
      gapMaxMs: this.gapMaxMs,
    };
  }
}

/** The live counters every call site shares. */
export const netStats = new NetStats();

/**
 * Whether a `window.location.search` string asks for the net counters.
 *
 * `?debug=1` is honoured because it is the seam `main.ts` already ships to production for the debug
 * overlay, so the owner has one URL to remember rather than two. `?netstats=1` exists for a reading
 * WITHOUT paying for the debug overlay's lazy chunk.
 *
 * Pure + exported so the gate is unit-testable without a DOM.
 */
export function netStatsRequested(search: string): boolean {
  return search.includes('netstats=1') || search.includes('debug=1');
}
