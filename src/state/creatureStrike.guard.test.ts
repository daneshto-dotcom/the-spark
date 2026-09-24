/**
 * SPARK — S190 (s188/draft-atk) — ⛔ THE GUARD ON "WHO IS ALLOWED TO DERIVE A STRIKE FROM A CONFIG?"
 *
 * The strike twin of `creatureMaxPool.guard.test.ts`, for the same reason. Before S190 a creature's
 * per-hit strike was re-derived as `attackFifths(cfg.atk, cfg.pen)` at every place it was spent —
 * correct while a strike was a pure function of TYPE, and exactly the S187 defect once the draft's
 * ATK / PEN picks made two units of one type hit differently: `draftedAttackFifths` had no consumer,
 * and every strike site went on reading the config.
 *
 * ⛔ **A MECHANICAL ENUMERATION, NOT A SOURCE-TEXT ASSERTION (S182 lesson 2).** It COUNTS every code
 * `attackFifths(` call in the production tree and pins each file's total with a written reason. A new
 * derivation anywhere fails this test until somebody writes down why it is not a creature's strike —
 * or converts it to `creatureAttackFifths(creature)`. The REACH half, that each converted arm really
 * lands the creature's own number, is `creatures/draftStrikeArms.test.ts` and `draftAtkReaches.test.ts`.
 *
 * ⚠ CRLF: the tree is mixed, so every line split is `\r?\n`.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

/**
 * Every code `attackFifths(` call ALLOWED to survive, and why. Each entry is a claim a future session
 * can check in seconds; if one becomes false, convert the site — do not widen the count.
 */
const SANCTIONED: ReadonlyArray<{ file: string; occurrences: number; why: string }> = [
  {
    file: 'state/creatures/creature.ts',
    occurrences: 2,
    why:
      'The two legitimate ones. `creatureAttackFifths` IS the fallback for a creature with no baked ' +
      'strike, and `makeCreature` computes the base strike it then buffs.',
  },
  {
    file: 'state/draft.ts',
    occurrences: 2,
    why: '`draftedAttackFifths` and `raceUnitAttackAfterPicks` compose the base strike in order to BUFF it.',
  },
  { file: 'state/stats.ts', occurrences: 1, why: 'The DEFINITION of `attackFifths`.' },
  {
    file: 'state/defenders/defenderLifecycle.ts',
    occurrences: 1,
    why:
      'A DEFENDER’s strike (Helga, the laser turret). The draft reaches neither a defender’s pool nor ' +
      'its strike — S187 wired the pool half to creatures only. ⚠ OPEN OWNER QUESTION (S190 Q2): does ' +
      'an ATK pick buff Helga? Not built.',
  },
  {
    file: 'state/defenders/stinkTower.ts',
    occurrences: 3,
    why: 'The stink tower’s death blast and its bag’s aura — a tower and a bag, not a creature.',
  },
  {
    file: 'state/damage.ts',
    occurrences: 3,
    why:
      'A landed stink bag’s own death burst (the unit and shape arms), plus the error-message TEXT in ' +
      '`damageConnector` that names the function. No creature strike.',
  },
  { file: 'state/castleGuns.ts', occurrences: 1, why: 'The castle gun. The castle has its own ATK/PEN upgrade track.' },
  { file: 'state/castleUpgrades.ts', occurrences: 3, why: 'The castle upgrade track: current shot and the two next-level previews.' },
  { file: 'state/world.ts', occurrences: 1, why: 'The PLAYER raid (`RAID_ATK`, `RAID_PEN`) — a seat’s click, not a creature.' },
  { file: 'state/racial/powerOfRa.ts', occurrences: 1, why: 'POWER OF RA — a seat perk’s sky strike, not a creature.' },
  {
    file: 'state/bossSkillsPharaohRitual.ts',
    occurrences: 2,
    why:
      'The Pharaoh boss’s ritual COLUMN — a SKILL with its own stat line (`RA_COLUMN_ATK/PEN`), not the ' +
      'boss’s own strike. ⚠ OPEN OWNER QUESTION (S190 Q1): does an ATK pick buff a boss skill? Not built.',
  },
  {
    file: 'render/characterSheetRadar.ts',
    occurrences: 1,
    why: 'The radar SHOT axis CEILING — the roster’s biggest type strike, a normaliser, not a creature’s number.',
  },
  {
    file: 'render/characterSheetModel.ts',
    occurrences: 2,
    why:
      '`statRowsFor`’s fallback "N a swing" for a caller that holds only stat points (the defender ' +
      'sheet), and the tower EMPLACEMENT row. ⭐ S190 P2.5: the CREATURE card passes its own strike in.',
  },
  {
    file: 'render/damageNumbers.ts',
    occurrences: 1,
    why:
      '`fatalBlowFifths`’ DEFENDER arm (a defender config). Its CREATURE arm reads the accessor since ' +
      'S190 P2.5 — the guard went 2 → 1 in that commit.',
  },
];

/** Strip block comments and whole-line comments before counting CODE. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('*'))
    .join('\n');
}

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const count = (src: string, re: RegExp) => (src.match(re) ?? []).length;
const derivations = (rel: string) => count(codeOnly(read(rel)), /attackFifths\s*\(/g);

function productionFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const rel = dir === '' ? name : `${dir}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) {
        if (rel !== 'dev') walk(rel);
      } else if (name.endsWith('.ts') && !name.includes('.test.')) {
        files.push(rel);
      }
    }
  };
  walk('');
  return files;
}

describe('creature strike — the derivation guard', () => {
  it('every sanctioned file still derives exactly as many times as its reason claims', () => {
    for (const s of SANCTIONED) expect(derivations(s.file), `${s.file} — ${s.why}`).toBe(s.occurrences);
  });

  it('nothing outside the sanctioned list derives a strike (the whole src tree, not two folders)', () => {
    const sanctioned = new Set(SANCTIONED.map((s) => s.file));
    const unexpected = productionFiles().filter((f) => !sanctioned.has(f) && derivations(f) > 0);
    expect(
      unexpected,
      'A new `attackFifths(` appeared. If it is a CREATURE’s strike, read `creatureAttackFifths(creature)` ' +
        'instead; otherwise add the file to SANCTIONED with a written reason.',
    ).toEqual([]);
  });

  it('every creature strike site reads the ACCESSOR — the six reducer arms counted exactly', () => {
    const arms = codeOnly(read('state/creatures/creatureAttack.ts'));
    expect(count(arms, /hellspawnStrikeFifths\(creature, creatureAttackFifths\(creature\)\)/g)).toBe(6);
    expect(count(arms, /hellspawnStrikeFifths\(/g), 'no seventh arm on another derivation').toBe(6);
    for (const f of [
      'state/creatures/voltkinChain.ts',
      'state/creatures/suicideBlast.ts',
      'state/droneLifecycle.ts',
      'state/racial/corpseEater.ts',
      'render/damageNumbers.ts',
      'render/characterSheetModel.ts',
    ]) {
      expect(count(codeOnly(read(f)), /creatureAttackFifths\(/g), `${f} reads the creature's own strike`).toBeGreaterThan(0);
    }
    // The two blast constants the S190 fix retired must not come back as a strike.
    for (const f of productionFiles()) {
      expect(codeOnly(read(f)), f).not.toMatch(/attackFifths\(\s*(GOBLIN_SUICIDE_ATK|DRONE_ATK)\b/);
    }
  });
});
