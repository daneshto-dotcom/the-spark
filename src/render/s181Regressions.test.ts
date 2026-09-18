/**
 * SPARK — S181: **THE DEFECTS THE VERIFICATION PASS FOUND IN MY OWN WORK.**
 *
 * The owner asked for the nine fixes to be adversarially verified before he tested them — *"run
 * three agents, each one testing three of them in different ways, making sure it actually has
 * landed. There's nothing to improve upon … no unfinished pathways."*
 *
 * They found six real defects, every one of them mine, and every one of them shipped green. This
 * file is the guard for each, so the verification is not a one-off.
 *
 * ⛔ THE SHAPE OF ALL SIX IS THE SAME, AND IT IS THIS PROJECT'S NAMED FAILURE MODE: a rule applied
 * at some of its sites and not the rest. Three of four wipe sites. Two of three arrival arms. A
 * transform set and then reset. A block that draws but does not advance the cursor after it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { wrapToWidth, fitChars } from './characterSheet.ts';
import { CREATURE_CONFIGS } from '../state/creatures/voltkin-config.ts';

const read = (f: string): string => readFileSync(f, 'utf-8');

describe('S181 R1 — the SUICIDE BOMBER detonates on a connector', () => {
  /**
   * ⛔⛔ A REGRESSION THE TARGETING REWORK CAUSED, and the worst of the six. `structureTargets` gives
   * structure-attackers a CONNECTOR when no lone shape is nearer — and the bomber is a
   * structure-attacker. Its arrival test checked only `targetPrimitiveId` and `targetCreatureId`, so
   * with a bond target it walked onto the building and stood there until its fuse expired.
   *
   * The one unit defined by blowing up buildings had stopped blowing up buildings, and his ruling
   * for it is *"buildings only; with no buildings, people."*
   */
  const host = read('src/state/hostTick.ts');

  it('the arrival test has THREE arms, not two', () => {
    const i = host.indexOf('const atShape =');
    expect(i).toBeGreaterThan(-1);
    // ⚠ A GENEROUS WINDOW. 1400 was too tight the moment the arm carried its own docblock — the
    // same brittle-proximity trap that bit `damageNumbersLifecycle.test.ts` earlier this session.
    const block = host.slice(i, i + 3000);
    expect(block).toContain('atConnector');
    expect(block).toMatch(/if \(atShape \|\| atUnit \|\| atConnector \|\| fuseExpiring\)/);
  });

  it('⚠ it reuses the SAME reach predicate the drone arm uses, not a second distance test', () => {
    // A parallel distance test against a bond midpoint is how the two arms would drift apart.
    const i = host.indexOf('const atConnector =');
    const block = host.slice(i, i + 300);
    expect(block).toContain('isWithinAttackRange(world, droneCandidate, droneCandidate.targetBondId)');
  });
});

describe('S181 R2 — `creatureKillHits` is wiped, and my comment claimed it already was', () => {
  /**
   * ⛔ `worldTypes` said the field is *"wiped by the consumer"*. The consumer only SPLICED records it
   * matched; anything unclaimed stayed forever. And unclaimed records are guaranteed: the push
   * happens before the channelling-Pharaoh branch restores `ehp = 1` and returns WITHOUT a death, so
   * that creature never vanishes and nothing ever claims its record.
   *
   * Its two siblings each have FOUR sites — three phase resets plus the consumer's wipe. I matched
   * three and missed the fourth.
   */
  it('the renderer wipes the array at the end of its sweep', () => {
    const src = read('src/render/damageNumbers.ts');
    expect(src).toContain('world.creatureKillHits.length = 0;');
    // ⛔ AND IT IS ORDERED AFTER THE CLAIMING LOOP, or it would wipe records before they are read.
    const claim = src.indexOf('takeKillHitNear(world');
    const wipe = src.indexOf('world.creatureKillHits.length = 0;');
    expect(claim).toBeGreaterThan(-1);
    expect(wipe).toBeGreaterThan(claim);
  });

  it('⛔ ALL FOUR SITES — the three phase resets AND the consumer, matching its siblings', () => {
    const sites = [
      'src/state/gameMode.ts',
      'src/state/gameState.ts',
      'src/state/save.ts',
      'src/render/damageNumbers.ts',
    ];
    for (const f of sites) {
      expect(read(f).includes('creatureKillHits.length = 0'), `${f} must wipe it`).toBe(true);
    }
    // Anti-vacuity: the sibling has the same four, so the comparison is meaningful.
    for (const f of sites.slice(0, 3)) {
      expect(read(f).includes('connectorBreakHits.length = 0'), `${f} sibling check`).toBe(true);
    }
  });
});

