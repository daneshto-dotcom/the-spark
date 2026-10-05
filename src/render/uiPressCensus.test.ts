/**
 * ⭐ S195 N5 (owner: *"everything clickable should actually show that it's clicking"* — castle upgrades such
 * as gatherer speed, goblin feed, tier-3 tower feeds; hover already reads well) — **THE PRESS CENSUS.**
 *
 * `uiSkinCensus.test.ts` already enumerates every clickable line in `src/render/**` and `src/main.ts` and
 * claims each as SKINNED or EXEMPT. This file DERIVES the SKINNED rows from that file's source (never from
 * memory — S182 rule 2: an enumeration is only honest when it is mechanical) and demands, for each, the
 * PRESS half: which mechanism sinks the surface on `pointerdown` and lifts it on `pointerup` /
 * `pointerupoutside`. Four mechanisms exist, and each is verified against the code, not the claim:
 *
 *   · GRAMMAR — `attachButtonFeedback(` on that line (scale 0.97 about the pivot; T8: the hit stays the
 *     rest-size plate through `hitRectAtScale`).
 *   · CHIP    — `attachChipHover(<that container>,` in the file (the S195 press half: plate tint below rest +
 *     a dark veil inside the chip's own rect; a children-bounds hit, so never a scale).
 *   · STATE   — a redrawn plate whose `skinButtonFx` state expression carries `'press'` from a pointer-down
 *     latch; the claim names the latch expression and the file must contain it.
 *   · CSS     — a DOM control with an `:active` rule.
 *
 * A SKINNED row with none of these fails here until someone wires it — or lists it under OTHER_TREE with
 * the tree that owns the file, which goes STALE (and fails) the moment that file gains a press, so the
 * merge owner removes the row instead of carrying it forever.
 *
 * Plus the rule that catches a NEW surface before it is even claimed: any `skinButtonFx(` call whose state
 * expression knows about `'hover'` has a pointer model, so it must know about `'press'` too.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const CENSUS_FILE = join(__dirname, 'uiSkinCensus.test.ts');

type Press = 'GRAMMAR' | 'CHIP' | 'STATE' | 'CSS';
interface Claim {
  readonly file: string;
  readonly match: string;
  readonly press: Press;
  /** CHIP: the container variable handed to `attachChipHover`. STATE: the latch expression(s) in the state. */
  readonly via: readonly string[];
}

/** The press claim for every SKINNED census row (file + match must equal the census row verbatim). */
const PRESS: readonly Claim[] = [
  { file: 'src/render/titleScreen.ts', match: 'attachButtonFeedback(', press: 'GRAMMAR', via: [] },
  { file: 'src/render/arcadeOverlay.ts', match: 'attachButtonFeedback(', press: 'GRAMMAR', via: [] },
  { file: 'src/render/botSetupOverlay.ts', match: 'raceBtn.', press: 'CHIP', via: ['raceBtn'] },
  { file: 'src/render/botSetupOverlay.ts', match: 'teamBtn.', press: 'CHIP', via: ['teamBtn'] },
  { file: 'src/render/botSetupOverlay.ts', match: 'personaBtn.', press: 'CHIP', via: ['personaBtn'] },
  { file: 'src/render/botSetupOverlay.ts', match: 'diffBtn.', press: 'CHIP', via: ['diffBtn'] },
  { file: 'src/render/botSetupOverlay.ts', match: 'attachButtonFeedback(c, bg, onClick, { hit: { x: -24', press: 'GRAMMAR', via: [] },
  { file: 'src/render/botSetupOverlay.ts', match: 'attachButtonFeedback(c, bg, onClick, { hit: { x: -180', press: 'GRAMMAR', via: [] },
  // The castle panel: control rows, inventory slots, build tiles — three latches, one per surface kind.
  { file: 'src/render/castlePanel.ts', match: 'box.', press: 'STATE', via: ["rowDown ? 'press'", "slotDown ? 'press'", "tileDown ? 'press'"] },
  { file: 'src/render/codexOverlay.ts', match: 'attachButtonFeedback(', press: 'GRAMMAR', via: [] },
  { file: 'src/render/codexOverlay.ts', match: 'tile.', press: 'CHIP', via: ['tile'] },
  { file: 'src/render/connectionLostOverlay.ts', match: 'returnBtn.', press: 'CHIP', via: ['returnBtn'] },
  { file: 'src/render/draftOverlay.ts', match: 'this.container.', press: 'STATE', via: ["this.pressed ? 'press'"] },
  { file: 'src/render/exitButton.ts', match: 'attachButtonFeedback(', press: 'GRAMMAR', via: [] },
  { file: 'src/render/lobbyScreen.ts', match: 'this.joinButton.', press: 'CHIP', via: ['this.joinButton'] },
  { file: 'src/render/lobbyScreen.ts', match: 'attachButtonFeedback(', press: 'GRAMMAR', via: [] },
  { file: 'src/render/seatRack.ts', match: "cell.on('pointertap'", press: 'CHIP', via: ['cell'] },
  { file: 'src/render/seatRack.ts', match: "teamChip.on('pointertap'", press: 'CHIP', via: ['teamChip'] },
  { file: 'src/render/racePicker.ts', match: 'root.', press: 'CHIP', via: ['root'] },
  { file: 'src/render/settingsOverlay.ts', match: "createElement('button')", press: 'CSS', via: [] },
  { file: 'src/render/settingsOverlay.ts', match: "style.cursor = 'pointer'", press: 'CSS', via: [] },
];

