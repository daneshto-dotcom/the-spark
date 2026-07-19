/**
 * SPARK — S125 P2 (F9, AUDIT_S116): per-peer INTENT token-bucket for the authoritative host.
 *
 * The host already gates remote INTENTs on TYPE (isClientIntentAllowed) and SEAT (stampOrReject,
 * fail-closed), and there is a pre-verify flood guard — but nothing bounds how FAST a peer can
 * drive dispatch(). A modified client could spam INTENTs to burn host CPU. This bucket caps the
 * per-sender rate: each accepted INTENT costs one token; tokens refill continuously at
 * `refillPerSec` up to `capacity`; an empty bucket makes `tryConsume` return false and the caller
 * DROPS the intent (counting it for observability).
 *
 * PURITY / DETERMINISM: this is a HOST-ONLY transport-layer guard, evaluated at message receipt —
 * NOT part of the simulation. A drop is indistinguishable from a lost network packet, so using
 * wall-clock (`nowMs`, passed in by the caller) refill is correct and introduces no determinism
 * concern (the mirror clients never run this). The class holds no globals and no wall-clock of its
 * own, so it is fully unit-testable with an injected clock.
 *
 * The SAME instance is shared by both host INTENT choke points — the original host
 * (hostHandlers.ts) and a migration successor (main.ts) — so a peer's budget is continuous across
 * a host migration. Per-peer state is pruned on peer-leave (`forget`) and wiped at match
 * boundaries (`reset`).
 */
export class IntentRateLimiter {
  private readonly buckets = new Map<string, { tokens: number; lastMs: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
  ) {}

  /**
   * Refill this peer's bucket by the elapsed time (capped at `capacity`), then try to spend one
   * token. Returns true if a token was available (the INTENT proceeds), false if the bucket was
   * empty (the caller drops the INTENT). A never-seen peer starts FULL — its first burst up to
   * `capacity` always passes, which is the intended generous headroom for legit play.
   */
  tryConsume(peerId: string, nowMs: number): boolean {
    let b = this.buckets.get(peerId);
    if (b === undefined) {
      b = { tokens: this.capacity, lastMs: nowMs };
      this.buckets.set(peerId, b);
    } else {
      // Guard against a non-monotonic clock (max 0): never refill on a backwards jump.
      const elapsedSec = Math.max(0, (nowMs - b.lastMs) / 1000);
      b.tokens = Math.min(this.capacity, b.tokens + elapsedSec * this.refillPerSec);
      b.lastMs = nowMs;
    }
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  /** Drop a peer's bucket (call on peer-leave so departed peers don't accumulate). */
  forget(peerId: string): void {
    this.buckets.delete(peerId);
  }

  /** Wipe all buckets (call at a match boundary — fresh budgets per match). */
  reset(): void {
    this.buckets.clear();
  }

  /** Number of tracked peers — for tests / diagnostics only. */
  size(): number {
    return this.buckets.size;
  }
}