describe('S181 R3 — the build-recipe glyph is not rendered at the canvas origin', () => {
  /**
   * ⛔ TWO DEFECTS IN ONE BLOCK. I drew the emblem into the shared `glyphs` Graphics and then RESET
   * its transform so the feed chips could keep absolute coordinates — but a Graphics renders with
   * its transform as of draw time, so the emblem appeared at (0, 0) at FULL SIZE: a large recipe
   * diagram in the screen's top-left and an empty corner on the card. And `drawEmblem` ends in
   * `g.addChild(wrap)`, which `Graphics.clear()` does not remove, so children piled up every frame.
   */
  const sheet = read('src/render/characterSheet.ts');

  it('it draws into its OWN container, never the shared glyph layer', () => {
    expect(sheet).toContain('drawEmblem(this.buildGlyphG, v.buildEmblem)');
    expect(sheet).not.toContain('drawEmblem(this.glyphs,');
  });

  it('⛔ and the transform is NOT reset after drawing', () => {
    const i = sheet.indexOf('this.buildGlyph.position.set(');
    expect(i).toBeGreaterThan(-1);
    const block = sheet.slice(i, i + 400);
    expect(block).not.toContain('this.buildGlyph.position.set(0, 0)');
    expect(block).not.toContain('this.buildGlyph.scale.set(1)');
  });

  it('⛔ reset DESTROYS the children drawEmblem adds, on both emblem surfaces', () => {
    const i = sheet.indexOf('private reset()');
    const block = sheet.slice(i, i + 900);
    expect(block).toContain('this.buildGlyphG.removeChildren()');
    expect(block).toContain('this.emblem.removeChildren()');
    expect(block).toContain('destroy({ children: true })');
  });
});

describe('S181 R4 — the description does not draw on top of the owned-unit row', () => {
  /**
   * ⛔ The owned block computed `oy = sy + 4` and never advanced `sy`. The description added this
   * session starts at `sy`, so on Helga's hub a sentence printed across the PRINCESS row and her
   * health bar while ~80px sat empty at the bottom of the card.
   */
  it('the owned block advances the layout cursor past itself', () => {
    const sheet = read('src/render/characterSheet.ts');
    const i = sheet.indexOf('this.ownedHit = { x: x + PAD, y: oy');
    expect(i).toBeGreaterThan(-1);
    const block = sheet.slice(i, i + 700);
    expect(block).toContain('sy = oy + oh + 6;');
    // ⛔ and it must come BEFORE the description block reads `sy`.
    const advance = sheet.indexOf('sy = oy + oh + 6;');
    const desc = sheet.indexOf('wrapToWidth(v.description');
    expect(desc).toBeGreaterThan(advance);
  });
});

describe('S181 R8 — the CARD is registered as a UI surface in every guard that enumerates them', () => {
  /**
   * ⛔⛔ THE CARD BECAME THE GAME'S PRIMARY CONTROL SURFACE AND THREE HAND-WRITTEN GUARDS DID NOT KNOW.
   *
   * `controls.ts` enumerates UI surfaces by hand in three places — the two PLACE commit gates and
   * `updateHoverCursor`. S181 added a large always-on-top panel and registered it in ONE of them. So
   * opening a card and releasing a spark drag over it PLACED A SHAPE on ground hidden beneath the
   * card. The castle panel is excluded in those gates with the stated reason *"it would be hidden
   * beneath it"* — which describes the card word for word, and the card is drawn ABOVE the panel.
   *
   * ⚠ Found by the adversarial verification pass, not by a test, and survived a refute round.
   */
  const controls = read('src/input/controls.ts');

  it('the PLACE_FROM_FREE commit gate excludes the card', () => {
    const i = controls.indexOf('gates.commit &&');
    expect(i).toBeGreaterThan(-1);
    expect(controls.slice(i, i + 500)).toContain('!this.isPointerOverCard()');
  });

  it('the PLACE_POTATO gate excludes the card', () => {
    const i = controls.indexOf('meNow.carriedPotatoId !== undefined');
    expect(i).toBeGreaterThan(-1);
    expect(controls.slice(i, i + 500)).toContain('!this.isPointerOverCard()');
  });

  it('⭐ all three surface guards agree — one predicate, three callers', () => {
    // Two commit gates + the hover cursor. If a fourth guard is ever added it should use this too.
    const uses = controls.split('this.isPointerOverCard()').length - 1;
    expect(uses, 'both PLACE gates must call it').toBeGreaterThanOrEqual(2);
    expect(controls).toContain('private isPointerOverCard()');
  });

  it("the owned-unit row gets a pointer cursor — it is clickable, so it must look it", () => {
    const i = controls.indexOf('const overUi =');
    const block = controls.slice(i, i + 900);
    expect(block).toContain('ownedRowAt(this.cursor.x, this.cursor.y)');
  });

  it('and a visual hover, from the SAME predicate the click uses', () => {
    const sheet = read('src/render/characterSheet.ts');
    expect(sheet).toContain('const ownedHot =');
    // ⛔ it must key off `this.hover`, not a second parallel hit test.
    const i = sheet.indexOf('const ownedHot =');
    expect(sheet.slice(i - 200, i + 260)).toContain('this.hover');
  });
});