/**
 * ⛔ NOT DONE HERE — SKINNED rows whose file another S195 tree owns (S195_CLOUD_AGENT_RULES: off-limits
 * files are not edited from `s195/ui-4`). Each row is STALE-CHECKED: the moment the file carries `'press'`
 * the row must go, so this list cannot outlive the gap it records.
 */
const OTHER_TREE: ReadonlyArray<{ file: string; match: string; tree: string }> = [
  { file: 'src/render/matchBoard.ts', match: "this.container.on('pointermove'", tree: 'match board tree (T14/N14): page tabs, overview rows, CONTINUE — hot ? hover : rest, no press latch' },
  { file: 'src/render/matchBoard.ts', match: "this.container.on('pointertap'", tree: 'match board tree (T14/N14)' },
];

/** Controls-driven surfaces (the census pins these separately): the latch expression each must carry. */
const CONTROLS_DRIVEN_PRESS: ReadonlyArray<{ file: string; via: string | null; tree?: string }> = [
  { file: 'src/render/footerBand.ts', via: "this.pressed ? 'press'" },
  // ⛔ NOT DONE HERE — the card's FIX / SCRAP / FEED + auto-build toggles (owner: *"goblin feed, tier-3 tower
  // feeds"*). `characterSheet.ts` belongs to another tree; the one-line hunk is in the ui-4 report.
  { file: 'src/render/characterSheet.ts', via: null, tree: 'character sheet tree' },
];

/**
 * Clickables the census EXEMPTS from a plate but which still take a click and still show no press. Named
 * so the gap is visible, stale-checked so it cannot be carried once closed.
 */
const HOVER_ONLY_KNOWN: ReadonlyArray<{ file: string; match: string; why: string }> = [
  { file: 'src/main.ts', match: 'settingsIcon.', why: 'the HUD gear: alpha 0.55 → 1 on hover, nothing on press; main.ts is outside the ui-4 file boundary — the alpha-dip hunk is in the report' },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.endsWith('.fixtures.ts')) out.push(p);
  }
  return out;
}

/** Comments stripped, so a docblock that says 'press' claims nothing. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

/** The argument text of every `name(` call in `src`, balanced on parentheses. */
function callArgs(src: string, name: string): Array<{ line: number; args: string }> {
  const out: Array<{ line: number; args: string }> = [];
  let from = 0;
  for (;;) {
    const i = src.indexOf(name + '(', from);
    if (i < 0) break;
    let depth = 0;
    let j = i + name.length;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (ch === '(') depth++;
      else if (ch === ')') { depth--; if (depth === 0) break; }
    }
    out.push({ line: src.slice(0, i).split('\n').length, args: src.slice(i + name.length + 1, j) });
    from = j + 1;
  }
  return out;
}

