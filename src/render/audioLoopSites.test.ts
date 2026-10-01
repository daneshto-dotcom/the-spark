/**
 * SPARK — S192 T15: THE MECHANICAL SITE GUARD for music loops and SFX voices.
 *
 * ⛔ A source-text guard proves a line EXISTS, not that it is REACHED (CLAUDE.md, S182 §2). So this
 * one does not look for "the helper is called somewhere". It COUNTS every Web Audio source-creation
 * site in `audioManager.ts`, attributes each to the function it sits in, and pins the totals:
 *
 *   · every looping MUSIC source is built inside `startMusicLoop` (the seamless-loop path), and the
 *     callers of that helper are exactly the three music paths plus the DEV seek;
 *   · every other `loop = true` is a 0.25 s noise buffer, never music;
 *   · every SFX function admits a voice BEFORE it builds a node, and every node is counted.
 *
 * A NEW music path or SFX function changes a count and turns this red until someone routes it
 * through the right helper and updates the pin on purpose. The REACH half (that the helper's region
 * actually lands on the node) is `audioSeamlessAndCap.test.ts`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const RENDER = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(RENDER, '..');
const AM = readFileSync(join(RENDER, 'audioManager.ts'), 'utf8').replace(/\r\n/g, '\n');

/** Split a module into its top-level `function` declarations: name → body text. */
function topLevelFunctions(src: string): Map<string, string> {
  const re = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm;
  const heads: Array<{ name: string; at: number }> = [];
  for (let m; (m = re.exec(src)); ) heads.push({ name: m[1]!, at: m.index });
  const out = new Map<string, string>();
  heads.forEach((h, i) => out.set(h.name, src.slice(h.at, i + 1 < heads.length ? heads[i + 1]!.at : src.length)));
  return out;
}

function countIn(text: string, needle: RegExp): number {
  return (text.match(new RegExp(needle.source, 'g')) ?? []).length;
}

/** name → occurrences of `needle`, for functions with at least one. Also returns the file total. */
function sitesByFunction(needle: RegExp): { byFn: Record<string, number>; total: number } {
  const byFn: Record<string, number> = {};
  for (const [name, body] of topLevelFunctions(AM)) {
    const n = countIn(body, needle);
    if (n > 0) byFn[name] = n;
  }
  return { byFn, total: countIn(AM, needle) };
}

const FNS = topLevelFunctions(AM);

describe('S192 T15 — music loops: every looping music source goes through startMusicLoop', () => {
  it('createBufferSource() sites are exactly these six, by function', () => {
    const { byFn, total } = sitesByFunction(/\.createBufferSource\(/);
    expect(byFn).toEqual({
      startMusicLoop: 1, // ← THE ONE music source
      playOneShot: 1, // recorded SFX samples, never looped
      playGnawSFX: 1, playSplatSFX: 1, playZapBurstSFX: 1, playLaserSFX: 1, // 0.25 s noise buffers
    });
    // Every site sits inside SOME top-level function (the split cannot have lost one).
    expect(Object.values(byFn).reduce((a, b) => a + b, 0)).toBe(total);
  });

  it('startMusicLoop is called by exactly the three music paths and the DEV seek', () => {
    const { byFn } = sitesByFunction(/\bstartMusicLoop\(/);
    expect(byFn).toEqual({
      startMusicLoop: 1, // the declaration itself
      playMusic: 1, enterNonetRealm: 1, startHelgaTheme: 1,
      getAudioDebugApi: 1, // DEV `__SPARK__.audio.seekMusic`
    });
  });

  it('every `loop = true` outside startMusicLoop loops the in-memory NOISE buffer, never music', () => {
    const { byFn } = sitesByFunction(/\.loop\s*=\s*true/);
    expect(byFn).toEqual({ startMusicLoop: 1, playGnawSFX: 1, playSplatSFX: 1, playZapBurstSFX: 1, playLaserSFX: 1 });
    for (const name of ['playGnawSFX', 'playSplatSFX', 'playZapBurstSFX', 'playLaserSFX']) {
      expect(FNS.get(name), `${name} must loop getGnawNoiseBuffer, nothing else`).toMatch(/getGnawNoiseBuffer\(ctx\)/);
    }
  });

  it('startMusicLoop applies the region and starts AT loopStart (the lines the reach test exercises)', () => {
    const body = FNS.get('startMusicLoop')!;
    expect(body).toMatch(/loopRegionFor\(buffer\)/);
    expect(body).toMatch(/source\.loopStart = region\.loopStart/);
    expect(body).toMatch(/source\.loopEnd = region\.loopEnd/);
    expect(body).toMatch(/source\.start\(0, offset\)/);
  });

  it('no other production module builds a buffer source (a music path cannot hide elsewhere)', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!p.endsWith('.ts') || /\.test\.ts$|\.fixtures\.ts$/.test(p)) continue;
        if (p.endsWith(`${sep}audioManager.ts`)) continue;
        if (/\.createBufferSource\(/.test(readFileSync(p, 'utf8'))) offenders.push(relative(SRC, p));
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });
});

describe('S192 T15 — SFX voices: every node-building SFX function admits a voice first', () => {
  const NODE = /\.(?:createOscillator|createBufferSource)\(/;
  const sfxFns = [...FNS].filter(([name, body]) => name !== 'startMusicLoop' && NODE.test(body));

  it('the node-building SFX functions are exactly these eleven', () => {
    expect(sfxFns.map(([n]) => n).sort()).toEqual([
      'playBoomSFX', 'playChargeSFX', 'playClaveSFX', 'playFartSFX', 'playGnawSFX', 'playLaserSFX',
      'playOneShot', 'playSplatSFX', 'playUiClickSFX', 'playUiRefusedSFX', 'playZapBurstSFX',
    ].sort());
  });

  it('each calls admitVoice BEFORE its first node, and returns when refused', () => {
    for (const [name, body] of sfxFns) {
      const admit = body.search(/if \(!admitVoice\((?:'\w+'|kind), /); // playOneShot passes its `kind` parameter
      const firstNode = body.search(NODE);
      expect(admit, `${name}: no admitVoice gate`).toBeGreaterThan(-1);
      expect(admit, `${name}: admitVoice must precede the first node`).toBeLessThan(firstNode);
    }
  });

  it('every created source node is counted (trackSourceNode on the very next line)', () => {
    const lines = AM.split('\n');
    let sites = 0;
    lines.forEach((line, i) => {
      const m = /const (\w+) = (?:ctx|audioContext)\.(?:createOscillator|createBufferSource)\(\);/.exec(line);
      if (m === null) return;
      sites += 1;
      expect(lines[i + 1]!.trim(), `line ${i + 1}`).toBe(`trackSourceNode(${m[1]});`);
    });
    expect(sites).toBe(countIn(AM, NODE)); // no creation written in another shape slipped past
  });

  it('the one known uncapped synth outside audioManager is the NONET juice (board frozen) — pinned', () => {
    const offenders: string[] = [];
    for (const e of readdirSync(RENDER)) {
      if (!e.endsWith('.ts') || /\.test\.ts$|\.fixtures\.ts$/.test(e) || e === 'audioManager.ts') continue;
      if (/\.createOscillator\(/.test(readFileSync(join(RENDER, e), 'utf8'))) offenders.push(e);
    }
    expect(offenders).toEqual(['nonetJuice.ts']);
  });
});
