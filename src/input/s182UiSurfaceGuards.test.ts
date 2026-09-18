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
 *     tower underneath it. It is now folded into `isOverChip` via `footerBand.isOverCarryBill`, and
 *     `footerBand.test.ts` pins that. **Three sessions, four occurrences, one shape of defect.**
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

describe('S182 — the three UI surfaces, and the gates that must know about all of them', () => {
  it('the three predicates still exist and are still asked by name', () => {
    // Anti-vacuity for every assertion below: if one is renamed, this fails first and says so.
    for (const p of ['isPointerOverPanel', 'isPointerOverFooterChip', 'isPointerOverCard']) {
      expect(controls, `${p} is the name every gate below greps for`).toContain(`private ${p}(`);
    }
  });

  it('GATE A — the onDown router: panel guarded, footer consumed, card consumed', () => {
    const block = blockFrom('private onDown = (e: PointerEvent): void => {', 3200);
    expect(block).toContain('if (this.isPointerOverPanel()) return;');
    // ⚠ The footer is guarded by CONSUMPTION, not by a boolean, and that is correct: only the chip
    // and strip RECTANGLES swallow a click — the empty stretches of the band stay live board.
    expect(block).toContain('this.handleFooterChipClick()');
    // The card's BUTTONS, in the slot the retired popover held (S181's precedence fix).
    expect(block).toContain('this.handleSheetActionClick()');
  });

  it('⛔ GATE E — the armed blueprint STAMP refuses to fire over the card (S182 fix #2)', () => {
    /*
     * The defect: `handleSheetActionClick` above only consumes the card's BUTTONS, and the card's
     * BODY is not consumed until `handleSheetSelect`, far below this arm. So every non-button pixel
     * of the card was live board for a held tower.
     */
    const block = blockFrom('const armed = this.castlePanel?.armedBlueprint() ?? null;');
    expect(block).toContain('if (this.isPointerOverCard()) return;');
    // …and it must come BEFORE the commit, not after it.
    expect(block.indexOf('if (this.isPointerOverCard()) return;'))
      .toBeLessThan(block.indexOf('this.onBuildBlueprint?.(armed, centre)'));
  });

  it('⛔ GATE B — the potato plant registers ALL THREE surfaces (S182 fix #1)', () => {
    const block = blockFrom("meNow.carriedPotatoId !== undefined", 400);
    expect(block).toContain('!this.isPointerOverPanel()');
    expect(block, 'the footer guard was MISSING here until S182').toContain('!this.isPointerOverFooterChip()');
    expect(block).toContain('!this.isPointerOverCard()');
  });

  it('⛔ the FOOTER predicate every gate shares covers the carry readout too (S182 fix #3)', () => {
    /*
     * The three named surfaces are not the whole story: `isPointerOverFooterChip` delegates to
     * `footerBand.isOverChip`, so anything the BAND draws opaquely must be inside that one
     * predicate or it is invisible to all four gates at once. This asserts the delegation chain
     * end to end, because that is the property the gates actually rely on.
     */
    expect(blockFrom('private isPointerOverFooterChip(): boolean {', 400))
      .toContain('this.footerBand.isOverChip(this.cursor.x, this.cursor.y)');
    const band = readFileSync(new URL('../render/footerBand.ts', import.meta.url), 'utf8');
    const i = band.indexOf('isOverChip(x: number, y: number): boolean {');
    expect(i, 'footerBand.isOverChip must still exist').toBeGreaterThan(-1);
    expect(band.slice(i, i + 400)).toContain('this.isOverCarryBill(x, y)');
  });

  it('GATE C — the PLACE_FROM_FREE commit registers all three surfaces', () => {
    const block = blockFrom('gates.commit &&', 400);
    expect(block).toContain('!this.isPointerOverPanel()');
    expect(block).toContain('!this.isPointerOverFooterChip()');
    expect(block).toContain('!this.isPointerOverCard()');
  });

  it('GATE D — the hover cursor answers for every surface a click can hit', () => {
    const block = blockFrom('private updateHoverCursor(): void {', 1800);
    expect(block).toContain('this.isPointerOverFooterChip()');
    expect(block).toContain('isOverAnyAction(this.cursor.x, this.cursor.y)');
    expect(block).toContain('ownedRowAt(this.cursor.x, this.cursor.y)');
    expect(block).toContain('this.castlePanel.isOverPanel(this.cursor.x, this.cursor.y)');
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
