// Standalone LIVE two-peer harness helpers (S194 T17). Production has no __SPARK__, so:
//  - Pixi's own devtools hook (__PIXI_APP_INIT__) hands us the Application -> walk the stage for Text nodes
//  - RTCDataChannel taps decode Trystero frames and regex the JSON for NETSNAPSHOT ticks
export const INIT = (opt = {}) => {
  if (opt.relay) { const O = window.RTCPeerConnection; const W = class extends O { constructor(cfg = {}, ...r) { super({ ...cfg, iceTransportPolicy: 'relay' }, ...r); } }; window.RTCPeerConnection = W; }
  window.__T = { sent: [], recv: [], snapSent: 0, snapRecv: 0, lastSentTick: -1, lastRecvTick: -1, firstSnapRecvAt: null, firstSnapSentAt: null, kinds: {}, pcs: 0, pcStates: [] , iceTypes: []};
  globalThis.__PIXI_APP_INIT__ = (app) => { window.__app = app; };
  const dec = new TextDecoder('utf-8', { fatal: false });
  const scan = (data, dir) => {
    let s;
    try { s = typeof data === 'string' ? data : dec.decode(data instanceof ArrayBuffer ? new Uint8Array(data) : data); } catch { return; }
    const T = window.__T;
    for (const m of s.matchAll(/"kind":"([A-Z_]+)"/g)) { const k = dir + ':' + m[1]; T.kinds[k] = (T.kinds[k] || 0) + 1; }
    if (s.includes('"kind":"NETSNAPSHOT"') || s.includes('"snapshotSeq"')) {
      if (dir === 'tx') { T.snapSent++; T.firstSnapSentAt ??= performance.now(); } else { T.snapRecv++; T.firstSnapRecvAt ??= performance.now(); }
    }
    const tm = s.match(/"tick":(\d+)/);
    if (tm) { const t = +tm[1]; if (dir === 'tx') T.lastSentTick = Math.max(T.lastSentTick, t); else T.lastRecvTick = Math.max(T.lastRecvTick, t); }
  };
  const tapped = new WeakSet();
  const tap = (ch) => { if (!ch || tapped.has(ch)) return; tapped.add(ch); ch.addEventListener('message', (e) => scan(e.data, 'rx')); };
  window.__blackoutUntil = 0;
  const dark = () => performance.now() < window.__blackoutUntil;
  const omd = Object.getOwnPropertyDescriptor(RTCDataChannel.prototype, 'onmessage');
  Object.defineProperty(RTCDataChannel.prototype, 'onmessage', { configurable: true, get() { return omd.get.call(this); },
    set(fn) { tap(this); omd.set.call(this, typeof fn === 'function' ? function (e) { if (dark()) return; return fn.call(this, e); } : fn); } });
  const origSend = RTCDataChannel.prototype.send;
  RTCDataChannel.prototype.send = function (d) { if (dark()) return; tap(this); try { scan(d, 'tx'); } catch {} return origSend.call(this, d); };
  const P = RTCPeerConnection.prototype;
  const origCDC = P.createDataChannel;
  P.createDataChannel = function (...a) { const ch = origCDC.apply(this, a); tap(ch); return ch; };
  const origSRD = P.setRemoteDescription;
  P.setRemoteDescription = function (...a) {
    if (!this.__tapped) { this.__tapped = true; window.__T.pcs++; (window.__PCS ??= []).push(this); this.addEventListener('datachannel', (e) => tap(e.channel));
      this.addEventListener('connectionstatechange', () => window.__T.pcStates.push(this.connectionState));
    }
    return origSRD.apply(this, a);
  };
};

export async function texts(page) {
  return page.evaluate(() => {
    const app = window.__app; if (!app) return null;
    const out = [];
    const walk = (n, vis) => {
      const v = vis && n.visible !== false && (n.alpha ?? 1) > 0;
      if (typeof n.text === 'string' && n.text.trim()) {
        const b = n.getBounds();
        out.push({ text: n.text, visible: v, x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height });
      }
      for (const c of n.children ?? []) walk(c, v);
    };
    walk(app.stage, true);
    return { list: out, screen: { w: app.screen.width, h: app.screen.height } };
  });
}

export async function toCss(page, x, y) {
  return page.evaluate(({ x, y }) => {
    const app = window.__app; const canvas = app.canvas ?? document.querySelector('canvas');
    const r = canvas.getBoundingClientRect();
    // Pixi screen coords map onto the canvas CSS box (object-fit handled by the app's own stage scale).
    return { x: r.left + x * (r.width / app.screen.width), y: r.top + y * (r.height / app.screen.height) };
  }, { x, y });
}

export async function clickText(page, re, { timeout = 60000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const t = await texts(page);
    const hit = t?.list.find((e) => e.visible && re.test(e.text));
    if (hit) { const c = await toCss(page, hit.x, hit.y); await page.mouse.click(c.x, c.y); return hit; }
    await page.waitForTimeout(250);
  }
  const t = await texts(page);
  throw new Error(`clickText ${re} not found; visible texts: ${JSON.stringify(t?.list.filter((e) => e.visible).map((e) => e.text))}`);
}

export async function waitText(page, re, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const t = await texts(page);
    const hit = t?.list.find((e) => e.visible && re.test(e.text));
    if (hit) return hit;
    await page.waitForTimeout(250);
  }
  return null;
}

export const T = (page) => page.evaluate(() => window.__T);

export const iceInfo = (page) => page.evaluate(async () => {
  const out = [];
  for (const pc of window.__PCS ?? []) {
    if (pc.connectionState !== 'connected') continue;
    const st = await pc.getStats(); let pair = null; const c = {};
    st.forEach((r) => { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r; if (r.type === 'local-candidate' || r.type === 'remote-candidate') c[r.id] = r; });
    if (pair) out.push({ local: c[pair.localCandidateId]?.candidateType, remote: c[pair.remoteCandidateId]?.candidateType, proto: c[pair.localCandidateId]?.protocol, rttMs: pair.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null });
  }
  return out;
});
export const fps = (page) => page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
