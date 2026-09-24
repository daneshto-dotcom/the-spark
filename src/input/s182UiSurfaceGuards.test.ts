/**
 * SPARK — S182: **EVERY PLACEMENT GATE REGISTERS EVERY UI SURFACE.**
 *
 * ## Why this file exists
 *
 * `controls.ts` hit-tests WORLD objects off a raw canvas and has no notion of UI, so each gate that
 * can COMMIT something to the board enumerates the UI surfaces by hand. That hand-written list is
 * this file's whole subject, because a surface registered in SOME of the gates and not the rest is
 * this project's named signature defect:
 *
 *   · **S181** added the character card — a large, always-on-top panel — and registered it in only
 *     two of the three guards that existed. Releasing a spark over the card planted a shape on
 *     ground the player could not see.
 *   · **S182** enumerated them all rather than waiting for the next report, and found **two more**:
 *       1. the **potato plant** never consulted `isPointerOverFooterChip` — while
 *          `footerBand.isOverShapeStrip`'s own docblock listed it as one of the four sites that do.
 *          Carry a potato, press a tier chip: the chip opens its menu AND the potato is planted
 *          under the band.
 *       2. the **armed blueprint stamp** never consulted `isPointerOverCard`. The card's body is
 *          not consumed until `handleSheetSelect`, which sits BELOW the stamp arm — so arming a
 *          tower and clicking the open card stamped a structure beneath it.
 *   · ⛔ AND THEN **S182 SHIPPED A THIRD ONE OF ITS OWN**, caught by an adversarial review of this
 *     same branch before the owner saw it: item 3's COST plate is an opaque rectangle drawn above
 *     the board and above the blueprint ghost, and it was registered in no guard at all — while
 *     item 1 had just made the band's own y legal for a flat recipe. Clicking the readout planted a
 *     tower underneath it.
 *   ⛔⛔ AND THE FIRST FIX FOR **THAT** WAS ALSO WRONG, WHICH IS WHY THIS FILE NOW PINS TWO
 *     DIFFERENT QUESTIONS. Folding the plate into `footerBand.isOverChip` did not reach the gate:
 *     `handleFooterChipClick` gates on `isOverChip` but RETURNS TRUE only when a chip or strip
 *     control was really pressed, so over the plate it fell through to the armed-stamp arm with
 *     the bug intact — and it made the hover cursor advertise a readout as clickable, the exact
 *     lie GATE D below exists to catch. Fixed at the gate, with `isPointerOverFooterSurface`.
 *     **Three sessions, five occurrences, one shape of defect.**
 *   · ⛔ **S188 (audit F1)** — the S187 upgrade DRAFT PANEL (zIndex 900, opaque, over the quarry
 *     and the buildable ground either side of it) was registered in NONE of these gates. One click on
 *     a tile made the pick AND stamped an armed tower / re-tasked a gatherer / raided underneath it.
 *     It is a fourth surface now (`isPointerOverDraftPanel`, `isPointerOverDraftChoice`), and the
 *     REACH is proven by `controls.draftPanel.test.ts`, which drives the real `Controls` — this file
 *     only proves the wires exist.
 *
 * ## ⚠ A TRIPWIRE, NOT A BEHAVIOUR TEST — and deliberately so
 *
 * The pointer path needs a DOM, a canvas and a live match, so nothing in the unit suite executes
 * it: S180's dropped patch proved a dead wire here breaks no test at all. The honest guard is to
 * assert the WIRE EXISTS at each site. If a gate is deliberately restructured, MOVE its assertion —
 * do not delete it, or the next asymmetry ships silently.
 *
 * ⚠ Matched on substrings that contain no newline, so CRLF checkouts read the same as LF ones.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const controls = readFileSync(new URL('./controls.ts', import.meta.url), 'utf8');

/** The text from `anchor` forward, generously sized — these arms carry long docblocks. */
function blockFrom(anchor: string, len = 2600): string {
  const i = controls.indexOf(anchor);
  expect(i, `anchor not found — the gate moved or was renamed: ${anchor}`).toBeGreaterThan(-1);
  return controls.slice(i, i + len);
}

