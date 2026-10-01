/**
 * SPARK — S192 (owner R192-M2/M3) — **EVERY PRODUCTION DAMAGE CALL, AND ITS ATTACK CLASS, COUNTED
 * MECHANICALLY.**
 *
 * The class is a REQUIRED argument of all four funnels, so `tsc` guarantees every site passes ONE. It
 * cannot tell a considered `'physical'` from a lazy one — and the owner's list is exact: *"the rock column
 * definitely magic, wrath of Ra zombie boss rot, scorched earth, stink tower aura … Voltkin's … lightning,
 * chain"*, *"Physical, anything else"*. So this pins WHICH sites answer what, per file. A new damage call
 * moves a number here, which is the moment to decide its class (and to re-pin in the same commit).
 *
 * ⚠ A SOURCE-TEXT GUARD PROVES A LINE EXISTS, NOT THAT IT IS REACHED (CLAUDE.md §2). Reachability is
 * `magicResist.reach.test.ts`, through the real host tick. ⚠ CRLF-normalised before parsing.
 *
 * ⭐ MUTATION-TESTED (S192): flipping `castleGuns.ts`'s `'physical'` to `'magic'` turns two assertions
 * here red (the populations and the file-by-file row); recorded in S192_PROGRESS_magic.md.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function productionSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) productionSources(full, out);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')
      && !entry.name.endsWith('.fixtures.ts')) out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      const t = line.trimStart();
      if (t.startsWith('//') || t.startsWith('*')) return '';
      const i = line.indexOf(' // ');
      return i === -1 ? line : line.slice(0, i);
    })
    .join('\n');
}

function callArgs(src: string, open: number): string[] {
  let depth = 0;
  let argStart = open + 1;
  const args: string[] = [];
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(' || ch === '{' || ch === '[') depth += 1;
    else if (ch === ')' || ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) { args.push(src.slice(argStart, i)); break; }
    } else if (ch === ',' && depth === 1) {
      args.push(src.slice(argStart, i));
      argStart = i + 1;
    }
  }
  return args.map((a) => a.trim()).filter((a) => a.length > 0);
}

type Funnel = 'damageEntity' | 'damageConnector' | 'radial';
/** Index of the class argument in each funnel's signature. */
const CLASS_ARG: Record<Funnel, number> = { damageEntity: 5, damageConnector: 4, radial: 8 };

type Cls = 'physical' | 'magic' | 'magicDot' | 'strikeClassFor' | 'forwarded' | 'OTHER';
function classify(arg: string | undefined): Cls {
  if (arg === "'physical'") return 'physical';
  if (arg === "'magic'") return 'magic';
  if (arg !== undefined && arg.startsWith('magicDot(')) return 'magicDot';
  if (arg === 'strikeClassFor(creature.type)') return 'strikeClassFor';
  if (arg === 'cls') return 'forwarded';
  return 'OTHER';
}

interface Site { readonly file: string; readonly funnel: Funnel; readonly cls: Cls }

