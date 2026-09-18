/**
 * SPARK — S182: **NOTHING THE PLAYER CAN CLICK MAY SHOW THREE DOTS.**
 *
 * ## The defect
 *
 * `characterSheet.drawPortrait` ended in
 * `word = castleFrame ? 'KEEP' : defenderFrame ? kind : '…'`. The fall-through drew a literal
 * ellipsis — byte-identical to the Voltkin TV placeholder the owner reported in S181 as
 * *"an empty box with three dots"*.
 *
 * ## ⛔ Why this file walks the whole game instead of listing the cases
 *
 * **The S182 brief listed five placeholder cases, and enumerating them against the tree found the
 * list wrong in BOTH directions.** That is the project's signature defect — a rule applied at some
 * of its sites — arriving as a hand-written inventory:
 *
 *   · **Four were not placeholders.** The laser turret, pentagram, goblin tower and lightning hub
 *     were named as ellipsis cases; all four carry a codex `emblem` and always drew it. Only
 *     `voltkin` and `helga` lack one in the entire `CODEX_COPY` table.
 *   · **`freeform` was on nobody's list**, and it is the most reachable of all: every structure a
 *     player hand-bonds with no recipe. `portraitForStructure`'s own docblock asserted it *"keeps the
 *     emblem path that already handled it"* — `codexCopyFor('freeform')` hits the unmapped fallback,
 *     which carries no emblem, so that path never handled it.
 *   · **Three creatures, not one.** `voltkin`, `direwolf` and `locustCloud` have no `ATLASES` entry
 *     and are not `proceduralFrame`. The brief named the Voltkin.
 *   · **`defenderFrame{stinkTower}` printed `STINKT`** — a `slice(0, 6)` truncation artefact — while
 *     its real sheet was already loaded and wired one switch-arm away.
 *
 * ⭐ SO THE ASSERTION IS A SWEEP, NOT A TABLE. Every `CreatureType` in `CREATURE_CONFIGS`, every
 * `GodlyId` in `ALL_BLUEPRINT_IDS`, the `freeform` case, every `DefenderKind`, and the keep — each in
 * BOTH texture states — must resolve to art, a painter, an emblem, or a word that names it. A list
 * cannot rot into a lie here, because there is no list.
 *
 * ⚠ AND THE `never` ARM IN `portraitPlateFor` IS THE OTHER HALF: a new `PortraitSpec` kind fails
 * `tsc` rather than silently drawing dots. Tests catch what exists; the compiler catches what comes.
 */

import { describe, expect, it } from 'vitest';
import { codexCopyFor } from './codexPresentation.ts';
import { ALL_BLUEPRINT_IDS } from '../state/blueprints.ts';
import { CREATURE_CONFIGS } from '../state/creatures/voltkin-config.ts';
import type { CreatureType } from '../state/creatures/creature.ts';
import { ALL_RACES } from '../state/races.ts';
import {
  PLATE_WORD_MAX,
  portraitForCreature,
  portraitForStructure,
  portraitPlateFor,
  type PortraitSpec,
} from './characterSheetModel.ts';

const hasEmblem = (id: string): boolean => codexCopyFor(id).emblem !== undefined;
const emblemlessName = (id: string): string => codexCopyFor(id).name;

const plate = (spec: PortraitSpec, hasTexture: boolean) =>
  portraitPlateFor(spec, hasTexture, hasEmblem, emblemlessName);

/** ⚠ `DefenderKind` is not exported as a value; these are its three union members, pinned below. */
const DEFENDER_KINDS = ['turret', 'princess', 'stinkTower'] as const;

/** Every portrait spec the game can put on a card, with a label for the failure message. */
function everySpec(): Array<{ label: string; spec: PortraitSpec }> {
  const out: Array<{ label: string; spec: PortraitSpec }> = [];
  for (const type of Object.keys(CREATURE_CONFIGS) as CreatureType[]) {
    // race null and a real race: `portraitForCreature` carries it through for `raceUnit`.
    out.push({ label: `creature:${type}`, spec: portraitForCreature(type, null) });
    out.push({ label: `creature:${type}:vampires`, spec: portraitForCreature(type, 'vampires') });
  }
  for (const id of ALL_BLUEPRINT_IDS) {
    out.push({ label: `structure:${id}`, spec: portraitForStructure(id) });
  }
  // ⛔ THE ONE NOBODY LISTED: a hand-bonded structure with no recipe at all.
  out.push({ label: 'structure:freeform', spec: portraitForStructure(null) });
  for (const defenderKind of DEFENDER_KINDS) {
    out.push({ label: `defender:${defenderKind}`, spec: { kind: 'defenderFrame', defenderKind } });
  }
  out.push({ label: 'castle:unaligned', spec: { kind: 'castleFrame', race: null } });
  for (const race of ALL_RACES) {
    out.push({ label: `castle:${race}`, spec: { kind: 'castleFrame', race } });
  }
  return out;
}