/**
 * ⭐ S190 — the WHOLE of `updateHoverCursor`, bounded by the next member rather than a char window:
 * its docblocks grew past the old 1800 chars, and a `not.toContain` over a window that no longer
 * reaches the end of the function proves nothing about the part it cannot see.
 */
function hoverBlock(): string {
  const start = controls.indexOf('private updateHoverCursor(): void {');
  const end = controls.indexOf('private lastCursorStyle', start);
  expect(start, 'updateHoverCursor moved or was renamed').toBeGreaterThan(-1);
  expect(end, 'lastCursorStyle no longer follows updateHoverCursor').toBeGreaterThan(start);
  return controls.slice(start, end);
}

describe('S182 — the three UI surfaces, and the gates that must know about all of them', () => {
  it('the three predicates still exist and are still asked by name', () => {
    // Anti-vacuity for every assertion below: if one is renamed, this fails first and says so.
    for (const p of ['isPointerOverPanel', 'isPointerOverFooterChip', 'isPointerOverFooterSurface', 'isPointerOverCard', 'isPointerOverDraftPanel', 'isPointerOverDraftChoice']) {
      expect(controls, `${p} is the name every gate below greps for`).toContain(`private ${p}(`);
    }
  });

  it('GATE A — the onDown router: panel guarded, footer consumed, card consumed', () => {
    // ⚠ S188 — widened from 3200: the draft guard's docblock sits in this window now.
    const block = blockFrom('private onDown = (e: PointerEvent): void => {', 4600);
    expect(block).toContain('if (this.isPointerOverPanel()) return;');
    // ⚠ The footer is guarded by CONSUMPTION, not by a boolean, and that is correct: only the chip
    // and strip RECTANGLES swallow a click — the empty stretches of the band stay live board.
    expect(block).toContain('this.handleFooterChipClick()');
    // The card's BUTTONS, in the slot the retired popover held (S181's precedence fix).
    expect(block).toContain('this.handleSheetActionClick()');
  });

  it('⛔⛔ GATE A — the DRAFT PANEL returns before ANYTHING under it can act (S188, audit F1)', () => {
    /*
     * It is drawn above the band, the card and the board (zIndex 900), so its guard must precede
     * every handler that acts: the footer router, the Ra aim, the card's buttons, the castle click,
     * the armed stamp and the world picks. One early return covers LMB and RMB.
     */
    // The WHOLE handler, bounded by the next one, so no anchor can fall off the end of a window.
    const start = controls.indexOf('private onDown = (e: PointerEvent): void => {');
    const end = controls.indexOf('private onMove = (e: PointerEvent): void => {', start);
    expect(start, 'onDown moved or was renamed').toBeGreaterThan(-1);
    expect(end, 'onMove no longer follows onDown').toBeGreaterThan(start);
    const block = controls.slice(start, end);
    const guard = block.indexOf('if (this.isPointerOverDraftPanel()) return;');
    expect(guard, 'the draft guard is in onDown').toBeGreaterThan(-1);
    for (const later of [
      'this.handleFooterChipClick()',
      'this.handleRaAimClick(e.button)',
      'this.handleSheetActionClick()',
      'this.handleCastleClick()',
      'this.onBuildBlueprint?.(armed, centre)',
      'this.pickGatherer()',
      "type: 'RAID_TARGET'",
      'this.handleSheetSelect()',
    ]) {
      const at = block.indexOf(later);
      expect(at, `anchor missing from onDown: ${later}`).toBeGreaterThan(-1);
      expect(guard, `the draft guard must come before ${later}`).toBeLessThan(at);
    }
  });

  it('⛔ GATE E — the armed blueprint STAMP refuses to fire over the card (S182 fix #2)', () => {
    /*
     * The defect: `handleSheetActionClick` above only consumes the card's BUTTONS, and the card's
     * BODY is not consumed until `handleSheetSelect`, far below this arm. So every non-button pixel
     * of the card was live board for a held tower.
     */
    const block = blockFrom('const armed = this.castlePanel?.armedBlueprint() ?? null;', 4200);
    expect(block).toContain('if (this.isPointerOverCard()) return;');
    // …and it must come BEFORE the commit, not after it.
    expect(block.indexOf('if (this.isPointerOverCard()) return;'))
      .toBeLessThan(block.indexOf('this.onBuildBlueprint?.(armed, centre)'));
  });

  it('⛔⛔ GATE E — …AND over anything the band draws opaquely (S182 fix #3, second pass)', () => {
    /*
     * THE GATE THAT ACTUALLY REFUSES THE PLACEMENT, and the one two earlier attempts missed. The
     * band is guarded elsewhere by CONSUMPTION — `handleFooterChipClick` returns above this arm —
     * but it returns TRUE only when a chip or strip CONTROL was pressed. The carry readout's plate
     * is opaque and is not a control, so the click fell through to here and stamped a tower under
     * it. Widening `isOverChip` did not change that; the guard has to be asked HERE.
     */
    const block = blockFrom('const armed = this.castlePanel?.armedBlueprint() ?? null;', 4200);
    expect(block).toContain('if (this.isPointerOverFooterSurface()) return;');
    expect(block.indexOf('if (this.isPointerOverFooterSurface()) return;'))
      .toBeLessThan(block.indexOf('this.onBuildBlueprint?.(armed, centre)'));
  });

  it('⛔ GATE B — the potato plant registers ALL THREE surfaces (S182 fix #1)', () => {
    const block = blockFrom("meNow.carriedPotatoId !== undefined", 700);
    expect(block).toContain('!this.isPointerOverPanel()');
    expect(block, 'the footer guard was MISSING here until S182')
      .toContain('!this.isPointerOverFooterSurface()');
    expect(block).toContain('!this.isPointerOverCard()');
    expect(block, 'the draft guard was MISSING here until S188').toContain('!this.isPointerOverDraftPanel()');
  });

  it('⛔ the COMMIT predicate reaches the carry readout — end to end through the band', () => {
    /*
     * The three named surfaces are not the whole story: anything the BAND draws opaquely must be
     * inside the predicate the commit gates ask, or it is invisible to all of them at once. This
     * asserts the delegation chain end to end, because that is the property the gates rely on.
     */
    expect(blockFrom('private isPointerOverFooterSurface(): boolean {', 400))
      .toContain('this.footerBand.isOverBandSurface(this.cursor.x, this.cursor.y)');
    const band = readFileSync(new URL('../render/footerBand.ts', import.meta.url), 'utf8');
    const i = band.indexOf('isOverBandSurface(x: number, y: number): boolean {');
    expect(i, 'footerBand.isOverBandSurface must exist').toBeGreaterThan(-1);
    expect(band.slice(i, i + 300)).toContain('this.isOverCarryBill(x, y)');
  });

  it('GATE C — the PLACE_FROM_FREE commit registers all three surfaces', () => {
    const block = blockFrom('gates.commit &&', 900);
    expect(block).toContain('!this.isPointerOverPanel()');
    expect(block).toContain('!this.isPointerOverFooterSurface()');
    expect(block).toContain('!this.isPointerOverCard()');
    expect(block, 'the draft guard was MISSING here until S188').toContain('!this.isPointerOverDraftPanel()');
  });

  it('GATE D — the hover cursor answers for every surface a click can hit', () => {
    const block = hoverBlock();
    expect(block).toContain('this.isPointerOverFooterChip()');
    expect(block).toContain('isOverAnyAction(this.cursor.x, this.cursor.y)');
    expect(block).toContain('ownedRowAt(this.cursor.x, this.cursor.y)');
    expect(block).toContain('this.castlePanel.isOverPanel(this.cursor.x, this.cursor.y)');
    // ⭐ S188 — a CHOOSABLE draft tile; the CONTROL question grants the pointer.
    expect(block).toContain('this.isPointerOverDraftChoice()');
  });

  it('⛔ GATE D — the draft SURFACE question may only SUPPRESS a pointer, never grant one (S190, IL-1)', () => {
    /*
     * Under the plate `onDown` swallows every click, so a card button or a footer chip hidden there
     * must not earn a pointer or a highlight. The surface predicate is therefore asked exactly once,
     * as the CONDITION of the choice — and the only thing it lets through is the draft's own CONTROL
     * question. The reach half (a card button under the plate reads plain) is driven through the real
     * `Controls` in `controls.draftPanel.test.ts`.
     */
    const block = hoverBlock();
    // Counted in CODE only — the docblock above the choice names both predicates.
    const code = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code.split('isPointerOverDraftPanel').length - 1, 'asked once, as the condition').toBe(1);
    expect(block).toContain('const underDraft = this.isPointerOverDraftPanel();');
    expect(block, 'under the plate, only a choosable tile is a control')
      .toMatch(/const overUi = underDraft\s*\?\s*this\.isPointerOverDraftChoice\(\)\s*:/);
    expect(code.split('isPointerOverDraftChoice').length - 1, 'and only inside that branch').toBe(1);
    // …and the highlights ask the same question, or a hidden button still lifts under the plate.
    expect(block).toContain('const lift = underDraft ? { x: -1, y: -1 } : this.cursor;');
    expect(block).toContain('this.footerBand?.setHover(lift.x, lift.y);');
    expect(block).toContain('this.characterSheet?.setHover(lift.x, lift.y);');
  });

  it('⛔ S188 — the draft predicates reach the panel, and main.ts wires it', () => {
    expect(blockFrom('private isPointerOverDraftPanel(): boolean {', 400))
      .toContain('this.draftPanel.isOver(this.cursor.x, this.cursor.y)');
    expect(blockFrom('private isPointerOverDraftChoice(): boolean {', 400))
      .toContain('this.draftPanel.isOverChoosable(this.cursor.x, this.cursor.y)');
    const overlay = readFileSync(new URL('../render/draftOverlay.ts', import.meta.url), 'utf8');
    expect(overlay).toContain('isOver(x: number, y: number): boolean {');
    expect(overlay).toContain('isOverChoosable(x: number, y: number): boolean {');
    const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
    expect(main, 'without this line every guard above reads a null panel').toContain('controls.setDraftPanel(draftOverlay);');
  });

  it('⛔ GATE D — …and it must NOT promise a pointer where nothing is clickable', () => {
    /*
     * ⛔ THE CURSOR IS A PROMISE, AND THIS FILE EXISTS TO CATCH IT LYING. The first fix for the
     * carry-readout defect widened `isOverChip` — the predicate the cursor asks — so the pointer
     * began advertising an opaque READOUT as a control. Nothing consumes a click there: it is
     * refused, not activated. That is exactly the failure the ruled-benign note below describes for
     * the character card's body, arrived at from the other direction.
     *
     * So the hover path must ask the CONTROL question and the commit gates the SURFACE one, and a
     * future "simplification" that collapses them back into one predicate fails here.
     */
    const block = hoverBlock();
    expect(
      block,
      'the cursor must ask the CONTROL test — `isPointerOverFooterSurface` includes opaque readouts',
    ).not.toContain('isPointerOverFooterSurface');
    // And the two predicates must stay genuinely different, or the split is decorative.
    const control = blockFrom('private isPointerOverFooterChip(): boolean {', 400);
    const surface = blockFrom('private isPointerOverFooterSurface(): boolean {', 400);
    expect(control).toContain('isOverChip(');
    expect(control).not.toContain('isOverBandSurface(');
    expect(surface).toContain('isOverBandSurface(');
    // …and on the band's side, the control test must not have quietly absorbed the readout again.
    const band = readFileSync(new URL('../render/footerBand.ts', import.meta.url), 'utf8');
    const i = band.indexOf('isOverChip(x: number, y: number): boolean {');
    expect(band.slice(i, i + 300)).not.toContain('isOverCarryBill');
  });

  /**
   * ⭐ THE ONE ASYMMETRY S182 LOOKED AT AND RULED **BENIGN**, named here so it is a verdict rather
   * than an omission.
   *
   * GATE D advertises the card's BUTTONS and its owned-unit row as clickable, but not the card's
   * BODY — even though `handleSheetSelect` consumes a click anywhere on the card. That is the right
   * asymmetry: the body SWALLOWS a click so it cannot fall through to the board, which is not the
   * same claim as "this is a control", and a pointer cursor over inert plate would be the lie. The
   * body is still covered by the two guards that matter (B and C both call `isPointerOverCard`).
   */
  it('the card BODY is swallowed by the select path even though the cursor stays plain', () => {
    const block = blockFrom('private handleSheetSelect(): boolean {', 3000);
    expect(block).toContain('if (this.characterSheet.isOver(this.cursor.x, this.cursor.y)) return true;');
  });
});
