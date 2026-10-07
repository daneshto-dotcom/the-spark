/**
 * SPARK — S196 (net-blip): a local UDP relay that can go SILENT, for reproducing a REAL network drop.
 *
 * Why this exists: `e2e/reconnect-hard-blip.spec.ts` blips with `pc.close()`, which sends an SCTP ABORT —
 * the far side learns of it in ~2-6 s. A real drop (dead Wi-Fi, ISP glitch, NAT rebinding) sends NOTHING:
 * every packet just stops. Nothing inside Chromium can do that to WebRTC (CDP network emulation and
 * `context.setOffline` do not touch the ICE/UDP path; freezing the page leaves the WebRTC threads answering
 * consent checks), and system firewall rules are off-limits. So the JOINER's ICE is forced through this
 * relay (see `FORCE_THROUGH_RELAY` below — an init script, test-only) and the relay is switched to DROP.
 *
 *   joiner pc ──udp──▶ 127.0.0.1:<listen port per target> ──▶ [this relay] ──udp──▶ host candidate ip:port
 *              ◀──────────────────────────────────────────────            ◀──
 *
 * The joiner sends NO candidates of its own (they are stripped), so the host can only ever reach it as the
 * peer-reflexive address of the relay's upstream socket; the joiner only knows the host as the relay's listen
 * port. Every byte of that pair crosses the relay, and `setDark(true)` drops every one of them silently —
 * both RTCPeerConnections stay `connected`/channel `open` until ICE consent notices, exactly like a real drop.
 * Signalling (the local Nostr relay's WebSocket) is untouched, i.e. the "media path died, signalling alive"
 * case (UDP blocked, NAT rebinding, Wi-Fi roam); see the driver for the signalling-dark variant.
 */
import dgram from 'node:dgram';
import { createServer } from 'node:http';