/** The SKINNED rows, read out of the census test's own source. */
function skinnedCensusRows(): Array<{ file: string; match: string }> {
  const src = readFileSync(CENSUS_FILE, 'utf8');
  const rows: Array<{ file: string; match: string }> = [];
  const re = /\{\s*file:\s*'([^']+)',\s*match:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"),\s*status:\s*([SE])\b/g;
  for (const m of src.matchAll(re)) {
    if (m[4] !== 'S') continue;
    rows.push({ file: m[1]!, match: (m[2] ?? m[3] ?? '').replace(/\\'/g, "'") });
  }
  return rows;
}

const FILES = [join(ROOT, 'src', 'main.ts'), ...walk(join(ROOT, 'src', 'render'))];
const OWNER_EXCLUDED = /src\/render\/(arcade|nonet|sudokuOverlay)/; // R194-24: the games themselves
const OTHER_TREE_FILES = new Set(['src/render/characterSheet.ts', 'src/render/matchBoard.ts']);

describe('⛔ S195 N5 — every SKINNED clickable also shows a PRESS (derived from the skin census)', () => {
  const skinned = skinnedCensusRows();
  const key = (r: { file: string; match: string }): string => `${r.file} :: ${r.match}`;

  it('anti-vacuity: the census parse sees the known rows', () => {
    expect(skinned.length).toBeGreaterThan(15);
    expect(skinned.some((r) => r.file === 'src/render/castlePanel.ts' && r.match === 'box.')).toBe(true);
    expect(skinned.some((r) => r.file === 'src/render/seatRack.ts' && r.match === "cell.on('pointertap'")).toBe(true);
  });

  it('every SKINNED census row has exactly one press claim, or is an OTHER_TREE row', () => {
    const unclaimed = skinned.filter((r) => !PRESS.some((p) => p.file === r.file && p.match === r.match) && !OTHER_TREE.some((o) => o.file === r.file && o.match === r.match));
    expect(unclaimed.map(key), 'SKINNED but no press claim — wire the press, then claim it here').toEqual([]);
    const dup = PRESS.filter((p, i) => PRESS.findIndex((q) => q.file === p.file && q.match === p.match) !== i);
    expect(dup.map(key)).toEqual([]);
  });

  it('every press claim and every OTHER_TREE row still names a SKINNED census row (no stale rows)', () => {
    const stale = [...PRESS, ...OTHER_TREE].filter((p) => !skinned.some((r) => r.file === p.file && r.match === p.match));
    expect(stale.map(key)).toEqual([]);
  });

  it('each claim\'s mechanism is REAL in the code it names', () => {
    for (const c of PRESS) {
      const src = code(join(ROOT, c.file));
      const lines = src.split('\n').filter((l) => l.includes(c.match));
      expect(lines.length, `${key(c)}: the claimed line exists`).toBeGreaterThan(0);
      switch (c.press) {
        case 'GRAMMAR':
          expect(lines.every((l) => l.includes('attachButtonFeedback(')), `${key(c)}: every claimed line IS the grammar call`).toBe(true);
          break;
        case 'CHIP':
          for (const v of c.via) expect(src, `${key(c)}: attachChipHover(${v},`).toMatch(new RegExp(`attachChipHover\\(\\s*${v.replace(/[.$]/g, '\\$&')}\\s*,`));
          break;
        case 'STATE':
          expect(c.via.length).toBeGreaterThan(0);
          for (const v of c.via) expect(src, `${key(c)}: latch ${v}`).toContain(v);
          // And the latch is SET by a pointer-down and CLEARED by a release that may land outside.
          expect(src, `${key(c)}: pointerdown`).toContain("'pointerdown'");
          expect(src, `${key(c)}: pointerupoutside`).toContain("'pointerupoutside'");
          break;
        case 'CSS':
          expect(src, `${key(c)}: an :active rule`).toContain(':active{');
          break;
      }
    }
  });

  it('⛔ an OTHER_TREE row goes stale (remove it) once its file carries a press', () => {
    for (const o of OTHER_TREE) {
      const src = code(join(ROOT, o.file));
      expect(src.includes("'press'"), `${key(o)} (${o.tree}) now has a press — move it into PRESS`).toBe(false);
    }
  });

  it('the Controls-driven surfaces carry the latch (footer) or are named NOT DONE with their tree (card)', () => {
    for (const s of CONTROLS_DRIVEN_PRESS) {
      const src = code(join(ROOT, s.file));
      if (s.via !== null) expect(src, s.file).toContain(s.via);
      else expect(src.includes("'press'"), `${s.file} (${s.tree}) now has a press — give it a latch expression here`).toBe(false);
    }
  });

  /**
   * ⭐ S195 (audit) — a Controls-driven surface drawn with a BARE `state: 'rest'` every frame is a control that can
   * never show hover or press (the collapse tab was one: hit-tested FIRST by controls.ts, skinned 'rest' forever).
   * Each such call must be a READOUT, exempted here by a substring of its own rect expression and a reason.
   */
  const BARE_REST_EXEMPT: ReadonlyArray<{ file: string; rect: string; why: string }> = [
    { file: 'src/render/footerBand.ts', rect: 'carry.y - CHIP_H / 2', why: 'the CARRY READOUT plate — isOverBandSurface claims it (a surface, not a control); it has no click' },
    { file: 'src/render/characterSheet.ts', rect: 'x + PAD, top, PORTRAIT, PORTRAIT', why: 'the card PORTRAIT frame — no hit-test names it; it is decoration, not a control' },
  ];

  it('⛔ no Controls-driven control is skinned with a bare literal rest (an exempt READOUT names its rect and why)', () => {
    for (const s of CONTROLS_DRIVEN_PRESS) {
      const src = code(join(ROOT, s.file));
      const bare = callArgs(src, 'skinButtonFx').filter((c) => /state:\s*'rest'/.test(c.args));
      const offenders = bare.filter((c) => !BARE_REST_EXEMPT.some((e) => e.file === s.file && c.args.includes(e.rect)));
      expect(offenders.map((c) => `${s.file}:${c.line}`), `${s.file}: bare 'rest' on a control`).toEqual([]);
    }
    for (const e of BARE_REST_EXEMPT) {
      expect(e.why.length).toBeGreaterThan(20);
      const src = code(join(ROOT, e.file));
      expect(callArgs(src, 'skinButtonFx').some((c) => c.args.includes(e.rect) && /state:\s*'rest'/.test(c.args)), `${e.file} :: ${e.rect} is still a bare-rest site (else drop the exemption)`).toBe(true);
    }
  });

  it('⛔ every skinButtonFx site that knows HOVER knows PRESS (a pointer model without a press is the N5 defect)', () => {
    const offenders: string[] = [];
    for (const abs of FILES) {
      const file = relative(ROOT, abs).split('\\').join('/');
      if (OWNER_EXCLUDED.test(file) || file === 'src/render/uiSkin.ts' || file === 'src/render/uiSkinButton.ts') continue;
      for (const call of callArgs(code(abs), 'skinButtonFx')) {
        if (call.args.includes("'hover'") && !call.args.includes("'press'")) offenders.push(`${file}:${call.line}`);
      }
    }
    const mine = offenders.filter((o) => !OTHER_TREE_FILES.has(o.split(':')[0]!));
    expect(mine, 'hover-without-press skin sites in ui-4 files').toEqual([]);
    // The other trees' sites are the known gap — recorded, and stale-checked above through OTHER_TREE / CONTROLS_DRIVEN_PRESS.
    const theirs = offenders.filter((o) => OTHER_TREE_FILES.has(o.split(':')[0]!));
    expect(theirs.length, 'the known other-tree gap still exists (else drop OTHER_TREE_FILES)').toBeGreaterThan(0);
  });

  it('every still plate (skinStaticPlate) lives in a file whose buttons carry a grammar or chip press', () => {
    for (const abs of FILES) {
      const src = code(abs);
      if (!src.includes('skinStaticPlate(')) continue;
      if (relative(ROOT, abs).split('\\').join('/') === 'src/render/uiSkinButton.ts') continue;
      expect(src.includes('attachButtonFeedback(') || src.includes('attachChipHover('), `${relative(ROOT, abs)}: a still plate without a press mechanism`).toBe(true);
    }
  });

  it('the two shared mechanisms themselves sink on pointerdown and lift on pointerupoutside', () => {
    const chip = code(join(ROOT, 'src/render/uiSkinButton.ts'));
    expect(chip).toContain("c.on('pointerdown', sink)");
    expect(chip).toContain("c.on('pointerup', lift)");
    expect(chip).toContain("c.on('pointerupoutside', lift)");
    const grammar = code(join(ROOT, 'src/render/buttonFeedback.ts'));
    expect(grammar).toContain("c.on('pointerdown'");
    expect(grammar).toContain("c.on('pointerupoutside'");
  });

  it('the known hover-only clickables are still hover-only (stale check) and say why', () => {
    for (const h of HOVER_ONLY_KNOWN) {
      const src = code(join(ROOT, h.file));
      expect(h.why.length).toBeGreaterThan(20);
      const lines = src.split('\n').filter((l) => l.includes(h.match));
      expect(lines.length, `${key(h)} exists`).toBeGreaterThan(0);
      expect(lines.some((l) => l.includes("'pointerdown'")), `${key(h)} now has a press — drop it from HOVER_ONLY_KNOWN`).toBe(false);
    }
  });

  it('the census, for the report', () => {
    const by = (p: Press): number => PRESS.filter((c) => c.press === p).length;
    expect(PRESS.length + OTHER_TREE.length).toBe(skinned.length);
    expect(by('GRAMMAR') + by('CHIP') + by('STATE') + by('CSS')).toBe(PRESS.length);
  });
});