export function collectSites(): Site[] {
  const sites: Site[] = [];
  const re = /\b(damageEntity|damageConnector|applyRadialDamage|radialDamage)\(/g;
  for (const file of productionSources(join(ROOT, 'src'))) {
    const src = stripComments(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
    for (const m of src.matchAll(re)) {
      const before = src.slice(Math.max(0, m.index! - 12), m.index!);
      if (/function\s+$/.test(before)) continue; // the declaration
      const name = m[1]!;
      const funnel: Funnel = name === 'damageEntity' ? 'damageEntity' : name === 'damageConnector' ? 'damageConnector' : 'radial';
      const args = callArgs(src, m.index! + name.length);
      sites.push({
        file: file.slice(ROOT.length + 1).replace(/\\/g, '/'),
        funnel,
        cls: classify(args[CLASS_ARG[funnel]]),
      });
    }
  }
  return sites;
}

const key = (s: Site): string => `${s.file} ${s.funnel} ${s.cls}`;

/**
 * ⭐ S193 — THE BYPASS CENSUS. The class census above only sees damage that goes THROUGH a funnel. A
 * new site that subtracts from a pool directly (or calls the creature / bag primitive under the funnel)
 * would dodge MRES silently, so every such line in production is counted here, file by file.
 */
export function collectBypasses(): Record<string, number> {
  const pats: ReadonlyArray<readonly [string, RegExp]> = [
    ['ehp-=', /\.ehp\s*-=/g],
    ['castleHp', /castleHp\s*=\s*Math\.max\(0,/g],
    ['hp-=', /\.hp\s*-=/g],
    ['damageFifths+=', /damageFifths\s*\+=/g],
    ['damageCreature(', /(?<!function\s)\bdamageCreature\(/g],
    ['damageStinkCloud(', /(?<!function\s)\bdamageStinkCloud\(/g],
    // ⭐ S193 (audit LOW) — the two other spellings of a direct write; 0 today, so absent from the pin below.
    ['ehp=…ehp-', /\.ehp\s*=\s*[^;]*\.ehp\s*-/g],
    ['castleHp-=', /castleHp\s*-=/g],
  ];
  const out: Record<string, number> = {};
  for (const file of productionSources(join(ROOT, 'src'))) {
    const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
    if (rel.startsWith('src/arcade/')) continue; // Pitch Masters is off-limits (owner, S192)
    const src = stripComments(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
    for (const [name, re] of pats) {
      const n = [...src.matchAll(re)].length;
      if (n > 0) out[`${rel} ${name}`] = n;
    }
  }
  return out;
}

describe('S192 — the attack-class census of every production damage call', () => {
  const sites = collectSites();

  // ⭐ S193 (merge of master) — 29 → 35: the shared Ra column (`raColumn.ts`, perk AND Pharaoh boss) replaced
  // `powerOfRa.ts`'s and the ritual's own calls; SCORCHED EARTH's five arms; the hub ladder blast; the
  // connector overkill carry (`severWithCarry`).
  it('finds all 35 sites (20 + 8 + 7) and every one names a class this file recognises', () => {
    expect(sites.filter((s) => s.funnel === 'damageEntity').length).toBe(20);
    expect(sites.filter((s) => s.funnel === 'damageConnector').length).toBe(8);
    expect(sites.filter((s) => s.funnel === 'radial').length).toBe(7);
    expect(sites.filter((s) => s.cls === 'OTHER'), 'an unrecognised class argument — decide and pin it').toEqual([]);
  });

  it('pins the populations: magic, DoT-magic, per-unit, forwarded, physical', () => {
    const count = (c: Cls): number => sites.filter((s) => s.cls === c).length;
    expect(count('magic')).toBe(6);
    expect(count('magicDot')).toBe(6);
    expect(count('strikeClassFor')).toBe(6);
    expect(count('forwarded')).toBe(3);
    expect(count('physical')).toBe(14);
  });

  it('pins WHICH site answers WHAT — his list, file by file', () => {
    const tally: Record<string, number> = {};
    for (const s of sites) tally[key(s)] = (tally[key(s)] ?? 0) + 1;
    expect(tally).toEqual({
      // ── MAGIC (R192-M2) ──
      // the ONE Ra column (S191/S192 `landRaColumn`): POWER / WRATH OF RA, the bot cast AND the Pharaoh boss's
      // ritual (R190-E). Magic PER SHARE — each split share is rescaled by its own target (`magicResist.reach.test.ts`).
      'src/state/racial/raColumn.ts damageConnector magic': 1, // a structure's share
      'src/state/racial/raColumn.ts damageEntity magic': 1, // a creature / Helga / shape / bag share
      'src/state/creatures/voltkinChain.ts damageEntity magic': 1, // chain — creature hop
      'src/state/creatures/voltkinChain.ts damageConnector magic': 1, // chain — connector hop
      'src/state/bossSkills.ts damageEntity magicDot': 1, // zombie boss ROT
      // SCORCHED GROUND (passive) + SCORCHED EARTH (the cast): creatures and Helga are DoT beats; the
      // structure arm is a DoT beat too; a lone shape and a landed bag (MRES = DEF = 0) a plain magic fifth.
      'src/state/racial/scorchedGround.ts damageEntity magicDot': 2, // creatures · Helga
      'src/state/racial/scorchedGround.ts damageConnector magicDot': 1, // structures
      'src/state/racial/scorchedGround.ts damageEntity magic': 2, // lone shapes · stink bags
      'src/state/defenders/stinkTower.ts radial magicDot': 1, // STINK TOWER aura
      'src/state/defenders/stinkCloud.ts radial magicDot': 1, // the landed-bag cloud (HIS, S192 Q-C)
      // ── A UNIT'S OWN STRIKE: physical, the Voltkin's zap magic (⚠ MINE, Q-V) ──
      'src/state/creatures/creatureAttack.ts damageEntity strikeClassFor': 5,
      'src/state/creatures/creatureAttack.ts damageConnector strikeClassFor': 1,
      // ── the radial helper's three arms carry their caller's class ──
      'src/state/damage.ts damageEntity forwarded': 3,
      // ── PHYSICAL (R192-M3) ──
      'src/state/castleGuns.ts damageEntity physical': 1,
      'src/state/defenders/defenderLifecycle.ts damageEntity physical': 1, // laser · Helga's slap
      'src/state/world.ts damageEntity physical': 2, // raid on a creature / Helga
      'src/state/world.ts damageConnector physical': 1, // raid on a connector
      'src/state/creatures/suicideBlast.ts radial physical': 1,
      'src/state/creatures/suicideBlast.ts damageConnector physical': 1,
      'src/state/droneLifecycle.ts radial physical': 1,
      'src/state/damage.ts radial physical': 1, // a landed bag bursting
      'src/state/damage.ts damageConnector physical': 1, // the overkill carry — already-landed damage, never re-rescaled
      'src/state/potatoLifecycle.ts damageConnector physical': 1, // the hub self-destruct LADDER blast (S191 C-5)
      'src/state/potatoLifecycle.ts damageEntity physical': 1, // ditto, its unit / shape shares
      'src/state/defenders/stinkTower.ts radial physical': 2, // death blast · bag splash
    });
  });

  // ⭐ S193 — the funnels are the only places a pool is written; a new direct write dodges MRES.
  it('pins every direct pool write and every call under a funnel — a new one must route through a funnel', () => {
    expect(collectBypasses()).toEqual({
      'src/state/damage.ts castleHp': 1, // the castle arm — MRES applied just above it
      'src/state/damage.ts damageCreature(': 1, // the creature arm, after `landedFifths`
      'src/state/damage.ts ehp-=': 2, // Helga arm (after `landedFifths`) · a landed bag (`damageStinkCloud`)
      'src/state/damage.ts hp-=': 1, // a shape (MRES = DEF = 0)
      'src/state/damage.ts damageFifths+=': 1, // `damageConnector`, after `landedFifths`
      'src/state/damage.ts damageStinkCloud(': 1, // `damageEntity`'s bag arm
      'src/state/creatures/creatureLifecycle.ts ehp-=': 1, // `damageCreature` itself
      // the hub ladder blast's bag share: physical (R192-M3), and a bag has MRES = DEF = 0 anyway
      'src/state/potatoLifecycle.ts damageStinkCloud(': 1,
    });
  });
});