describe('S181 R5 — wrapToWidth: no empty lines, no silent overflow', () => {
  it('⛔ a first word longer than the line does NOT push an empty line', () => {
    // Found by RUNNING it, not reading it: `cur` was still '' when the push happened.
    const out = wrapToWidth('Supercalifragilisticexpialidociousandthensome tail', 20, 3);
    expect(out.every((l) => l.length > 0), `got ${JSON.stringify(out)}`).toBe(true);
  });

  it('an over-long word is hard-broken rather than emitted past the card edge', () => {
    for (const l of wrapToWidth('short Supercalifragilisticexpialidocious', 20, 3)) {
      expect(l.length).toBeLessThanOrEqual(20);
    }
  });

  it('every line respects the width, for a realistic 150-char codex blurb', () => {
    const blurb = 'A ring of six triangles fed with squares that emits a bat every fifteen '
      + 'seconds and collapses into rubble when its final connector is severed.';
    expect(blurb.length).toBeGreaterThan(130);
    const out = wrapToWidth(blurb, 35, 5);
    for (const l of out) expect(l.length).toBeLessThanOrEqual(35);
    expect(out.length).toBeLessThanOrEqual(5);
    expect(out.length).toBeGreaterThan(1);
  });

  it('truncation is VISIBLE — an ellipsis, never a silent drop', () => {
    const long = Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ');
    const out = wrapToWidth(long, 10, 2);
    expect(out).toHaveLength(2);
    expect(out[1]?.endsWith('…')).toBe(true);
  });

  it('short text is returned untouched, with no ellipsis', () => {
    expect(wrapToWidth('Spawns a bat every 15s.', 35, 5)).toEqual(['Spawns a bat every 15s.']);
  });

  it('empty input yields no lines rather than one blank one', () => {
    expect(wrapToWidth('', 35, 5)).toEqual([]);
    expect(wrapToWidth('   ', 35, 5)).toEqual([]);
  });
});

describe('S181 R6 — the build bill is clipped to the space that exists', () => {
  /**
   * ⛔ Drawn right of the portrait with no wrap, no truncate and no mask, Helga's
   * `1 TRIANGLE + 3 CIRCLES + 3 SPIRALS` ran ~66px past the card's right edge.
   */
  it('fitChars clips with a visible ellipsis and leaves short text alone', () => {
    expect(fitChars('3 TRIANGLES', 18)).toBe('3 TRIANGLES');
    const long = fitChars('1 TRIANGLE + 3 CIRCLES + 3 SPIRALS', 18);
    expect(long.length).toBeLessThanOrEqual(18);
    expect(long.endsWith('…')).toBe(true);
  });

  it('the card actually calls it on the bill', () => {
    expect(read('src/render/characterSheet.ts')).toContain('fitChars(v.buildBill, BILL_CHARS)');
  });
});

describe('S181 R7 — the renderer and the model agree on the description height', () => {
  /**
   * ⛔ THE PAIR MUST AGREE OR THE CARD CLIPS ITS OWN TEXT, and the first cut disagreed twice over:
   * the renderer allowed 2 lines while the model reserved 30px, against a 150-char blurb on a card
   * that fits ~35 characters a line. Asserted rather than left to a comment.
   */
  it('DESC_MAX_LINES lines at 12px leading fit inside the reserved DESC_ROW_H', () => {
    const sheet = read('src/render/characterSheet.ts');
    const model = read('src/render/characterSheetModel.ts');
    const maxLines = Number(/const DESC_MAX_LINES = (\d+);/.exec(sheet)?.[1] ?? '0');
    const reserved = /const DESC_ROW_H = (\d+) \* (\d+) \+ (\d+);/.exec(model);
    expect(maxLines).toBeGreaterThan(2);
    expect(reserved, 'DESC_ROW_H must be expressed as lines x leading + gap').not.toBeNull();
    const lines = Number(reserved?.[1] ?? '0');
    expect(lines, 'the model must reserve exactly DESC_MAX_LINES lines').toBe(maxLines);
  });

  it('the line width is derived from the CARD width, not the castle panel width', () => {
    const sheet = read('src/render/characterSheet.ts');
    // The original derived 40 chars from PANEL_W (268) on a SHEET_W (236) card.
    expect(sheet).toContain('const DESC_CHARS_PER_LINE = Math.floor((SHEET_W - PAD * 2)');
    expect(sheet).not.toContain('const DESC_CHARS_PER_LINE = 40;');
  });
});

