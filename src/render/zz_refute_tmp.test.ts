import { describe, expect, it } from 'vitest';
import { drawCastleShotVfx, drawRaceGathererMark, drawRaceKeepFallback } from './raceMotifs.ts';
import type { RaceId } from '../state/races.ts';
import { KEEP_H, KEEP_W } from '../constants.ts';

class F {
  readonly calls: { op: string; args: number[] }[] = [];
  private p(op: string, a: number[]) { this.calls.push({ op, args: a }); return this; }
  rect(...a: number[]) { return this.p('rect', a); }
  circle(...a: number[]) { return this.p('circle', a); }
  moveTo(...a: number[]) { return this.p('moveTo', a); }
  lineTo(...a: number[]) { return this.p('lineTo', a); }
  quadraticCurveTo(...a: number[]) { return this.p('quadraticCurveTo', a); }
  arc(...a: number[]) { return this.p('arc', a); }
  fill() { return this.p('fill', []); }
  stroke() { return this.p('stroke', []); }
  sig() { return this.calls.map((c) => `${c.op}(${c.args.map((n) => n.toFixed(2)).join(',')})`).join('|'); }
}
const SEVENTH = 'goblins' as unknown as RaceId;
const asG = (f: F) => f as unknown as Parameters<typeof drawRaceGathererMark>[0];

describe('what a 7th unhandled race actually draws', () => {
  it('keep fallback', () => {
    const f = new F();
    drawRaceKeepFallback(asG(f), 100, 200, KEEP_W, KEEP_H, 10, 0xff3b6b, SEVENTH);
    console.log('KEEP calls =', f.calls.length, '| ops =', f.calls.map((c) => c.op).join(','));
    console.log('KEEP passes >3 assertion?', f.calls.length > 3);
    const rects = f.calls.filter((c) => c.op === 'rect');
    console.log('KEEP body band present?', !!rects.find((r) => r.args[2] === KEEP_W && r.args[3] === KEEP_H - 10),
      '| gate present?', !!rects.find((r) => r.args[2] === 18 && r.args[3] === 18));
  });
  it('gatherer mark', () => {
    const f = new F();
    drawRaceGathererMark(asG(f), 500, 400, 11, 0x3bd7ff, SEVENTH);
    console.log('GATHERER calls =', f.calls.length, '| passes >0 assertion?', f.calls.length > 0);
    const s = new F(); const b = new F();
    drawRaceGathererMark(asG(s), 0, 0, 5, 0xffffff, SEVENTH);
    drawRaceGathererMark(asG(b), 0, 0, 10, 0xffffff, SEVENTH);
    console.log('GATHERER scales-with-radius assertion passes?', s.sig() !== b.sig());
  });
  it('castle vfx', () => {
    const f = new F();
    drawCastleShotVfx(asG(f), 100, 100, 300, 220, 0.5, 0xff3b6b, SEVENTH);
    console.log('CASTLE calls =', f.calls.length, '| passes >0 assertion?', f.calls.length > 0);
    const z = new F(); const o = new F();
    drawCastleShotVfx(asG(z), 100, 100, 300, 220, 0, 0xff3b6b, SEVENTH);
    drawCastleShotVfx(asG(o), 100, 100, 300, 220, 1, 0xff3b6b, SEVENTH);
    console.log('CASTLE travels assertion passes?', z.sig() !== o.sig());
  });
});
