import { chromium } from 'playwright';
import fs from 'node:fs';
const js = fs.readFileSync(process.argv[2], 'utf8');
const m = js.match(/[A-Za-z_$]+\('urls: "([^"]+)"','username: "([^"]+)"',' credential: "([^"]+)"'\)/);
if (!m) { console.log('NO TURN TRIPLE FOUND'); process.exit(2); }
const [, base, username, credential] = m;
const variants = process.argv.slice(3).length ? process.argv.slice(3) : [base];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const url of variants) {
  const res = await page.evaluate(async ({ url, username, credential }) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: [url], username, credential }], iceTransportPolicy: 'relay' });
    pc.createDataChannel('x');
    const cands = [];
    const t0 = performance.now();
    let firstRelayMs = null;
    pc.onicecandidate = (e) => { if (e.candidate) { cands.push(e.candidate.candidate); if (firstRelayMs === null && / typ relay/.test(e.candidate.candidate)) firstRelayMs = Math.round(performance.now() - t0); } };
    const errs = [];
    pc.onicecandidateerror = (e) => errs.push(`${e.errorCode} ${e.errorText} ${e.url}`);
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise((r) => { const to = setTimeout(r, 12000); pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(to); r(); } }; });
    pc.close();
    return { relay: cands.filter((c) => / typ relay/.test(c)).map((c) => c.replace(/^candidate:\S+ \d+ (\S+) \d+ (\S+) (\d+).*/, '$1 $2:$3')), firstRelayMs, errs };
  }, { url, username, credential });
  console.log(url, JSON.stringify(res));
}
await browser.close();
