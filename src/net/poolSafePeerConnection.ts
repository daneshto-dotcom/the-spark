/**
 * SPARK — S192 T1: THE POOL-SAFE RTCPeerConnection ("the 4th player can't connect").
 *
 * ⛔ THE DEFECT (Trystero 0.25.2, reproduced S192 on one machine, no NAT — see
 * `.claude/plans/S192_RESEARCH_T1_lobby4.md`):
 *
 *   1. Each page pre-builds 20 pooled OFFERS per strategy on its first `joinRoom`
 *      (`@trystero-p2p/core/dist/offer-pool.mjs:5`, `strategy.mjs:96`).
 *   2. A pooled offer older than 57.3 s is "stale" and is RESTARTED before use
 *      (`offer-pool.mjs:3` `offerTtl = 57333`; `strategy.mjs:99`). `created` is stamped once, so
 *      after 57 s EVERY pooled offer is stale.
 *   3. The restart (`peer.mjs:150-154`) does `setLocalDescription({type:'rollback'})` when the
 *      connection holds a local offer — which for a pooled PC is its FIRST, never-answered offer.
 *      Rolling that back strips the data-channel section, and the re-offer is a 105-byte SDP with
 *      no `m=application`, no ufrag and no candidates. The peer answers it, and the pair can never
 *      connect.
 *   4. Which side offers is `selfId < peerId` (`signal-handler.mjs:416`), a coin flip per pair. So a
 *      player who joins > ~57 s after someone who must offer to them is dead on that link — the
 *      owner's "only three could connect, the fourth one says can't connect / retry later".
 *
 * ⭐ THE FIX. Never roll back an offer that was never answered. `createOffer({iceRestart:true})` from
 * `have-local-offer` is legal, keeps the data channel, re-gathers and changes the ufrag (measured:
 * 586 bytes with `m=application`). Trystero's OFFICIAL hook `config.rtcPolyfill`
 * (`peer.mjs:11-12`: `new (rtcPolyfill ?? RTCPeerConnection)(…)`) takes this subclass, so no
 * `node_modules` edit and no dependency.
 *
 * ⚠ WHY IT CANNOT SWALLOW A LEGITIMATE ROLLBACK. Trystero's only other rollback is glare handling in
 * `peer.signal()` (`peer.mjs:247-250`), which `return`s early for initiators; an answerer never holds
 * a local offer without a remote description. The predicate below matches exactly
 * "local offer + no remote description", i.e. the restart path in step 3, and passes every other
 * call through untouched.
 *
 * ⛔ IT MUST BE WIRED INTO EVERY TRYSTERO JOIN ON A PAGE. The strategy's pool is created by the FIRST
 * `joinRoom` on the page and its `makeOffer` closes over THAT call's config (`strategy.mjs:95-96`), so
 * in Quick Match it is the DISCOVERY room's config that builds every game-room PC.
 * `src/net/trysteroPolyfill.test.ts` enumerates the call sites mechanically and pins the count.
 *
 * ⚠ WIRE-NEUTRAL. Nothing on the wire changes (no message, field or discriminant), so no protocol
 * bump: a fixed page and an unfixed page interoperate. A stale (un-refreshed) OFFERER can still emit
 * the empty offer — that is the ordinary refresh-after-deploy case.
 */

/** The slice of a connection's state the predicate needs — pure, so the truth table is testable. */
export interface RollbackState {
  /** `pc.localDescription?.type` — `null`/`undefined` when there is none. */
  readonly localType: RTCSdpType | null | undefined;
  /** Whether the connection has a remote description (i.e. the offer was ever answered / received). */
  readonly hasRemote: boolean;
}

/**
 * True iff `desc` is a rollback of a local OFFER that was never answered — the one call the
 * Trystero restart makes that destroys the data channel. Every other description (an offer, an
 * answer, `undefined` for an implicit description, a rollback with a remote description, a rollback
 * with no local offer) is false and must pass through.
 */
export function isUnansweredOfferRollback(
  desc: RTCLocalSessionDescriptionInit | RTCSessionDescriptionInit | null | undefined,
  state: RollbackState,
): boolean {
  return desc?.type === 'rollback' && state.localType === 'offer' && !state.hasRemote;
}

/** Minimal constructor shape — lets the unit test drive the factory with a fake base. */
type PeerConnectionCtor = typeof RTCPeerConnection;

/**
 * Builds the pool-safe subclass over `Base`. Returns `undefined` when no `RTCPeerConnection` exists
 * (vitest/node, SSR), in which case Trystero falls back to its own global lookup — the
 * `rtcPolyfill ?? RTCPeerConnection` in `peer.mjs:12`.
 */
export function makePoolSafePeerConnection(
  Base: PeerConnectionCtor | undefined = (globalThis as { RTCPeerConnection?: PeerConnectionCtor })
    .RTCPeerConnection,
): PeerConnectionCtor | undefined {
  if (typeof Base !== 'function') return undefined;
  class PoolSafePeerConnection extends Base {
    override setLocalDescription(description?: RTCLocalSessionDescriptionInit): Promise<void> {
      if (
        isUnansweredOfferRollback(description, {
          localType: this.localDescription?.type,
          hasRemote: this.remoteDescription !== null && this.remoteDescription !== undefined,
        })
      ) {
        // Skip: keep the original offer (and its data channel). The `createOffer({iceRestart:true})`
        // that follows in Trystero's restart is legal from `have-local-offer`.
        return Promise.resolve();
      }
      return super.setLocalDescription(description);
    }
  }
  return PoolSafePeerConnection;
}

/** The class handed to every Trystero join as `rtcPolyfill`. `undefined` outside a browser. */
export const POOL_SAFE_PC: PeerConnectionCtor | undefined = makePoolSafePeerConnection();
