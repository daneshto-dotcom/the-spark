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
  /**
   * ⭐⭐ S181 — **RE-PINNED, BECAUSE THE POPOVER IT SAT BESIDE IS GONE.** This asserted the line inside
   * `handleStructureSelect`, the own-shapes handler that aimed the FIX/SCRAP popover AND opened the
   * card on the same click. The owner's S181 report retired that whole surface:
   *
   * > *"there's a double now … the buttons behind is the one that's wired. You need to rewire it and
   * > remove the old ones."*
   *
   * Your own building now opens the same way an enemy's always did — through `handleSheetSelect`,
   * which is seat-agnostic and reaches a tower through its whole ART BOX rather than a member
   * shape's small radius. That arm is asserted two cases below ('opens on any structure'), so the
   * capability is still covered; what is gone is the second, popover-shaped path to it.
   */
  it('opens on your OWN building through the one seat-agnostic structure arm', () => {
    expect(controls).toContain("this.characterSheet.select({ kind: 'structure', primitiveId: towerHit })");
    // ⛔ and the retired popover's own aim must NOT come back alongside it.
    expect(controls).not.toContain('if (this.handleStructureSelect()) return;');
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
   * ⭐⭐ S181 — **THE ORDERING CONTRACT IS NOW TWO CLAIMS, NOT ONE, AND BOTH MATTER.**
   *
   * The shipped case asserted the card's SELECT arm sat below the popover's. That popover is gone,
   * so the claim is re-stated as the two orderings that actually protect the player:
   *
   *  1. OPENING a card is still LAST of all — below every spark grab, hazard pop and build click, so
   *     it can never swallow a shipped gesture. That was the original risk mitigation and it stands.
   *  2. CLICKING A BUTTON ON the card is FIRST, in the slot the popover's buttons used to hold —
   *     above every world hit-test, because this handler tests world objects with no notion of UI
   *     and pressing SCRAP must not ALSO grab a spark or sever a bond underneath it.
   *
   * ⛔ (2) IS THE OWNER'S S181 BUG, MADE MECHANICAL. His report — *"I'm trying to click on the soul
   * … but it's not wired, only the buttons behind"* — was exactly this ordering being wrong: the
   * card's buttons were routed inside the LAST arm, so the popover at the top won every click and
   * the visible buttons were decoration. If a later session moves the action route back down, this
   * goes red instead of the feature going quietly dead.
   */
  it('OPENING a card is ordered last, below every shipped world gesture', () => {
    const sheet = controls.indexOf('if (this.handleSheetSelect()) return;');
    const sparkGrab = controls.indexOf('pickSpark');
    expect(sheet).toBeGreaterThan(-1);
    expect(sparkGrab).toBeGreaterThan(-1);
    expect(sheet).toBeGreaterThan(sparkGrab);
  });

  it("⛔ CLICKING a card BUTTON is ordered FIRST — the owner's 'only the buttons behind' bug", () => {
    const action = controls.indexOf('if (e.button === 0 && this.handleSheetActionClick()) return;');
    const sheet = controls.indexOf('if (this.handleSheetSelect()) return;');
    expect(action).toBeGreaterThan(-1);
    expect(action).toBeLessThan(sheet);
  });

  /**
   * ⭐⭐ S181 — **THE MERGED CASTLE WINDOW OPENS AND CLOSES AS ONE THING.**
   *
   * Found by testing the LIVE deploy by hand, not by a test: clicking the keep a second time
   * collapsed the docked panel and left the card header floating above nothing. Half the window
   * gone, half still there — a third confusing state, when the whole point of the merge was
   * *"I don't need two windows. It's confusing this way. So we just need one that covers both."*
   *
   * ⚠ THE PANEL IS THE SOURCE OF TRUTH for the toggle direction, read AFTER `toggle()`. Deriving it
   * from a local boolean here would be a second opinion about one piece of state, which is how the
   * card and the panel would drift into disagreeing about whether the window is open.
   */
  it('⭐ the keep toggle closes the CARD with the panel, never half the window', () => {
    const open = controls.indexOf('this.castlePanel.toggle(this.playerId as unknown as number)');
    expect(open).toBeGreaterThan(-1);
    // Both arms must exist: it aims the card when the panel opened, and clears it when it closed.
    const after = controls.slice(open, open + 1800);
    expect(after).toContain("this.characterSheet?.select({ kind: 'castle', seat: this.playerId })");
    expect(after).toContain('this.characterSheet?.select(null)');
    expect(after).toContain('if (this.castlePanel.isOpen())');
  });

  it("⚠ dismissing the panel from empty ground closes ONLY a castle card, not a goblin's", () => {
    // A click that dismisses the castle panel must not close a card the player opened on a unit —
    // different object, different gesture. Pinned because the cheap version of the fix above would
    // have cleared every selection.
    expect(controls).toMatch(/castlePanel\.close\(\);[\s\S]{0,400}?kind === 'castle'/);
  });

  it('⛔ the retired popover is not constructed, synced or routed anywhere', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const main = readFileSync('src/main.ts', 'utf-8');
    expect(main).not.toContain('new StructurePanel(');
    expect(main).not.toContain('structurePanel.sync(');
    expect(controls).not.toContain('this.structurePanel');
    // ⚠ but the PURE planner it exported must still be the card's source of truth.
    const model = readFileSync('src/render/characterSheetModel.ts', 'utf-8');
    expect(model).toContain("structureActionModel");
  });
});

