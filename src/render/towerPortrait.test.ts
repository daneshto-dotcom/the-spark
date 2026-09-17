/**
 * SPARK — S181: **A TOWER WITH FINISHED ART SHOWS THE ART; THE REST KEEP THE EMBLEM.**
 *
 * Owner, S181 playtest, with screenshots of a Vlad tower and a Bat tower drawn as connector
 * diagrams: *"for buildings that have towers that we have generated art for, you need to use the
 * art, right? So Vlad Tower, Bat Tower, Piranha Tower, castles, those have pictures. They have the
 * art … You've already implemented that for all the creatures … but you did not do that for towers."*
 *
 * And, asked which ones have none, he answered without being shown the code:
 *
 * > *"not for pentagram, not for laser tower, not for Helga … Not for the goblin tower. All the new
 * > ones [have it]."*
 *
 * ⭐ HE AND `towerArtForRecipe` AGREE EXACTLY, which is why `portraitForStructure` has no list of
 * its own: it returns the emblem on that function's existing null arm. This file is the proof of the
 * agreement, and the guard that pack-new-art needs no edit in the card.
 */
import { describe, expect, it } from 'vitest';
import { portraitForStructure } from './characterSheetModel.ts';
import { ALL_RACES } from '../state/races.ts';
import { RACE_TOWER_IDS } from '../state/raceTowerIds.ts';
import { T9_TOWER_IDS } from '../state/t9BossIds.ts';
import '../state/godlyRecipes/registerAll.ts';

/** Every recipe the owner named as having NO structure art, spelled as the registry spells it. */
const ART_LESS = ['pentagram', 'goblinTower', 'lightningHub', 'laserTurret'] as const;

describe('S181 — the twelve race towers resolve to their real atlas', () => {
  it('every tier-3 race tower asks for tower art, not an emblem', () => {
    for (const race of ALL_RACES) {
      const spec = portraitForStructure(RACE_TOWER_IDS[race]);
      expect(spec.kind).toBe('towerFrame');
      if (spec.kind !== 'towerFrame') continue;
      expect(spec.atlasBase).toContain(`t3tower-${race}`);
    }
  });

  it('every tier-9 tower does too — the Vlad-class buildings in his screenshots', () => {
    for (const race of ALL_RACES) {
      const spec = portraitForStructure(T9_TOWER_IDS[race]);
      expect(spec.kind).toBe('towerFrame');
      if (spec.kind !== 'towerFrame') continue;
      expect(spec.atlasBase).toContain(`t9tower-${race}`);
    }
  });

  it('⭐ the spec CARRIES the recipe id, so the first frame can still draw the emblem', () => {
    // This is what makes the art an upgrade rather than a risk: the atlas loads lazily, so a card
    // opened before the fetch lands must have something to draw. Without recipeId it would be blank.
    const spec = portraitForStructure(RACE_TOWER_IDS.vampires);
    expect(spec.kind).toBe('towerFrame');
    if (spec.kind === 'towerFrame') expect(spec.recipeId).toBe(RACE_TOWER_IDS.vampires);
  });
});

describe('S181 — ⛔ HIS ART-LESS LIST keeps the codex emblem', () => {
  it.each(ART_LESS)('%s draws the emblem, exactly as he said it should', (id) => {
    const spec = portraitForStructure(id);
    expect(spec.kind).toBe('emblem');
  });

  it('a hand-bonded freeform structure keeps the emblem path it already had', () => {
    const spec = portraitForStructure(null);
    expect(spec.kind).toBe('emblem');
    if (spec.kind === 'emblem') expect(spec.recipeId).toBe('freeform');
  });

  it('an unknown blueprint id does not throw — the lookup is total over strings', () => {
    expect(portraitForStructure('not-a-real-blueprint').kind).toBe('emblem');
  });
});

describe('S181 — the art-less set is NOT a second list in the card', () => {
  it('⛔ no art-less recipe id is hard-coded in characterSheetModel', () => {
    /*
     * The regression this guards: someone "fixes" a future packed atlas by adding an exception here
     * instead of letting `towerArtForRecipe` answer. The whole design of `portraitForStructure` is
     * that packing a pentagram sheet starts showing it with no edit in this module.
     */
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const src = readFileSync('src/render/characterSheetModel.ts', 'utf-8');
    const body = src.slice(src.indexOf('export function portraitForStructure'));
    const fn = body.slice(0, body.indexOf('\n}\n') + 3);
    for (const id of ART_LESS) {
      expect(fn.includes(`'${id}'`)).toBe(false);
    }
  });
});