export function createBlackholeRelay({ log = () => {} } = {}) {
  /** target "ip:port" -> { listen: Socket, port, clients: Map<"ip:port", Socket upstream> } */
  const targets = new Map();
  let dark = false;
  const stats = { fwdToTarget: 0, fwdToClient: 0, dropped: 0, lost: 0 };
  // S196 (joiner-desync) — optional IMPAIRMENT for a remote-player model: one-way delay + uniform jitter + random
  // loss, applied per packet in both directions (harness-only; Math.random is fine outside the sim).
  let impair = { delayMs: 0, jitterMs: 0, loss: 0 };
  const forward = (sock, buf, port, ip, counter) => {
    if (impair.loss > 0 && Math.random() < impair.loss) { stats.lost++; return; }
    stats[counter]++;
    const d = impair.delayMs + (impair.jitterMs > 0 ? Math.random() * impair.jitterMs : 0);
    if (d <= 0) sock.send(buf, port, ip);
    else setTimeout(() => { if (!dark) sock.send(buf, port, ip); }, d);
  };

  const mapTarget = (ip, port) =>
    new Promise((resolve) => {
      const key = `${ip}:${port}`;
      const have = targets.get(key);
      if (have) return resolve(have.port);
      const listen = dgram.createSocket('udp4');
      const entry = { listen, port: 0, clients: new Map() };
      listen.on('message', (msg, rinfo) => {
        if (dark) { stats.dropped++; return; }
        const ckey = `${rinfo.address}:${rinfo.port}`;
        let up = entry.clients.get(ckey);
        if (!up) {
          up = dgram.createSocket('udp4');
          up.on('message', (back) => {
            if (dark) { stats.dropped++; return; }
            forward(listen, back, rinfo.port, rinfo.address, 'fwdToClient');
          });
          up.on('error', () => {});
          up.bind(0, '0.0.0.0');
          entry.clients.set(ckey, up);
          log(`relay: new client ${ckey} -> ${key}`);
        }
        forward(up, msg, port, ip, 'fwdToTarget');
      });
      listen.on('error', () => {});
      listen.bind(0, '127.0.0.1', () => {
        entry.port = listen.address().port;
        targets.set(key, entry);
        log(`relay: map ${key} -> 127.0.0.1:${entry.port}`);
        resolve(entry.port);
      });
    });

  // The page asks for a mapping over HTTP (it cannot open UDP sockets itself).
  const http = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-private-network', 'true');
    if (u.pathname === '/map') {
      const ip = u.searchParams.get('ip');
      const port = Number(u.searchParams.get('port'));
      if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip) || !(port > 0)) { res.writeHead(400); return res.end('bad'); }
      const p = await mapTarget(ip, port);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ port: p }));
    }
    res.writeHead(404); res.end();
  });

  return {
    start: () => new Promise((r) => http.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${http.address().port}`))),
    setDark: (v) => { dark = v; },
    setImpair: (v) => { impair = { delayMs: 0, jitterMs: 0, loss: 0, ...v }; },
    isDark: () => dark,
    stats: () => ({ ...stats, targets: targets.size }),
    close: () => {
      http.close();
      for (const t of targets.values()) { try { t.listen.close(); } catch {} for (const c of t.clients.values()) { try { c.close(); } catch {} } }
    },
  };
}

/**
 * The JOINER's init script (page context, test-only — never shipped). Wraps RTCPeerConnection BEFORE the app
 * loads (the app's POOL_SAFE_PC subclasses `globalThis.RTCPeerConnection` at module load, so it inherits this):
 *   · remote candidates (trickled AND inside a remote SDP) are rewritten to the relay's listen port for that
 *     ip:port; non-IPv4 / non-UDP / mDNS candidates are dropped, so no direct path can be found;
 *   · local candidates are never handed to the app (onicecandidate + the localDescription SDP are stripped),
 *     so the host cannot open a direct path either.
 */
export const FORCE_THROUGH_RELAY = ({ ctrl }) => {
  const O = window.RTCPeerConnection;
  const map = async (ip, port) => {
    const r = await fetch(`${ctrl}/map?ip=${encodeURIComponent(ip)}&port=${port}`);
    return (await r.json()).port;
  };
  const rewriteLine = async (line) => {
    // candidate:<f> <comp> <proto> <prio> <ip> <port> typ <type> ...
    const m = /^(a=)?(candidate:\S+ \d+ )(\S+)( \d+ )(\S+) (\d+)( typ .*)$/i.exec(line.trim());
    if (!m) return null;
    const [, a, head, proto, prio, ip, port, tail] = m;
    if (proto.toLowerCase() !== 'udp' || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return null;
    const p = await map(ip, Number(port));
    return `${a ?? ''}${head}${proto}${prio}127.0.0.1 ${p}${tail}`;
  };
  const rewriteSdp = async (sdp) => {
    const out = [];
    for (const line of sdp.split(/\r\n/)) {
      if (line.startsWith('a=candidate:')) { const r = await rewriteLine(line); if (r) out.push(r); } else out.push(line);
    }
    return out.join('\r\n');
  };
  const stripSdp = (sdp) => sdp.split(/\r\n/).filter((l) => !l.startsWith('a=candidate:')).join('\r\n');
  window.__RELAYED = { remoteRewritten: 0, remoteDropped: 0, localSuppressed: 0 };
  class W extends O {
    constructor(...a) {
      super(...a);
      let userHandler = null;
      super.onicecandidate = (e) => { if (e.candidate) { window.__RELAYED.localSuppressed++; return; } userHandler?.call(this, e); };
      Object.defineProperty(this, 'onicecandidate', { configurable: true, get: () => userHandler, set: (fn) => { userHandler = fn; } });
    }
    addEventListener(type, fn, ...r) {
      if (type === 'icecandidate') return super.addEventListener(type, (e) => { if (e.candidate) return; fn.call(this, e); }, ...r);
      return super.addEventListener(type, fn, ...r);
    }
    get localDescription() {
      const d = super.localDescription;
      return d ? { type: d.type, sdp: stripSdp(d.sdp), toJSON() { return { type: this.type, sdp: this.sdp }; } } : d;
    }
    async setRemoteDescription(d) {
      if (d && d.sdp) d = { type: d.type, sdp: await rewriteSdp(d.sdp) };
      return super.setRemoteDescription(d);
    }
    async addIceCandidate(c) {
      if (c && typeof c.candidate === 'string' && c.candidate) {
        const r = await rewriteLine(c.candidate);
        if (!r) { window.__RELAYED.remoteDropped++; return; }
        window.__RELAYED.remoteRewritten++;
        return super.addIceCandidate({ candidate: r, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex, usernameFragment: c.usernameFragment });
      }
      return super.addIceCandidate(c);
    }
  }
  window.RTCPeerConnection = W;
};
