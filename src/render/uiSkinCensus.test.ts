/**
 * S194 — THE CLICKABLE CENSUS. Owner, after playing it: *"most of the buttons you've accounted for,
 * except for a few, like … in the bot mode, the plus and minus button … make sure that's implemented
 * across the board in Spark."*
 *
 * So coverage is MECHANICAL, not remembered. Every line in `src/render/**` and `src/main.ts` that makes
 * something clickable — `eventMode = 'static'|'dynamic'`, a `.on('pointer…')` listener, an
 * `attachButtonFeedback(` call, a DOM `createElement('button')`, a pointer cursor — must be CLAIMED
 * below as SKINNED (it wears `uiSkin` / `uiSkinButton`) or EXEMPT (with the reason written down).
 * ⛔ A NEW clickable that is neither turns this test RED. Register it here only after it is skinned,
 * or after the exemption is genuinely true.
 *
 * Plus the two Controls-driven surfaces that have no Pixi listener at all (the footer band and the
 * character card are hit-tested by `controls.ts`): pinned in their own list below.
 *
 * Excluded by owner rule (R194-24 — the games themselves): `src/arcade/**` (Pitch Masters), the NONET
 * board (`sudokuOverlay.ts`, `nonet*.ts`), and the arcade run/score screens — listed as EXEMPT so the
 * exclusion is visible rather than silent.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

type Status = 'SKINNED' | 'EXEMPT';
interface Claim { readonly file: string; readonly match: string; readonly status: Status; readonly what: string }

const S = 'SKINNED' as const;
const E = 'EXEMPT' as const;

/** The census. `match` is a substring of the claimed code line(s) in `file`. */
const CENSUS: readonly Claim[] = [
  // ── main.ts ───────────────────────────────────────────────────────────────────────────────────
  { file: 'src/main.ts', match: 'settingsIcon.', status: E, what: 'the 16-px HUD settings gear: hover lights it (S194 F2); a plate would collide with the HUD column (hudLayout), and a scale would grow its hit past the modal-cover rect' },
  // ── title / home ──────────────────────────────────────────────────────────────────────────────
  { file: 'src/render/titleScreen.ts', match: 'attachButtonFeedback(', status: S, what: 'the five home buttons — glass, icon badge, sheen' },
  // ── arcade MENU (R194-24) ─────────────────────────────────────────────────────────────────────
  { file: 'src/render/arcadeOverlay.ts', match: 'attachButtonFeedback(', status: S, what: 'NONET / PITCH MASTERS / BACK plates — glass, badge, sheen' },
  { file: 'src/render/arcadeOverlay.ts', match: 'this.container.', status: E, what: 'the full-screen menu scrim and its tap fallback (routes to the same plates)' },
  { file: 'src/render/arcadeRunOverlay.ts', match: 'this.container.eventMode', status: E, what: 'an arcade RUN screen — inside the games, off-limits (R194-24)' },
  { file: 'src/render/sudokuOverlay.ts', match: 'eventMode', status: E, what: 'the NONET board — the game itself, off-limits' },
  { file: 'src/render/sudokuOverlay.ts', match: "this.container.on('pointertap'", status: E, what: 'the NONET board — the game itself, off-limits' },
  // ── VS BOTS setup ─────────────────────────────────────────────────────────────────────────────
  { file: 'src/render/botSetupOverlay.ts', match: 'backdrop.eventMode', status: E, what: 'the modal scrim (swallows clicks; not a control)' },
  // ⭐ S194 (teams) — was `'btn.'`, broad enough to swallow the TEAM chip unskinned (re-audit). Narrowed.
  { file: 'src/render/botSetupOverlay.ts', match: 'raceBtn.', status: S, what: 'the race chip per seat — glass + chip hover' },
  { file: 'src/render/botSetupOverlay.ts', match: 'teamBtn.', status: S, what: 'the TEAM chip per seat (S192/S194) — glass in the team colour + chip hover; a team ring on the seat swatch' },
  { file: 'src/render/botSetupOverlay.ts', match: 'personaBtn.', status: S, what: 'personality chip — glass + chip hover (inert while NOOB)' },
  { file: 'src/render/botSetupOverlay.ts', match: 'diffBtn.', status: S, what: 'difficulty chip — glass + chip hover' },
  { file: 'src/render/botSetupOverlay.ts', match: 'cornerBtn.', status: S, what: 'S195 N16 — the board-corner button on the race swatch of each row (moves the seat one corner on) — chip hover' },
  { file: 'src/render/botSetupOverlay.ts', match: 'attachButtonFeedback(c, bg, onClick, { hit: { x: -24', status: S, what: 'the − / + bot-count steppers and the ✕ close (owner S194) — grammar + glass + sheen' },
  { file: 'src/render/botSetupOverlay.ts', match: 'attachButtonFeedback(c, bg, onClick, { hit: { x: -180', status: S, what: 'START MATCH — glass + sheen' },
  // ── infrastructure ────────────────────────────────────────────────────────────────────────────
  { file: 'src/render/buttonFeedback.ts', match: 'c.', status: E, what: 'the shared button grammar itself (T8 owns it)' },
  { file: 'src/render/buttonFeedback.ts', match: 'export function attachButtonFeedback(', status: E, what: 'the shared button grammar itself (T8 owns it)' },
  { file: 'src/render/uiSkinButton.ts', match: 'c.on(', status: E, what: 'the skin\'s own hover/sheen wiring' },
  // ── castle panel ──────────────────────────────────────────────────────────────────────────────
  { file: 'src/render/castlePanel.ts', match: 'box.', status: S, what: 'control rows, inventory slots, build tiles — glass (+ row icons)' },
  // ── codex ─────────────────────────────────────────────────────────────────────────────────────
  { file: 'src/render/codexOverlay.ts', match: 'bg.eventMode', status: E, what: 'the modal scrim' },
  { file: 'src/render/codexOverlay.ts', match: 'attachButtonFeedback(', status: S, what: 'tabs + CLOSE — glass + sheen' },
  { file: 'src/render/codexOverlay.ts', match: 'tile.', status: S, what: 'combo tiles — glass + chip hover' },
  // ── connection lost ───────────────────────────────────────────────────────────────────────────
  { file: 'src/render/connectionLostOverlay.ts', match: 'overlayBg.eventMode', status: E, what: 'the modal scrim' },
  { file: 'src/render/connectionLostOverlay.ts', match: 'returnBtn.', status: S, what: 'Return to Title — glass + chip hover' },
  // ── dev only ──────────────────────────────────────────────────────────────────────────────────
  { file: 'src/render/debugOverlay.ts', match: "root.style.cursor = 'pointer'", status: E, what: 'the ?debug=1 developer overlay, never in a player build' },
  // ── draft ─────────────────────────────────────────────────────────────────────────────────────
  { file: 'src/render/draftOverlay.ts', match: 'this.container.', status: S, what: 'the two draft tiles (hit-tested by draftHitTest) — framed plate + glass layer' },
  // ── exit ──────────────────────────────────────────────────────────────────────────────────────
  { file: 'src/render/exitButton.ts', match: 'backdrop.eventMode', status: E, what: 'the confirm modal scrim' },
  { file: 'src/render/exitButton.ts', match: 'attachButtonFeedback(', status: S, what: 'BACK TO MAIN, LEAVE, KEEP PLAYING — glass, icons, sheen' },
  // ── lobby ─────────────────────────────────────────────────────────────────────────────────────
  { file: 'src/render/lobbyScreen.ts', match: 'this.joinPane.', status: E, what: 'the JOIN pane body (focuses the code box) — the pane wears the panel frame; it is a surface, not a button' },
  { file: 'src/render/lobbyScreen.ts', match: 'this.joinButton.', status: S, what: 'Connect — glass + chip hover (lights only when the code is complete)' },
  { file: 'src/render/lobbyScreen.ts', match: 'attachButtonFeedback(', status: S, what: 'Host/Join/Begin/Back/Quick/Test/READY — glass + sheen' },
  { file: 'src/render/seatRack.ts', match: "cell.on('pointertap'", status: S, what: 'your own seat (race-picker opener) — chip hover over its banner' },
  { file: 'src/render/seatRack.ts', match: "moveChip.on('pointertap'", status: S, what: 'S195 N16 — the MOVE chip of the host on each occupied seat — glass + chip hover, live for the host only' },
  { file: 'src/render/seatRack.ts', match: "teamChip.on('pointertap'", status: S, what: 'the multiplayer seat TEAM chip (CLAIM_TEAM, S192/S194) — glass in the team colour + chip hover on YOUR seat' },
  { file: 'src/render/racePicker.ts', match: 'container.eventMode', status: E, what: 'the picker root (modal)' },
  { file: 'src/render/racePicker.ts', match: 'scrim.', status: E, what: 'the modal scrim (closes the picker)' },
  { file: 'src/render/racePicker.ts', match: 'panel.', status: E, what: 'the panel body (swallows taps between tiles)' },
  { file: 'src/render/racePicker.ts', match: 'root.', status: S, what: 'race tiles — glass over the banner + chip hover (inert when taken)' },
  // ── match board (T10, S194): ONE listener pair; every control inside it is a rect in matchBoardLayout ─
  { file: 'src/render/matchBoard.ts', match: 'this.container.eventMode', status: E, what: 'the board root — the full-screen scrim that swallows the world under POSTGAME; its controls are drawn plates, skinned below' },
  { file: 'src/render/matchBoard.ts', match: "this.container.on('pointermove'", status: S, what: 'hover for the tabs, overview rows and CONTINUE (skinButtonFx hover state) and the chart crosshairs (hoverAt)' },
  { file: 'src/render/matchBoard.ts', match: "this.container.on('pointertap'", status: S, what: 'page tabs, overview rows (→ the page of that seat) and CONTINUE — glass via skinButtonFx; the plate via skinPanelFx; hit-tested by matchBoardTips.hoverAt'},
  // ⭐ S195 N5 (info-ui) — the PRESS half of that same listener pair: a latch, not a control; the plates it sinks are the two rows above.
  { file: 'src/render/matchBoard.ts', match: "this.container.on('pointerdown'", status: E, what: 'the board press latch (down): sinks the tab / row / CONTINUE under the pointer — the controls are the pointermove/pointertap rows' },
  { file: 'src/render/matchBoard.ts', match: "this.container.on('pointerup'", status: E, what: 'the board press latch (up): lifts' },
  { file: 'src/render/matchBoard.ts', match: "this.container.on('pointerupoutside'", status: E, what: 'the board press latch (released off the board): lifts' },
  // ── settings (DOM) ────────────────────────────────────────────────────────────────────────────
  { file: 'src/render/settingsOverlay.ts', match: "createElement('button')", status: S, what: 'close ✕ — scoped CSS hover/press/focus (.spark-settings)' },
  { file: 'src/render/settingsOverlay.ts', match: "style.cursor = 'pointer'", status: S, what: 'close, toggles, mutes, sliders — scoped CSS hover/press/focus (.spark-settings)' },
];

