/**
 * SPARK — S180: **THE CARD IS ACTUALLY WIRED.** A source-text guard, and it exists because of a
 * specific failure.
 *
 * ⛔ WHAT HAPPENED. The line that hooks the sheet into a click on your OWN building was written and
 * **silently did not apply** (a line-ending mismatch in the patch). `tsc` passed. All 4,588 unit
 * tests passed. The build passed. The deploy passed. Every gate in the project was green, and the
 * feature was dead on arrival — the owner found it in the first minute of play:
 *
 * > *"Clicking on the buildings never opens a card … buildings card has no stats … there's no castle
 * > sheet … tower stats appear nowhere. So what have you done? You said you worked this priority and
 * > you implemented it."*
 *
 * ⭐ THE LESSON THIS FILE ENCODES: **green gates are not proof a feature is wired.** Nothing covers
 * the pointer path — it needs a DOM, a canvas and a live match — so a dropped patch there breaks no
 * test at all. The cheapest honest guard is to assert the WIRE ITSELF exists, which is exactly the
 * grep I should have run by hand and did not.
 *
 * ⚠ THIS IS A TRIPWIRE, NOT A BEHAVIOUR TEST. It cannot tell you the card looks right; it tells you
 * the click can reach it. If one of these call sites is deliberately moved, move the assertion with
 * it — do not delete it, or the next dropped patch ships silently too.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const controls = readFileSync(new URL('../input/controls.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');

describe('the character sheet is reachable from a real click', () => {
  it('is constructed and synced every frame from main', () => {
    expect(main).toContain('new CharacterSheet(app)');
    expect(main).toContain('characterSheet.sync(world, world.localPlayerId)');
    expect(main).toContain('controls.setCharacterSheet(characterSheet)');
  });

  it('is cleared on the return to the title screen, so no card floats over it', () => {
    expect(main).toContain('characterSheet.clear()');
  });

  it('gets its portrait from the sprite sheet already in memory', () => {
    expect(main).toContain('characterSheet.setPortraitSource');
    expect(main).toContain('goblinRenderer.portraitTexture');
  });

  /** ⛔ THE ONE THAT WAS MISSING. A click on your own building must open the card AND the popover. */
  it('opens on a click on your OWN building, alongside the FIX/SCRAP popover', () => {
    expect(controls).toContain("this.characterSheet?.select({ kind: 'structure', primitiveId: hit })");
  });

  it('opens on your own keep, and on an enemy keep', () => {
    expect(controls).toContain("this.characterSheet?.select({ kind: 'castle', seat: this.playerId })");
    expect(controls).toContain("this.characterSheet.select({ kind: 'castle', seat: id })");
  });

  it('opens on any creature, whoever owns it — an enemy card is the feature', () => {
    expect(controls).toContain("this.characterSheet.select({ kind: 'creature', id: bestCreature })");
  });

  it('opens on any structure, including an enemy one', () => {
    expect(controls).toContain("this.characterSheet.select({ kind: 'structure', primitiveId: bestPrim })");
  });

  /**
   * ⚠ ORDERING IS THE WHOLE RISK MITIGATION for touching this file: the card's arm must sit BELOW
   * the FIX/SCRAP popover's, so opening a card can never swallow a shipped gesture.
   */
  it('is ordered LAST, below the popover it must never steal a click from', () => {
    const popover = controls.indexOf('if (this.handleStructureSelect()) return;');
    const sheet = controls.indexOf('if (this.handleSheetSelect()) return;');
    expect(popover).toBeGreaterThan(-1);
    expect(sheet).toBeGreaterThan(popover);
  });
});