describe('S182 R9 — the SEVENTH defect of the same rework: the zombie boss fired Voltkin lightning', () => {
  /**
   * ⛔⛔ THE OWNER FOUND THIS ONE HIMSELF, and it is the same shape as the six above — *a rule
   * applied at some of its sites and not the rest*. Its R1 is the suicide bomber breaking for the
   * identical reason: `structureTargets` handed a structure-attacker a BOND and a downstream arm
   * was not ready for it.
   *
   * *"Why does my fucking zombie boss have Voltkin music and electric beams going through towers and
   * connectors? How does that make sense?"*
   *
   * ⭐ AND THE FIX ALREADY EXISTED, ONE ARM AWAY. `creatureAttack.ts` has TWO ARC_FLASH emits: the
   * creature-vs-creature arm and the bond-strike arm. S154 P2 fixed the first for this exact bug
   * from this exact cause, and left the second. This guard is written over BOTH so a third arm
   * cannot be added as a negation either.
   *
   * ⚠ A SOURCE-TEXT TRIPWIRE, NOT A BEHAVIOUR TEST, AND DELIBERATELY SO. The failure mode here is
   * UNREACHED CODE — a predicate that is still true for the wrong set. A behaviour test passes the
   * day someone re-broadens the gate to a new negation that happens to exclude the fixtures. The
   * behaviour half lives in `creatureAttack.test.ts`; it takes both.
   */
  const attack = read('src/state/creatures/creatureAttack.ts');

  it('⛔ EVERY ARC_FLASH emit in the file is gated on the TYPE, never on a negation', () => {
    // Walk back from each emit to the nearest `if (` above it and demand it names voltkin.
    const emits: number[] = [];
    for (let i = attack.indexOf("kind: 'ARC_FLASH'"); i !== -1; i = attack.indexOf("kind: 'ARC_FLASH'", i + 1)) {
      emits.push(i);
    }
    expect(emits.length, 'the file has two ARC_FLASH emits; both are guarded').toBe(2);
    for (const at of emits) {
      const guard = attack.lastIndexOf('if (', at);
      const clause = attack.slice(guard, at);
      expect(clause, 'the arc is Voltkin\'s signature — name it').toContain("creature.type === 'voltkin'");
    }
  });

  it('⛔ the stale `!isChewer` gate is GONE — that negation is the whole bug', () => {
    // `isChewer` itself survives: it still picks the SEVER_BOND cause, which is a real chewer/not
    // distinction. What must never come back is it standing in for "is the Voltkin".
    expect(attack).not.toContain('if (!isChewer) {');
  });

  /**
   * ⛔ TWO MORE PRODUCERS OF THE SAME STALE CLAUSE, found by enumerating it across src/ rather
   * than by re-reading the file the bolt came from. Neither is in `creatureAttack.ts`.
   */
  it('⛔ the SUICIDE BLAST severs as a BOMB, not as Voltkin lightning', () => {
    const blast = read('src/state/creatures/suicideBlast.ts');
    // `cause: 'creature'` routes audioManager to lightning-crackle.ogg + a 700 ms music duck, so
    // the goblin's EXPLOSION played the Voltkin's zap. 'bomb' is already in the union -> no bump.
    /*
     * ⚠ SCOPED TO THE DISPATCH LINES, not the whole file. The first draft asserted the file did not
     * contain `cause: 'creature'` at all and went red on the DOCBLOCK explaining the fix — a
     * source-text guard that reads its own prose as code. Match the statement, not the essay.
     */
    const dispatches = blast.match(/dispatch\(world, \{ type: 'SEVER_BOND'[^}]*\}/g) ?? [];
    expect(dispatches.length, 'the blast has exactly one sever dispatch').toBe(1);
    expect(dispatches[0]).toContain("cause: 'bomb'");
    expect(dispatches[0], 'an explosion is not a lightning strike').not.toContain("cause: 'creature'");
  });

  it('⛔ CREATURE_CHARGE is keyed on the electric units, not on `!chewsConnectors`', () => {
    const life = read('src/state/creatures/creatureLifecycle.ts');
    const i = life.indexOf("kind: 'CREATURE_CHARGE'");
    expect(i).toBeGreaterThan(-1);
    const guard = life.lastIndexOf('if (', i);
    const clause = life.slice(guard, i);
    expect(clause).toContain("creature.type === 'voltkin'");
    expect(clause, 'the drone is the other lightning unit').toContain("creature.type === 'lightningDrone'");
    expect(clause, 'the stale negation is what made it latent').not.toContain('!config.chewsConnectors');
  });

  it("⛔ hostTick's seek arm is keyed on the TYPE — not on `sourceSpawnerId`", () => {
    /*
     * ⛔ S182 — THE SAME STALE NEGATION, AND I DISMISSED IT AS "a different predicate" WITHOUT
     * CHECKING THE SET. The owner made me check, and it is the same shape: `sourceSpawnerId !== null`
     * is a PROVENANCE PROXY standing in for IDENTITY, right only while the set reaching that arm
     * happens to be two creatures that differ in provenance. One config edit — a castle-emitted
     * chewer, a spawner-minted Voltkin — and it silently means the opposite while the comments
     * beside it still say "Voltkin".
     */
    const host = read('src/state/hostTick.ts');
    const i = host.indexOf('const isChewer =');
    expect(i).toBeGreaterThan(-1);
    expect(host.slice(i, i + 80)).toContain("creature.type === 'chewer'");
    expect(host.slice(i, i + 80), 'provenance is not identity').not.toContain('sourceSpawnerId !== null');
  });

  it('⭐ …and it is byte-identical because ONLY voltkin+chewer reach that arm — re-derived', () => {
    /*
     * The measurement that makes the change above safe, re-derived from `CREATURE_CONFIGS` rather
     * than asserted from memory. hostTick's chain is: selfExplode && !targetsStructures -> the
     * drone; targetsStructures -> every unit, boss, direwolf and locust; ELSE -> this arm. If a
     * future config lands a third type in the else-arm, THIS test goes red and the predicate gets
     * re-examined on purpose.
     */
    const elseArm = Object.entries(CREATURE_CONFIGS)
      .filter(([, c]) => !(c.selfExplode && !c.targetsStructures) && !c.targetsStructures)
      .map(([t]) => t)
      .sort();
    expect(elseArm).toEqual(['chewer', 'voltkin']);
  });

  it('⚠ the CREATURE_CHARGE fix is byte-identical today — the measurement behind the pair', () => {
    /*
     * The guard above is only safe to narrow because those two configs are the ONLY ones with
     * `chewsConnectors: false` AND a nonzero `attackChargeEngageTick`. Every other unit carries 0,
     * and `ticksInState` is post-increment (>= 1), so the equality could never hold for them. If a
     * future retune gives a third config a nonzero tick, THIS test goes red and the pair gets
     * re-examined on purpose — which is the whole point of pinning a measurement.
     */
    const cfg = read('src/state/creatures/voltkin-config.ts');
    const reachable: string[] = [];
    // ⚠ `[\r\n]+` rather than `\n`: this repo checks out CRLF on Windows and LF on the CI runner,
    // and a `\n`-only anchor silently matches nothing on one of them. `ci.e2eLanes.test.ts` is
    // currently red on exactly that mistake.
    const re = /(\w+_CONFIG)[^=]*=\s*\{([\s\S]*?)[\r\n]+\};/g;
    for (let m = re.exec(cfg); m !== null; m = re.exec(cfg)) {
      const body = m[2] ?? '';
      const chews = /chewsConnectors:\s*(true|false)/.exec(body);
      const eng = /attackChargeEngageTick:\s*(-?\d+)/.exec(body);
      if (chews?.[1] === 'false' && eng !== null && eng[1] !== '0') reachable.push(m[1] ?? '');
    }
    expect(reachable.sort()).toEqual(['LIGHTNING_DRONE_CONFIG', 'VOLTKIN_CONFIG']);
  });

  it('⚠ and the comment no longer explains the gate as a chewer EXEMPTION', () => {
    // The old comment was as wrong as the code — it told the next reader the gate meant "everyone
    // but the chewer", which is exactly what made the defect invisible for 21 unit types.
    // ⚠ ANCHORED ON THE BOND ARM'S OWN COMMENT, not on `creature.killCount += 1;` — that string
    // appears in the creature-vs-creature arm FIRST, so `indexOf` on it reads the wrong block
    // entirely. Precisely the brittle-proximity trap R1 above records.
    const i = attack.indexOf('S36 P3 — increment kill counter');
    expect(i).toBeGreaterThan(-1);
    const block = attack.slice(i, i + 2600);
    expect(block).toContain('S182');
    expect(block).toContain("creature.type === 'voltkin'");
  });
});
