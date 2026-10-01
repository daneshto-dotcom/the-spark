/**
 * SPARK — S192 T1: the pool-safe RTCPeerConnection, against a REAL browser. No network, ~1 s.
 *
 * The unit test (`src/net/poolSafePeerConnection.test.ts`) drives Trystero's own restart code over a
 * FAKE base that MODELS one browser behaviour: rolling back a connection's first, never-answered offer
 * drops its data-channel section. This canary pins that behaviour where it lives — Chromium — and
 * proves the subclass survives it:
 *
 *   · RAW `RTCPeerConnection`, Trystero's restart sequence (`peer.mjs:150-154`) ⇒ the restarted offer
 *     has NO `m=application` (the 105-byte offer of the S192 research). If a Chromium release stops
 *     doing this, this half goes red and says the workaround may no longer be needed.
 *   · `POOL_SAFE_PC`, same sequence ⇒ `m=application` kept, ufrag changed, and the restarted offer
 *     actually CONNECTS a data channel to a plain answerer over loopback.
 *
 * The module is imported from the dev server (`/src/net/poolSafePeerConnection.ts`), i.e. the exact
 * code the game wires into Trystero, not a copy.
 */
import { test, expect } from '@playwright/test';

test.describe('S192 T1 - pool-safe RTCPeerConnection keeps the data channel through a pooled-offer restart', () => {
  test('raw restart loses m=application; POOL_SAFE_PC keeps it, re-ufrags, and connects', async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto('/?debug=1');
    const r = await page.evaluate(async () => {
      const modPath = '/src/net/poolSafePeerConnection.ts';
      const mod = (await import(/* @vite-ignore */ modPath)) as {
        POOL_SAFE_PC: typeof RTCPeerConnection | undefined;
      };
      const Safe = mod.POOL_SAFE_PC;
      if (Safe === undefined) throw new Error('POOL_SAFE_PC is undefined in a browser');
      const ufrag = (s: string) => /a=ice-ufrag:(\S+)/.exec(s)?.[1] ?? null;

      /** Trystero 0.25 `peer.mjs`: a pooled initiator's first offer, then `createOffer(restartIce=true)`. */
      async function pooledThenRestart(Ctor: typeof RTCPeerConnection) {
        const pc = new Ctor({ iceServers: [] });
        pc.createDataChannel('data');
        await pc.setLocalDescription(); // the pooled, never-answered offer
        const first = pc.localDescription!.sdp;
        if (pc.signalingState !== 'stable' && pc.localDescription?.type === 'offer') {
          await pc.setLocalDescription({ type: 'rollback' });
        }
        pc.restartIce();
        await pc.setLocalDescription(await pc.createOffer({ iceRestart: true }));
        const restarted = pc.localDescription!.sdp;
        return { pc, first, restarted };
      }

      const raw = await pooledThenRestart(RTCPeerConnection);
      raw.pc.close();
      const safe = await pooledThenRestart(Safe);

      // Connect the restarted pool-safe offer to a plain answerer (non-trickle, loopback). mDNS host
      // candidates are rewritten to 127.0.0.1 the way Trystero's own test hook does.
      const gathered = (pc: RTCPeerConnection) =>
        new Promise<void>((res) => {
          if (pc.iceGatheringState === 'complete') return res();
          pc.addEventListener('icegatheringstatechange', () => {
            if (pc.iceGatheringState === 'complete') res();
          });
          setTimeout(res, 5000);
        });
      const loop = (sdp: string) => sdp.replace(/ (\S+\.local) (\d+) typ host/g, ' 127.0.0.1 $2 typ host');
      const answerer = new RTCPeerConnection({ iceServers: [] });
      const opened = new Promise<boolean>((res) => {
        answerer.ondatachannel = ({ channel }) => {
          if (channel.readyState === 'open') res(true);
          channel.onopen = () => res(true);
        };
        setTimeout(() => res(false), 10_000);
      });
      await gathered(safe.pc);
      await answerer.setRemoteDescription({ type: 'offer', sdp: loop(safe.pc.localDescription!.sdp) });
      await answerer.setLocalDescription();
      await gathered(answerer);
      await safe.pc.setRemoteDescription({ type: 'answer', sdp: loop(answerer.localDescription!.sdp) });
      const connected = await opened;
      safe.pc.close();
      answerer.close();

      return {
        rawFirstHasApp: raw.first.includes('m=application'),
        rawRestartHasApp: raw.restarted.includes('m=application'),
        rawRestartLen: raw.restarted.length,
        safeRestartHasApp: safe.restarted.includes('m=application'),
        safeUfragChanged: ufrag(safe.first) !== null && ufrag(safe.first) !== ufrag(safe.restarted),
        safeRestartLen: safe.restarted.length,
        connected,
      };
    });
    console.log('[poolSafePc] canary', JSON.stringify(r));
    // The browser behaviour the workaround exists for (the defect, reproduced natively).
    expect(r.rawFirstHasApp).toBe(true);
    expect(r.rawRestartHasApp, 'Chromium no longer drops the data channel on rollback — re-check S192').toBe(false);
    // The fix.
    expect(r.safeRestartHasApp).toBe(true);
    expect(r.safeUfragChanged).toBe(true);
    expect(r.connected, 'the restarted pool-safe offer did not open a data channel').toBe(true);
  });
});
