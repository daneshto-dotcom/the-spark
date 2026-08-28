/**
 * SPARK — S155 P1: the host-attestation failure is now DIAGNOSABLE, and this file is the
 * offline falsification the S155 Council asked for.
 *
 * ## Why this file exists
 *
 * The owner could not play with a friend: *"you see that player already in when trying to connect
 * and it keeps saying connected... but then its stuck."* That is, exactly and only, the state where
 * `verifyHostAttest` never succeeds — see the long note on `diagnoseHostAttest` for the clause-by-
 * clause mapping. The 2-peer real-WebRTC e2e PASSES at HEAD (measured, 3 runs), so the happy path is
 * fine and the failure lives somewhere the local harness cannot reach.
 *
 * ⛔ GROK-ANALYST's kill-shot in Council R1 was that my A.0 probe was insufficient: I verified that
 * `selfId` is a single hoisted module constant across all four `@trystero-p2p` packages (it is —
 * one `core` copy, all `0.25.2`), but that only validates the MODULE CONSTANT. It does not validate
 * the RUNTIME value attached to each specific data channel. The host signs
 * `makeAttest(selfId)` — the peerId it believes it has — and the joiner verifies against the peerId
 * *its* transport reports for the sender. If those two strings ever disagree at runtime, the
 * signature cannot verify, and before S155 the only trace was a bare `false`.
 *
 * ⭐ SO THIS IS THE TEST THAT SETTLES WHAT CAN BE SETTLED OFFLINE. It proves the algorithm and the
 * payload binding are CORRECT in isolation, which means a live failure is provably a runtime-value
 * mismatch or an environment problem, and NOT an algorithm bug. Combined with the reason-logged
 * diagnosis now shipping, the next report from the owner is one message away from conclusive instead
 * of one session away.
 *
 * ⚠ AND NOTE WHAT THIS FILE DOES *NOT* CLAIM. It does not prove the owner's failure. A test that
 * feeds a mismatched peerId in deliberately and watches the signature fail is a REGRESSION test for
 * a known-sensitive binding, not evidence that the binding actually broke in the wild. The honest
 * status is recorded in the PDR's PRIME-AUDIT §2: the root cause remains unproven; the silent
 * dead-end mechanism is what is being fixed.
 *
 * `verifyHostAttest` now delegates to `diagnoseHostAttest`, so the back-compat arm below is
 * load-bearing: it pins that the boolean every existing caller reads is still the `ok` field
 * computed by the identical checks in the identical order.
 */

import { describe, expect, it } from 'vitest';
import {
  diagnoseHostAttest,
  formatAttestDiagnosis,
  generateHostIdentity,
  verifyHostAttest,
  type HostAttest,
} from './hostIdentity.ts';

/** The peerId the host believes it has — i.e. what `createHostStartHandler` passes: `selfId`. */
const HOST_SELF_ID = 'trystero-peer-host-aaaa';

describe('S155 P1 — diagnoseHostAttest: the happy path is genuinely correct', () => {
  it('ACCEPTS an attest the host signed over its own (roomCode, selfId)', async () => {
    const id = await generateHostIdentity();
    const attest = await id.makeAttest(HOST_SELF_ID);
    const d = await diagnoseHostAttest(attest, id.roomCode, HOST_SELF_ID);
    expect(d.ok).toBe(true);
    expect(d.reason).toBeUndefined();
    // The derived code IS the room code — that is the whole S82 commitment.
    expect(d.derivedCode).toBe(id.roomCode);
    expect(d.expectedCode).toBe(id.roomCode);
  });

  it('BACK-COMPAT: verifyHostAttest still returns exactly the diagnosis ok field', async () => {
    const id = await generateHostIdentity();
    const attest = await id.makeAttest(HOST_SELF_ID);
    for (const [code, peer] of [
      [id.roomCode, HOST_SELF_ID], // good
      [id.roomCode, 'someone-else'], // signature arm
      ['ZZZZZZ', HOST_SELF_ID], // code arm
    ] as const) {
      const bool = await verifyHostAttest(attest, code, peer);
      const diag = await diagnoseHostAttest(attest, code, peer);
      expect(bool).toBe(diag.ok);
    }
  });
});