describe('S182 — every portrait plate is art, a puppet, an emblem or a NAME', () => {
  it('the sweep is real — it covers every creature, every blueprint and every defender kind', () => {
    // A guard on the guard: a sweep that silently enumerates nothing passes everything.
    const specs = everySpec();
    const creatureCount = Object.keys(CREATURE_CONFIGS).length;
    expect(creatureCount).toBeGreaterThan(10);
    expect(ALL_BLUEPRINT_IDS.length).toBeGreaterThan(10);
    expect(specs.length).toBe(
      creatureCount * 2 + ALL_BLUEPRINT_IDS.length + 1 + DEFENDER_KINDS.length + 1 + ALL_RACES.length,
    );
  });

  it('⛔⛔ NOTHING resolves to an ellipsis, an empty plate, or a truncation artefact', () => {
    for (const { label, spec } of everySpec()) {
      // BOTH texture states: art present, and art missing / still in flight.
      for (const hasTexture of [true, false]) {
        const p = plate(spec, hasTexture);
        expect(p.kind, `${label} (tex=${hasTexture})`).not.toBeUndefined();
        if (p.kind !== 'word') continue;
        expect(p.text, `${label} (tex=${hasTexture}) must not be dots`).not.toContain('…');
        expect(p.text, `${label} (tex=${hasTexture}) must not be dots`).not.toContain('...');
        expect(p.text.length, `${label} (tex=${hasTexture}) must say something`).toBeGreaterThan(0);
        expect(p.text.length, `${label} (tex=${hasTexture}) must fit the 76px plate`).toBeLessThanOrEqual(
          PLATE_WORD_MAX,
        );
      }
    }
  });

  /**
   * ⚠ THE TWO KINDS THAT HAVE NO TEXTURE PATH AT ALL, and this list is not a convenience — it
   * mirrors `main.ts`'s `setPortraitSource`, which returns null for `'emblem'` ("no texture by
   * design") and for `'proceduralFrame'` ("no texture EXISTS for these"). Asserting "art wins" over
   * them would be asserting a state the wiring cannot produce, which is how a test starts describing
   * a program nobody wrote. The first draft of this file did exactly that and went red on the goblin
   * tower — kept as a note because the red was the TEST being wrong, not the code.
   */
  const TEXTURELESS_KINDS = new Set(['emblem', 'proceduralFrame']);

  it('⭐ art wins when it exists — every art-backed spec takes the texture arm', () => {
    let checked = 0;
    for (const { label, spec } of everySpec()) {
      if (TEXTURELESS_KINDS.has(spec.kind)) continue;
      expect(plate(spec, true).kind, `${label} must prefer its art`).toBe('texture');
      checked++;
    }
    expect(checked, 'the art-backed set is not empty').toBeGreaterThan(10);
  });

  it('⭐ …and the two textureless kinds never claim art, whatever they are handed', () => {
    // The mirror of the rule above: `portraitSource` answers null for both, so a 'texture' plate
    // here would be a promise the renderer cannot keep.
    for (const { label, spec } of everySpec()) {
      if (!TEXTURELESS_KINDS.has(spec.kind)) continue;
      expect(plate(spec, true).kind, `${label} has no texture path`).not.toBe('texture');
    }
  });

  /**
   * ⭐ THE REGRESSION CASES, NAMED. The sweep above would catch each of these, but it would not say
   * WHICH — and every one of them is a specific thing the owner or a session got wrong before.
   */
  describe('the cases that were actually broken', () => {
    it('freeform — a hand-bonded structure says FREEFORM, not dots', () => {
      const p = plate(portraitForStructure(null), false);
      expect(p).toEqual({ kind: 'word', text: 'FREEFORM' });
      // ⚠ and the docblock's claim that the emblem path handled it really was false.
      expect(hasEmblem('freeform')).toBe(false);
    });

    it("helga's HUB building says HELGA — the codex has no emblem for it (two hues in one star)", () => {
      expect(hasEmblem('helga')).toBe(false);
      expect(plate(portraitForStructure('helga'), false)).toEqual({ kind: 'word', text: 'HELGA' });
    });

    it('the three atlas-less creatures name themselves rather than drawing dots', () => {
      for (const [type, expected] of [
        ['voltkin', 'VOLTKIN'],
        ['direwolf', 'DIREWOLF'],
        ['locustCloud', 'LOCUSTS'],
      ] as Array<[CreatureType, string]>) {
        const p = plate(portraitForCreature(type, null), false);
        expect(p.kind, type).toBe('word');
        expect((p as { text: string }).text.length, type).toBeGreaterThan(0);
        void expected; // the exact wording is `creatureDisplayName`'s to own, not this test's
      }
    });

    it('⛔ the stink tower defender is named, never sliced to STINKT', () => {
      expect(plate({ kind: 'defenderFrame', defenderKind: 'stinkTower' }, false)).toEqual({
        kind: 'word',
        text: 'STINK',
      });
      expect('stinkTower'.slice(0, 6).toUpperCase()).toBe('STINKT'); // what it used to print
    });

    it('⭐ the four the brief wrongly called placeholders DO have emblems and always did', () => {
      for (const id of ['laserTurret', 'pentagram', 'goblinTower', 'lightningHub']) {
        expect(hasEmblem(id), `${id} carries a codex emblem`).toBe(true);
        expect(plate(portraitForStructure(id), false)).toEqual({ kind: 'emblem', recipeId: id });
      }
    });

    it('⭐ the landed stink bag asks for its OWN sheet, not the tower constellation', () => {
      // Pinned here because the spec is produced by `stinkCloudSheet`, which needs a world; this is
      // the shape that wiring in `main.ts` switches on.
      const bagSpec: PortraitSpec = {
        kind: 'namedBuildingFrame',
        building: 'stinkBag',
        recipeId: 'stinkTower',
      };
      expect(plate(bagSpec, true)).toEqual({ kind: 'texture' });
      // …and falls back to the tower emblem only while the lazy sheet is in flight.
      expect(plate(bagSpec, false)).toEqual({ kind: 'emblem', recipeId: 'stinkTower' });
    });
  });
});