/**
 * ⛔⛔ S182 (owner) — **A CARD IS READ-ONLY, SO A BUSY AVATAR MUST STILL BE ABLE TO OPEN ONE.**
 *
 * > *"Sometimes player two can't click and see the stat sheets, either of his own characters or of
 * > the enemies. That's an unfinished pathway or a bug."*
 *
 * S180 nested the card's only open gesture inside the LMB Idle gate —
 * `player?.kind === 'Idle' && player.carriedPotatoId === undefined`. Every OTHER pick in that block
 * mutates the world (`SET_GATHERER_PREFERENCE`, `TRIGGER_BOMB`, `TRIGGER_RAINBOW`, `PICKUP_POTATO`,
 * `PICKUP_SPARK`), which is what the gate is for: a busy avatar must not start a second gesture.
 * **Opening a card starts no gesture** — `handleSheetSelect` dispatches nothing and captures no
 * pointer — so the gate cost the player the ability to READ anything while carrying a spark, which
 * in this game is most of the time they are doing something.
 *
 * ⚠ THE ASSERTION IS BRACE-MATCHED, NOT A SUBSTRING. A plain `indexOf` comparison would pass the
 * moment the call merely moved further down inside the same block, which is the bug wearing a hat.
 *
 * ⚠ AND IT IS A TRIPWIRE, NOT A BEHAVIOUR TEST, for this file's stated reason: `Controls` binds
 * canvas + window listeners in its constructor, so vitest cannot instantiate it (`controls.test.ts`
 * header). Nothing in the suite can drive a real pointer down this path — which is precisely how
 * S180 shipped the nesting green.
 */
describe('S182 — the card opens regardless of what the avatar is holding', () => {
  /** Index just past the `}` that closes the block opened at `openIdx`. */
  const endOfBlock = (src: string, openIdx: number): number => {
    let depth = 0;
    for (let i = src.indexOf('{', openIdx); i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) return i + 1;
    }
    throw new Error('unbalanced braces');
  };

  const GATE = "if (player?.kind === 'Idle' && player.carriedPotatoId === undefined) {";
  const SHEET = 'if (this.handleSheetSelect()) return;';

  it('⛔ handleSheetSelect is OUTSIDE the Idle / carried-potato gate', () => {
    const gateIdx = controls.indexOf(GATE);
    expect(gateIdx, 'the Idle gate still exists and is worth guarding against').toBeGreaterThan(0);
    const sheetIdx = controls.indexOf(SHEET);
    expect(sheetIdx, 'the card still has exactly one open gesture').toBeGreaterThan(0);
    expect(controls.indexOf(SHEET, sheetIdx + 1), 'and only one').toBe(-1);
    // THE ASSERTION: the gate's block has already closed by the time the card is offered.
    expect(sheetIdx).toBeGreaterThan(endOfBlock(controls, gateIdx));
  });

  it('⭐ …and still LAST, so it can never steal a spark, a bomb or a potato click', () => {
    const sheetIdx = controls.indexOf(SHEET);
    for (const earlier of [
      "type: 'SET_GATHERER_PREFERENCE'",
      "type: 'TRIGGER_BOMB'",
      "type: 'TRIGGER_RAINBOW'",
      "type: 'PICKUP_POTATO'",
      "type: 'PICKUP_SPARK'",
    ]) {
      expect(controls.indexOf(earlier), `${earlier} must be offered before the card`).toBeLessThan(
        sheetIdx,
      );
    }
    // Still inside the LMB arm — it must not have escaped into the RMB branch.
    expect(sheetIdx).toBeLessThan(controls.indexOf('} else if (e.button === 2) {'));
  });

  it('⭐ the exemption is SOUND: handleSheetSelect mutates nothing and captures no pointer', () => {
    // This is the whole justification for lifting it out of a gate that guards against a SECOND
    // gesture. If the card ever starts dispatching, the exemption stops being safe and this fails.
    const start = controls.indexOf('private handleSheetSelect()');
    const body = controls.slice(start, endOfBlock(controls, start));
    expect(body).not.toContain('this.dispatchFn(');
    expect(body).not.toContain('acquirePointerCapture');
    expect(body).not.toContain('this.state =');
  });
});