describe('S155 P1 — diagnoseHostAttest names WHICH of the three checks failed', () => {
  /**
   * ⭐ THE ARM THAT MATTERS. This is GROK's Council hypothesis expressed as an executable
   * statement: if the peerId the joiner verifies against is not the peerId the host signed, the
   * attestation fails — and the reason is SIGNATURE_INVALID, not a code mismatch, so a log line
   * carrying `senderPeerId` is the value to compare against the host's own.
   *
   * The room code and the key are both perfectly valid here. That is the point: this failure looks
   * like nothing is wrong, which is why it was invisible for a whole playtest.
   */
  it('SIGNATURE_INVALID when the sender peerId is not the one the host signed', async () => {
    const id = await generateHostIdentity();
    const attest = await id.makeAttest(HOST_SELF_ID);
    const d = await diagnoseHostAttest(attest, id.roomCode, 'a-DIFFERENT-runtime-peer-id');
    expect(d.ok).toBe(false);
    expect(d.reason).toBe('SIGNATURE_INVALID');
    // The commitment itself was fine — only the peer binding was wrong.
    expect(d.derivedCode).toBe(id.roomCode);
    expect(d.senderPeerId).toBe('a-DIFFERENT-runtime-peer-id');
  });

  it('CODE_MISMATCH when the offered key does not belong to the code we are verifying against', async () => {
    const host = await generateHostIdentity();
    const other = await generateHostIdentity();
    // `other` signs a perfectly valid attest — for ITS OWN room. Offered against `host`'s code it
    // must fail on the commitment, which is the anti-hijack property S82 exists for.
    const attest = await other.makeAttest(HOST_SELF_ID);
    const d = await diagnoseHostAttest(attest, host.roomCode, HOST_SELF_ID);
    expect(d.ok).toBe(false);
    expect(d.reason).toBe('CODE_MISMATCH');
    expect(d.derivedCode).toBe(other.roomCode);
    expect(d.expectedCode).toBe(host.roomCode);
    expect(d.derivedCode).not.toBe(d.expectedCode);
  });

  it('KEY_IMPORT_FAILED on bytes that decode but are not an importable P-256 key', async () => {
    const id = await generateHostIdentity();
    const attest = await id.makeAttest(HOST_SELF_ID);
    // Corrupt the key body while keeping valid base64. The derived code then almost certainly moves,
    // so verify against the code this corrupted key ACTUALLY derives — isolating the import arm from
    // the code arm, which is the only way to prove the two are distinguishable.
    const bad: HostAttest = { spkiB64: btoa('not-a-real-spki-key-body'), sigB64: attest.sigB64 };
    const { derivedCode } = await diagnoseHostAttest(bad, 'ZZZZZZ', HOST_SELF_ID);
    expect(derivedCode).not.toBeNull();
    const d = await diagnoseHostAttest(bad, derivedCode as string, HOST_SELF_ID);
    expect(d.ok).toBe(false);
    expect(d.reason).toBe('KEY_IMPORT_FAILED');
  });

  it('MALFORMED when the base64 itself will not decode', async () => {
    const id = await generateHostIdentity();
    const d = await diagnoseHostAttest(
      { spkiB64: '!!!not base64!!!', sigB64: 'also!!!not' },
      id.roomCode,
      HOST_SELF_ID,
    );
    expect(d.ok).toBe(false);
    expect(d.reason).toBe('MALFORMED');
    expect(d.derivedCode).toBeNull();
  });
});

describe('S155 P1 — the log line a stuck playtest will produce', () => {
  it('formatAttestDiagnosis carries all three values a human needs to compare', async () => {
    const host = await generateHostIdentity();
    const other = await generateHostIdentity();
    const attest = await other.makeAttest(HOST_SELF_ID);
    const line = formatAttestDiagnosis(await diagnoseHostAttest(attest, host.roomCode, 'peer-x'));
    // The three values GROK asked to be logged, plus which check failed.
    expect(line).toContain('reason=CODE_MISMATCH');
    expect(line).toContain(`derivedCode=${other.roomCode}`);
    expect(line).toContain(`expectedCode=${host.roomCode}`);
    expect(line).toContain('senderPeerId=peer-x');
  });

  it('renders undecodable keys without throwing (a log path must never be the crash)', async () => {
    const d = await diagnoseHostAttest({ spkiB64: '%%%', sigB64: '%%%' }, 'ABCDEF', 'peer-y');
    expect(formatAttestDiagnosis(d)).toContain('derivedCode=<undecodable>');
  });
});
