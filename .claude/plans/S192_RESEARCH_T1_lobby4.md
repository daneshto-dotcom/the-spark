# S192 RESEARCH — T1 "the four-player lobby does not work"

Read-only research. Only this file was written in the repo. Scratch (logs, the instrumented spec copy, the
scratch Playwright config) is under
`%TEMP%\claude\…\15bb56fb-…\scratchpad\r-lobby\` (`run1.log` … `run5.log`, `e2e/nplayer.spec.ts`, `pw.config.ts`).

Owner, verbatim (T1): *"four people lobby doesn't work … it's only connecting … three players, and the last
player that's trying to connect the fourth one. It says can't connect or … retry later … only three could
connect, like one from Romania and then two here, and then when the other one got off, then the other one
could connect"*.

---

## (a) VERDICT — ROOT CAUSE FOUND, REPRODUCED ON ONE MACHINE, NO NAT INVOLVED

**It is not a seat cap and it is not NAT/TURN.** It is a bug in Trystero 0.25.2 (our signalling library) that
breaks the connection between a player who joins LATE and any player already in the room who has to make the
WebRTC offer. In a lobby, the 4th player is the one who joins late.

### The mechanism, step by step (every link verified)

1. **Each page warms 20 `RTCPeerConnection` offers per strategy when it first joins a room.**
   `node_modules/@trystero-p2p/core/dist/offer-pool.mjs:5` `poolSize = 20`; `warmup()` creates all 20 at once
   (`strategy.mjs:96` `offerPool ||= new OfferPool(makeOffer)`, `:214` `pool.warmup()`). nostr and torrent
   each have their own pool, and both are created when you press Host / Connect / Quick Match.
2. **Trystero decides which side of a pair makes the offer by comparing the two random peer ids**:
   `signal-handler.mjs:416` `const shouldLeadOffer = selfId < peerId;`. So for any pair it is a coin flip
   (50 %) whether the player already in the room is the offerer.
3. **An offer from the pool that is older than 57.3 s is treated as stale and restarted**:
   `offer-pool.mjs:3` `offerTtl = 57333`; `strategy.mjs:98-99`
   `peer.getOffer(Date.now() - peer.created > offerTtl)`. `created` is set once at construction
   (`peer.mjs:217`) and never reset, so after 57 s **every** pooled offer is stale.
4. **⛔ The restart produces an EMPTY offer.** `peer.mjs:150-154`:
   ```js
   if (restartIce) {
     if (pc.signalingState !== "stable" && … && pc.localDescription?.type === offerType)
       await pc.setLocalDescription({ type: "rollback" });   // ← rolls back the FIRST, never-answered offer
     if (typeof pc.restartIce === "function") pc.restartIce();
   }
   await pc.setLocalDescription(restartIce ? await pc.createOffer({ iceRestart: true }) : void 0);
   ```
   Rolling back a connection's FIRST offer, before any answer, removes its data-channel section. The new offer
   has **no `m=application` line, no ICE ufrag and no candidates: 105 bytes** where a real offer is ~458.
   - **Isolated, deterministic browser proof** (Chrome 152, run in the Browser pane, no network):
     with the rollback `{restartLen: 105, restartHasApp: false}`; skip only the rollback
     `{restartLen: 586, restartHasApp: true, ufragChanged: true}`.
   - **Seen in the real game** (`run5.log`, host + 3 joiners, real nostr relays, one machine):
     `P1 +66.5s [pcmon] pc2 age=58.0s setLocal(rollback)` → `createOffer({"iceRestart":true}) len=105` →
     `P3 +68.8s pc40 setRemote(offer) remoteLen=105 … ru=- cands=0/0`. The joiner accepts the empty offer,
     answers it empty, and the pair can never connect.
5. **Trystero gives up on that pair ~23 s later and retries with the next pooled offer, which is just as stale**
   → the same empty offer again (`run5.log`: `P1 +95.2s pc3 age=86.7s createOffer … len=105`). The pool's
   `recycle()` also calls `getOffer(true)` (`offer-pool.mjs:73`), so recycled offers get emptied too
   (`pc26/27/28 setLocal(rollback)` at +96.1 s). **The pair stays dead while the offerer's pool is stale.**
   Both strategies' pools were warmed together, so the pair is dead on nostr and torrent alike.
6. **What the late joiner sees.** If the dead pair is **the late joiner ↔ the HOST**, the joiner never gets
   the host's attested HELLO:
   - if it reached at least one other player (the usual case): after 8 s,
     **`Connected, but this host has not identified itself — press Back to retry, or play VS BOTS.`**
     (`src/net/joinDiagnosis.ts:151,155`; fired by `src/main.ts:3916-3930`; the 8 s clock starts at the
     first peer of ANY kind, `src/net/clientHandlers.ts:264`)
   - if it reached nobody: after 20 s, **`Could not reach the other player — press Back to retry, or play VS BOTS.`**
     (`joinDiagnosis.ts:162`)

   If the dead pair is with a non-host player, the joiner can still be seated, but once both strategies have
   reported a per-peer failure the lobby shows a sticky red
   **`[nostr] Signaling: could not connect to peer <id> after exchanging SDP; check that your TURN server URLs
   and credentials are reachable by both peers`** (`src/net/transport.ts:542-555` + `iceConfig.ts`
   `classifyJoinError`). `errorLatched` then freezes that screen's seat rack and peer count
   (`src/render/lobbyStateMachine.ts` `PEER_STATUS`/`PRESENCE`). These are the owner's "can't connect" and
   "retry later". The host can latch the same red line: `run2.log` `P0 +91.8s [net] error: [nostr] Signaling: could not connect to peer …`.

### Why "three work, the fourth doesn't"

The bug hits **any pair whose offerer has been in the room longer than ~57 s when the pair starts negotiating**.
Players 2 and 3 usually join within a minute of the host; the 4th arrives later. Against each of the 3 players
already in the room, it is a coin flip (step 2) whether the late joiner is the offerer:
- **P(the late joiner's link to the HOST is dead) = 1/2.** Then it cannot join at all.
- **P(at least one of its 3 links is dead) = 7/8.** Then the red error is likely.

So it looks like a cap at 3, but it is really a late-joiner bug. It hits a 2nd or 3rd player the same way if
they arrive more than ~57 s after the host. ⚠ That is a broader exposure than T1, and it is a plausible
contributor to the older "stuck on Connecting / host not identified" reports (S155, S157). **That link is not
verified.**

"When the other one got off, the other one could connect" is compatible with this, but not uniquely
explained by it. A rejoin on a new page load gets a new peer id (a new coin flip) and a fresh pool. A departing
player can also be the stale offerer of the dead pair. Every failed attempt destroys one stale pooled offer, so
after enough failures the pool runs dry, `checkout` creates fresh offers (`offer-pool.mjs` `checkout` →
`alloc(missing)`), and the pair connects. I could not establish which of these happened on the weekend.

### Reproduction (this session)

The repo's own 4-peer spec (`e2e/nplayer.spec.ts:73`, `@quarantine-flaky`) was copied to scratch,
instrumented with an `RTCPeerConnection` monitor, and run 4 times on one machine (loopback, real public nostr
and torrent relays, no TURN, no NAT):

| run | when the joiners connected (s) | dead pair | outcome |
|---|---|---|---|
| run1 | host 4.2, P1 10.9, P2 28.6, P3 54.2 | none. P3 was the offerer against all three; it also joined < 57 s after the host | all 4 meshed |
| run2 | host 1.5 … P3 59.6 | **host ↔ P3** (the host was the offerer: `6QlP` < `Qn4h`) | P3: `JOIN STALLED — Connected, but this host has not identified itself — press Back to retry`; host never saw P3 (`waitForWorld timeout: host sees 3 joiners connected`) |
| run3 | host 1.6 … P3 60.2 | **host ↔ P3** on nostr (host pooled `pc1 age=64.9s`, offer `ru=- cands=0/0`) | P3 reached the host only via torrent |
| run5 | host 1.5, P1 8.5 … P3 64.1 | **P1 ↔ P3** (P1 offered with a 58 s-old pooled offer, 105-byte SDP) | host connected; P1 ↔ P3 dead on nostr |

Every failure matches the rule. The one apparent counterexample (run2: P1 offered P3 successfully at age ~61 s)
is explained by timing: the offer was **minted** on P3's first announcement at about +63 s, when the pooled
offer was about 55 s old, so it was still under the TTL.

⚠ **SIDE FINDING — the CI 4-peer test is red for a different reason.** `e2e-quarantine` has failed
`nplayer.spec.ts` "S63 - 4-player FFA" in **every** run checked (≈ 40 runs, 2026-08-11 → 2026-10-01). Where
all 4 do connect (run1/run3/run5, and CI 2026-08-11), it fails at `peer 0 PLAYING + 4 players` with the host
in `POSTGAME` and `scoreByPlayer` ≈ 100 for every seat. The match ends at once against the test's
`__TEST_WIN_SCORE__ = 3`, so that failure is a stale test. It is not this bug, and it has hidden this bug.

### ⭐ The quarantined CI spec: is it the owner's bug, hidden by the tag? Partly yes. (Coordinator request)

**Deploy #5's run, 36822641370, job `e2e-quarantine`** (`PW_RETRIES: 0`, one attempt):
`✘ 7 e2e/nplayer.spec.ts:74 › S63 - 4-player FFA … (1.6m)`, `Test timeout of 90000ms exceeded`, then
`browserContext.close: Target page, context or browser has been closed` at `:162` (the `finally`). The log does
not name the stalled step: the 90 s budget can be spent entirely in the 60 s `host sees 3 joiners connected`
wait plus the 30 s PLAYING wait. The screenshots and `error-context.md` are in that run's artifact
`playwright-quarantine-results` (10.8 MB). I did not download it, because a file download needs the owner's
permission. Run 36776596278 (`27ab032`, the weekend's net code) failed identically.

**When did it last pass? Not within the retained log window, so it cannot be bisected from CI.** Sampled ≈ 40
`e2e-quarantine` runs, 2026-08-11 → 2026-10-01: **✘ in every one**, including every deploy commit. Before
2026-08-11, the job spent its budget on `hostmigration.spec.ts:34` (4.0 m × 3 retries, runs 2026-07-28 …
2026-08-10) and never reached `nplayer`. Logs older than ~2026-07-03 have expired. So "last green" is not
observable, and bisecting against deploy commits has no green endpoint.

**What the failing runs show, split by cause:**
- **2026-08-11 (`9eb8bb1`), 3 attempts:** all 4 connected (host `peerCount: 3`, players 0–3 seated with the
  right colours) and then failed `peer 0 PLAYING + 4 players` with the host already in `POSTGAME`. That is the
  stale `__TEST_WIN_SCORE__` seam, not a connection failure.
- **Local runs of the same spec (this session, deploy-#5 tree):** run1/run3/run5 failed the same POSTGAME way,
  and **run2 failed at `host sees 3 joiners connected` with the 4th player showing the owner's message.** In
  this spec the joiners connect at about +10 s, +29 s and **+54–64 s**, so the 4th sits right on Trystero's
  57.3 s staleness edge. Whether it hits depends on the coin flip of which side offers.

**Conclusion:** the tag hid the owner's bug, but the spec is red for **two** reasons and the second masks the
first:
1. the 4th joiner arrives on the staleness edge, so about half the time a pair is dead (**the T1 bug**);
2. even when all 4 connect, the match ends at once (**test rot**).

Fixing only (2) would leave a spec that passes about half the time, which looks exactly like "flaky". That is
presumably how it earned the quarantine. Test (c)5 below removes the coin flip by forcing staleness
deterministically, so it is red without the fix and green with it. Then it can leave quarantine.

### Ruled out (with the evidence)

- **No seat cap at 3.** `MAX_PLAYERS = 4` (`src/constants.ts:87`). `reconcileLobbySeats` seats remotes into
  `[1, MAX_PLAYERS-1]` (`src/net/lobbyRoster.ts:79`). `beginMatch` builds the roster from that map
  (`src/net/hostHandlers.ts:517-545`). The roster validator is `roster.length > MAX_PLAYERS`
  (`protocol.ts:1902`). Quickmatch is full at `hostPeerCount() >= MAX_PLAYERS - 1` = 3 remotes
  (`quickmatch.ts:520`). The lobby shows `Room N/4` (`lobbyScreen.ts:923`). A grep for `< 3`, `<= 2`,
  `length >= 3` and `peerCount() >=` over `src/net`, `main.ts` and `render/lobby*` found nothing seat-shaped.
  `lobbyRoster.test.ts:62` already pins "caps at MAX_PLAYERS-1 remotes". run1 seated 4 players with distinct
  seats.
- **NAT/TURN is not required.** All failures above happened on one machine over loopback. (Live build: TURN =
  one url, `turn:global.relay.metered.ca:80` UDP only, still the wrapped dashboard paste repaired at runtime.
  I could not run the live TEST CONNECTION; my clicks did not register in the Pixi canvas. Cross-border TURN
  health remains a separate unknown that could make it worse, not the cause.)
- **Not `SNAPSHOT_SINGLE_STRATEGY`.** That only routes NETSNAPSHOT *after* Begin (`transport.ts:794-805`). It
  plays no part in joining.
- **No per-peer connection limit** in Trystero or in our config. `answeringTtlMs` / `offerPostAnswerTtlMs`
  (23.3 s) only set **when** the failure is reported.
- **Topology.** Trystero builds a full mesh (6 pairs at 4 players, 3 links per peer). The game only needs the
  star (host ↔ each joiner), because snapshots and INTENTs are host-authoritative. A dead non-host pair is
  therefore harmless to play but loud in the UI. A dead host pair is fatal to the join.

### Which build was played

The weekend before 2026-10-01 (Sat 26 / Sun 27 Sep) ran **deploy #4's SPARK net code (`7404a49`, PROTOCOL
51)**. Every master deploy between then and 2026-10-01 06:01Z was a Pitch Masters arcade push.
`git diff --stat 7404a49 27ab032 -- src/net src/main.ts` is empty, and `472233d` (the #5 protocol bump) is NOT
an ancestor of `27ab032`. **Deploy #5 (`d5c9c49`, live 2026-10-01 06:01Z) does not change this path:** the
same Trystero 0.25.2 (package.json unchanged), `iceConfig.ts` unchanged, the same `onJoinError` logic
(relocated, same semantics), `joinDiagnosis.ts` / `lobbyRoster.ts` / `lobbyStateMachine.ts` untouched. C6
(lobby-age election), the per-match id and `LOBBY_PRESENCE.phase` all act after or beside the WebRTC pair,
never on it. **Upgrading Trystero does not fix it:** 0.25.4 (latest, 2026-08-30) has the identical
`createOffer` rollback (`peer.mjs:150-154`) and `offerTtl` (checked on unpkg).

---

## (b) FIX SHAPE AND THE FILES IT TOUCHES

**Never roll back an offer that was never answered.** That rollback is the only thing that empties the SDP:
`createOffer({iceRestart: true})` from `have-local-offer` is legal, keeps the data channel, re-gathers and
changes the ufrag (measured above: 586 bytes). Trystero exposes an official hook for this,
`config.rtcPolyfill` (`peer.mjs:11-12`: `new (rtcPolyfill ?? RTCPeerConnection)(…)`). So the fix needs **no
change to node_modules and no new dependency.**

1. **NEW `src/net/poolSafePeerConnection.ts`.** It contains:
   - a pure predicate, `isUnansweredOfferRollback(desc, { localType, hasRemote })`, which is true iff
     `desc?.type === 'rollback' && localType === 'offer' && !hasRemote`;
   - `makePoolSafePeerConnection(Base = globalThis.RTCPeerConnection)`, which returns
     `class extends Base { setLocalDescription(d) { if (isUnansweredOfferRollback(d, …)) return Promise.resolve(); return super.setLocalDescription(d); } }`.
     It is a factory, so vitest (node, no WebRTC) can import it and drive it with a fake base. It returns
     `undefined` when `RTCPeerConnection` is absent.
   - **Why it cannot hit a legitimate rollback:** Trystero's only other rollback is glare handling in
     `peer.signal()` (`peer.mjs:247-250`), and it returns early for initiators (`if (initiator) return;`). An
     answerer PC never holds a local offer. So the predicate matches exactly the restart path in step 4.
2. **`src/net/transport.ts` ~533** (`startStrategy` → `joinFn` config): add `rtcPolyfill: POOL_SAFE_PC`.
3. **`src/net/quickmatch.ts` ~361** (`TRYSTERO_DEPS.openRoom` config): add the same.
   ⛔ **This is not optional.** The nostr strategy's pool is created by the **first** `joinRoom` on the page
   (`strategy.mjs:96` `offerPool ||=`), and its `makeOffer` closes over **that** call's config. In Quick Match
   the discovery room joins first, so every game-room PC is built from the discovery room's config.
   Fixing only `transport.ts` would leave Quick Match broken.
4. **Optional honesty fix, same branch, `transport.ts` only (P2):** `onJoinError` is a per-PEER report, but it
   sets `handle.state = 'failed'` for the whole STRATEGY (`transport.ts:546`) permanently. Then any
   later per-peer failure on the other strategy trips `allStrategiesFailed()` → a red sticky `emitError`,
   even when the host link is fine. Record per-peer failures instead, and keep `state` for real strategy
   failure (join throws / relays dead). ⚠ The diagnostics strip reads `state` (`torrent:fail`), so carry the
   per-peer count there.
5. **Deferred, it overlaps s189/net:** the stall wording. "Connected, but this host has not identified itself"
   is wrong when the host is simply **unreachable** while other players are reachable. That copy lives in
   `joinDiagnosis.ts` and its clock in `clientHandlers.ts:264`, and s189/net is editing `clientHandlers.ts`.
   Do it after that branch merges, or leave it. Once (1)–(3) land, this path should be rare.

⚠ **A stale tab keeps the bug.** The fix acts on the OFFERER's page, so a player who has not refreshed since
the deploy can still send empty offers. That is the ordinary "refresh after a deploy" situation; no protocol
lever exists for it (see (e)).

---

## (c) TESTS OWED

1. **Unit, deterministic (vitest), `src/net/poolSafePeerConnection.test.ts`:**
   - the predicate truth table: rollback + local offer + no remote → skip; rollback with a remote description →
     pass through; rollback with no local offer → pass through; any non-rollback description, or `undefined`
     (implicit) → pass through;
   - the factory over a FAKE base class that records calls: replay Trystero's restart sequence
     (`setLocalDescription(offer)` → `setLocalDescription({type:'rollback'})` → `restartIce()` →
     `createOffer({iceRestart:true})` → `setLocalDescription(o)`) and assert the base never saw the rollback;
     replay an answered PC and assert it did.
2. **Wiring tripwire (source-text, enumerated mechanically per CLAUDE.md §2), `src/net/trysteroPolyfill.test.ts`:**
   count every Trystero `joinRoom` call site in `src/net` (`joinNostr(`, `joinFn(`, `mod.joinRoom`; today
   that is transport.ts `startStrategy` + quickmatch.ts `openRoom`) and require `rtcPolyfill` in each config
   object. Pin the total, so a new call site fails until it is wired.
   ⚠ A source-text guard proves the line EXISTS, not that it is REACHED. Test 4 is the reach proof.
3. **Upstream-version tripwire:** read `node_modules/@trystero-p2p/core/package.json` and `dist/peer.mjs`.
   Pin version `0.25.x` and the presence of the `setLocalDescription({ type: "rollback" })` +
   `createOffer({ iceRestart: true })` restart sequence, plus `offerTtl = 57333`. An upgrade then turns RED and
   forces someone to re-check whether the workaround is still needed or still sufficient.
4. **Browser canary (Playwright, no network, ~1 s), in the gating lane:** `page.evaluate` the two-PC
   experiment above: a raw `RTCPeerConnection` restart → **no** `m=application` (pins the browser behaviour
   this depends on), and the pool-safe class → `m=application` present + changed ufrag.
5. **e2e — the 4-context spec, made deterministic and fixed:** repair `e2e/nplayer.spec.ts:73`.
   - Fix the POSTGAME rot (the match ends at once under `__TEST_WIN_SCORE__ = 3`; re-derive the seam).
   - Force lateness instead of waiting for it: before the 4th joins, shift `Date.now` by +60 s on the 3 pages
     already in the room (`page.evaluate`, wrapping `Date.now`). Trystero's staleness test reads `Date.now()`
     (`strategy.mjs:99`), so every pooled offer is instantly stale.
   - Assert the full mesh: every page has `peerCount === 3`, the host sees 3, and the 4th is verified.
     Without the fix this fails 7/8 of the time (any stale-offerer pair). For a 100 % red-without-fix twin,
     add a 2-context variant: reload the joiner until its peer id sorts above the host's (expected 2 loads,
     ids from the `[net] nostr onPeerJoin:` console lines), shift the host's clock +60 s, join, and assert it
     connects.
   - Once green, drop `@quarantine-flaky`. A real 4-seat test has been structurally red since at least
     2026-08-11 while nobody looked.
   - Note: the `e2e-lobby` / gating lanes run on a per-worktree port (`playwright.config.ts` `e2ePort`), so
     the merge owner must re-run it on the merged tree.
6. **The seat/roster logic at 4, as the brief asked: already covered.** `src/net/lobbyRoster.test.ts:62`
   ("caps at MAX_PLAYERS-1 remotes…") and the hole/back-fill cases cover it, and `quickmatch.test.ts:70`
   covers full rooms. One cheap addition: `sendAnnounce`'s `full` is false at 2 remotes and true at 3
   (`quickmatch.ts:520`), pinned against `MAX_PLAYERS`, so a 3-seat cap can never slip in unnoticed.

---

## (d) OVERLAP WITH s189/net → ITS OWN BRANCH

`git diff --stat master...s189/net` touches `main.ts`, `clientHandlers.ts`, `reconnectPolicy.ts`, `session.ts`,
`connectionLostOverlay.ts`, `lobbyScreen.ts`, `ci.e2ePort.test.ts` and tests. It does **not** touch
`transport.ts`, `quickmatch.ts` or `iceConfig.ts`. The fix, (b)1–4, touches only a new file plus
`transport.ts` and `quickmatch.ts`, so the file sets are **disjoint**.
**→ Its own branch (suggested `s192/lobby4`), small, mergeable before or after s189/net.** Only (b)5 (stall
wording, `clientHandlers.ts`) would overlap; keep it out of this branch. The merge owner re-runs the gates and
the repaired 4-peer e2e after the merge, per CLAUDE.md.

## (e) PROTOCOL BUMP? — NO

Nothing goes onto the wire: no message, field, discriminant or shared sim constant changes. Two builds that
shake hands cannot disagree about anything either of them computes. The change is local to how a page builds
its own WebRTC offer. A fixed page and an unfixed one interoperate; an unfixed OFFERER can still emit the
empty offer, and a bump would not help with that (the HELLO check happens over the data channel that never
opens). `PROTOCOL_VERSION` stays 52.

---

### Evidence index
- Trystero (installed 0.25.2): `core/dist/offer-pool.mjs:3,5,73`; `strategy.mjs:96-99,214`; `signal-handler.mjs:416`;
  `peer.mjs:11-12,146-154,217,247-250`. 0.25.4 is the same (unpkg).
- SPARK: `src/net/joinDiagnosis.ts:151,155,162`; `src/main.ts:3916-3930`; `src/net/clientHandlers.ts:264`;
  `src/net/transport.ts:533,542-555`; `src/net/quickmatch.ts:361,520`; `src/net/lobbyRoster.ts:79`;
  `src/net/hostHandlers.ts:517-545`; `src/constants.ts:87`.
- CI: `e2e-quarantine` "S63 - 4-player FFA" ✘ in every run sampled, 2026-08-11 → 2026-10-01 (before 08-11 the
  job died in hostmigration before reaching it).
- Live bundle `index-BuRkZKo0.js`: one TURN url, `turn:global.relay.metered.ca:80`, wrapped paste repaired at runtime.