/** Surfaces hit-tested by `controls.ts` (no Pixi listener to grep): each file must call the skin. */
const CONTROLS_DRIVEN: ReadonlyArray<{ file: string; what: string }> = [
  { file: 'src/render/footerBand.ts', what: 'tier chips, tower cards, palette/queue, collapse tab, cost readout, Ra / Scorched Earth squares' },
  { file: 'src/render/characterSheet.ts', what: 'the card: owned/weld rows, FIX / SCRAP / FEED + auto-build toggles' },
];

const ROOT = join(__dirname, '..', '..');
const PATTERN = /eventMode\s*[=:]\s*'(static|dynamic)'|\.on\('pointer|attachButtonFeedback\(|createElement\('button'\)|cursor = 'pointer'/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.endsWith('.fixtures.ts')) out.push(p);
  }
  return out;
}

/** Code lines only — comments stripped, so a docblock that mentions `eventMode` claims nothing. */
function codeLines(path: string): string[] {
  const src = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''));
  return src.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, ''));
}

const FILES = [join(ROOT, 'src', 'main.ts'), ...walk(join(ROOT, 'src', 'render'))];

describe('⛔ S194 — every clickable in SPARK is SKINNED or EXEMPT-with-a-reason', () => {
  const found: Array<{ file: string; line: number; text: string }> = [];
  for (const abs of FILES) {
    const file = relative(ROOT, abs).split('\\').join('/');
    codeLines(abs).forEach((text, i) => { if (PATTERN.test(text)) found.push({ file, line: i + 1, text: text.trim() }); });
  }

  it('anti-vacuity: the scan sees the known surfaces', () => {
    expect(found.length).toBeGreaterThan(50);
    expect(found.some((f) => f.file === 'src/render/botSetupOverlay.ts')).toBe(true);
  });

  it('every clickable line is claimed by the census (a new one fails here until it is skinned or exempted)', () => {
    const unclaimed = found.filter((f) => !CENSUS.some((c) => c.file === f.file && f.text.includes(c.match)));
    expect(unclaimed.map((u) => `${u.file}:${u.line}  ${u.text}`)).toEqual([]);
  });

  it('every census entry still claims something (no stale rows)', () => {
    const stale = CENSUS.filter((c) => !found.some((f) => f.file === c.file && f.text.includes(c.match)));
    expect(stale.map((s) => `${s.file} :: ${s.match}`)).toEqual([]);
  });

  it('every EXEMPT row says why; every SKINNED file actually wears the skin', () => {
    for (const c of CENSUS) {
      expect(c.what.length, `${c.file} :: ${c.match}`).toBeGreaterThan(10);
      if (c.status !== 'SKINNED') continue;
      const src = readFileSync(join(ROOT, c.file), 'utf8');
      const wears = /from '\.\/uiSkin(Button)?\.ts'/.test(src) || src.includes("'spark-settings'");
      expect(wears, `${c.file} is marked SKINNED but imports no skin`).toBe(true);
    }
  });

  it('the Controls-driven surfaces (no Pixi listener) call the skin too', () => {
    for (const s of CONTROLS_DRIVEN) {
      const src = readFileSync(join(ROOT, s.file), 'utf8');
      expect(src, s.file).toMatch(/skinButtonFx\(/);
    }
  });

  it('the census itself (printed for the report)', () => {
    const skinned = CENSUS.filter((c) => c.status === 'SKINNED').length;
    const exempt = CENSUS.length - skinned;
    expect(skinned).toBeGreaterThan(exempt);
  });
});
