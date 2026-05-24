# SPARK — Signaling Relay Health Runbook

**Owner:** Net layer (`src/net/transport.ts`, `src/net/iceConfig.ts`)
**Created:** S44 (2026-05-24) per Council R1+R2 synthesis (Option C, Full tier)
**Last rotation:** 2026-05-24 (S44)

---

## Why this file exists

Public Nostr relays + BitTorrent WSS trackers + MQTT brokers are operated by volunteers/non-profits. They decay:
- **Damus.io** rate-limited Trystero writes ("you are noting too much")
- **nostr.wine** became paid-only ("sign up to write events")
- **nostr.band** went host-unreachable (DNS / timeout)
- **eden.nostr.land** became paid

S43 lost real-time 1v1 for the user because 4 of 6 production Nostr relays decayed silently between S15 (relays pinned) and S43 (user retest). This runbook prevents that recurrence.

---

## Current relay set (S44 rotation)

### Nostr (`STRATEGY_FLAGS.nostr = true`, primary)
| Relay | Status at S44 | Source |
|---|---|---|
| `wss://nos.lol` | HEALTHY (curl 200) | Kept from S15 |
| `wss://relay.mostr.pub` | HEALTHY (curl 200) | Kept from S15 |
| `wss://purplerelay.com` | HEALTHY (curl 302) | Kept from S15 |
| `wss://nostr.mom` | HEALTHY (curl 200) | S44 add |
| `wss://offchain.pub` | HEALTHY (curl 200) | S44 add |
| `wss://nostr-pub.wellorder.net` | HEALTHY (curl 200) | S44 add |
| `wss://relay.primal.net` | HEALTHY (curl 200) | S44 add |

**Dropped at S44:** `wss://relay.damus.io` (rate-limited), `wss://nostr.wine` (paid), `wss://relay.nostr.band` (unreachable). DO NOT re-add without empirical NIP-78 verification.

### Torrent (`STRATEGY_FLAGS.torrent = true`, fallback)
| Tracker | Notes |
|---|---|
| `wss://tracker.openwebtorrent.com` | Long-running public WebTorrent tracker |
| `wss://tracker.btorrent.xyz` | Alternative public tracker |
| `wss://tracker.files.fm:7073/announce` | Backup, includes explicit /announce path |

### MQTT (`STRATEGY_FLAGS.mqtt = false`, opt-in)
Default-OFF per Council R2 S1δ. Operators needing additional failure-domain diversity may flip to `true` in `src/net/iceConfig.ts` and rebuild. Public MQTT brokers (`broker.hivemq.com`, `test.mosquitto.org`) face the same economic decay as Nostr.

---

## When to suspect relay decay

User reports "Player 2 stuck Connecting / Player 1 stuck Waiting" AND:
- Lobby diagnostic strip shows `nostr:0/7` (no relay sockets attached) → all-Nostr decay
- Lobby diagnostic strip shows `nostr:1/7` to `nostr:3/7` (most relays dead) → partial decay, may still work
- `nostr:fail` in strip → onJoinError fired; check console for `[net] error` lines

If both `nostr:fail` AND `torrent:fail`, multi-strategy is fully degraded → relay rotation needed.

---

## How to probe relay health

### Quick probe (curl, takes <30s)
```bash
for r in nos.lol relay.mostr.pub purplerelay.com nostr.mom offchain.pub nostr-pub.wellorder.net relay.primal.net; do
  echo -n "$r: "
  curl -sS -o /dev/null -w "%{http_code}\n" --max-time 5 "https://$r" 2>&1 || echo "TIMEOUT"
done
```
Expect 200 / 301 / 302. 000 / 4xx / 5xx / TIMEOUT = candidate for rotation.

### Deep probe (NIP-78 ephemeral write+subscribe)
TODO — `npm run probe-relays` script not yet implemented. Carry-forward from S44 (see `BACKLOG.md`). Manual verification via the live lobby + `?debug=1` diagnostic strip is currently the canonical functional gate.

---

## Rotation procedure

1. **Identify candidates:** Run the quick probe above. Anything <5s curl-200 is healthy enough to add.
2. **Verify in dev:**
   ```bash
   npm run dev
   ```
   Open two browser windows on different network paths (e.g. one on WiFi, one tethered to phone hotspot — same-window probes are known-unreliable for Trystero/browser anti-loopback). Host on one, join from the other. Confirm `onPeerJoin` fires within 10s.
3. **Edit `src/net/iceConfig.ts`:**
   - Add new relays to `NOSTR_RELAYS` array
   - Remove dead relays
   - Update the comment header with rotation date + rationale
4. **Run typecheck + tests + build:**
   ```bash
   npm run typecheck && npm test -- --run && npm run build
   ```
   Confirm bundle stays under 500 KB cap.
5. **Commit + deploy:**
   ```bash
   git add src/net/iceConfig.ts RELAY_HEALTH.md
   git commit -m "[Sxx] Rotate relays — drop X, add Y (decay confirmed via curl)"
   git push
   gh workflow run deploy.yml
   ```
6. **4-layer verification:**
   - L1: `curl -sI https://spark-online.space/ | grep Last-Modified` advances
   - L2: ETag changes
   - L3: bundle filename in `dist/assets/` changes
   - L4: `gh api repos/dronkonsigliere/spark/contents/dist/assets/...` includes new relay URLs in bundle
7. **2-peer smoke (USER):** Real 2-browser-process smoke on the live URL. Multi-strategy ensures partial failures are masked; this smoke is the only gate that proves end-to-end pairing works.

---

## Carry-forwards from S44

- **Mid-session transport degradation (Council R2 PRIME-AUDIT):** Architectural follow-on. Current implementation keeps all enabled strategies alive simultaneously (multi-broadcast), so single-strategy mid-session failure doesn't kill the session — but no explicit teardown-and-restart of a degraded strategy is implemented.
- **NIP-78 functional probe script:** `npm run probe-relays` not yet implemented. Manual probe via dev-mode 2-browser smoke is current canonical gate.
- **Custom relay URL field (lobby UI):** Power-user / tournament escape hatch. Council R1 Grok G-NEW-3. Deferred to follow-on.
- **Periodic rotation cadence:** Recommend re-probing every 2 months; flag relays with >2 consecutive failed probes for rotation.

---

## Recent rotation history

| Date | Session | Action | Reason |
|---|---|---|---|
| 2026-05-24 | S44 | Drop damus.io / nostr.wine / nostr.band; add nostr.mom / offchain.pub / wellorder.net / primal.net | Decay confirmed via S43 dual-NetTransport probe |
| 2026-04-?? | S19 P4 | Initial pinned set replacing Trystero 0.24 "5 random of 55" default | Sub-sampling stall risk on dead relays |
