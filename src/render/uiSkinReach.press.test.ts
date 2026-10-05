/**
 * ⭐ S195 N5 — REACH for the PRESS (owner: *"everything clickable should actually show that it's clicking"*).
 *
 * `uiPressCensus.test.ts` proves a press mechanism EXISTS at every skinned clickable; this file proves it is
 * REACHED: a `pointerdown` delivered through the REAL handler of each surface changes what the next draw
 * puts on screen, `pointerup` restores the hover look, and `pointerupoutside` restores REST — on the real
 * `CastlePanel.sync` (control rows + inventory slots), the real `DraftOverlay.render`, and the real
 * `attachChipHover` chips of CONNECTION LOST, the race picker and a CODEX combo tile.
 *
 * Nothing here asserts on a hit target moving, because none does: every press below is a LOOK on the same
 * plate (T8's rule — the rest-size plate IS the hit target; the chip veil is drawn strictly inside it).
 * ⚠ Off-limits files (`botSetupOverlay.ts`, `lobby*.ts`, `seatRack.ts`) are not driven here; they inherit the
 * chip press through the shared helper, which the CONNECTION LOST / race-picker cases exercise.
 */
import { describe, expect, it, vi } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import 'pixi.js/events';
import { PLAYER_COLORS, SparkType } from '../constants.ts';
import { asPlayerId, type PlayerId } from '../types.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { applyStartGame } from '../state/gameMode.ts';
import { makeCastleBank } from '../state/castleBank.ts';
import { generalPickForWave, draftIndexForWave } from '../state/draft.ts';
import { RACIAL_PERKS_BY_RACE } from '../state/racialPerks.ts';
import type { RaceId } from '../state/races.ts';
import { installFakeTextCanvas } from './fakeTextCanvas.fixtures.ts';
import { CHIP_HOVER_TINT, CHIP_PRESS_TINT, CHIP_PRESS_VEIL_LABEL, sheenRectOf } from './uiSkinButton.ts';

vi.mock('./audioManager.ts', () => ({ playUiClickSFX: vi.fn(async () => {}), playUiRefusedSFX: vi.fn(async () => {}) }));
installFakeTextCanvas();
vi.stubGlobal('requestAnimationFrame', () => 0);
vi.stubGlobal('cancelAnimationFrame', () => {});
vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {}, innerWidth: 1920, innerHeight: 1080 });

type Rec = { g: unknown; x: number; y: number; w: number; h: number; state: string };
const skinned: Rec[] = [];
vi.mock('./uiSkin.ts', async (orig) => {
  const real = await orig<typeof import('./uiSkin.ts')>();
  return {
    ...real,
    skinButtonFx: (g: never, x: number, y: number, w: number, h: number, o: { state: string }) => {
      skinned.push({ g, x, y, w, h, state: o.state });
      real.skinButtonFx(g, x, y, w, h, o as never);
    },
  };
});

const { CastlePanel, CASTLE_ROW_KEYS } = await import('./castlePanel.ts');
const { DraftOverlay, generalTileRect, racialTileRect } = await import('./draftOverlay.ts');
type DraftOptions = import('./draftOverlay.ts').DraftOptions;
const { makeConnectionLostOverlay } = await import('./connectionLostOverlay.ts');
const { makeRacePicker } = await import('./racePicker.ts');
const { CodexOverlay } = await import('./codexOverlay.ts');

const P0 = asPlayerId(0);

/* ── castle panel ─────────────────────────────────────────────────────────────────────────────── */

function castleWorld(): World {
  const w = makeWorld(0x195c);
  w.gameState = 'TITLE';
  dispatch(w, { type: 'START_GAME', mode: 'solo', isHost: true, roster: [{ seat: 0, color: PLAYER_COLORS[0]! }], botSeats: [] });
  // Two shapes in the bank, so slot 0 (Circle) is FILLED and can press; the rest stay disabled.
  const bank = makeCastleBank();
  bank[SparkType.Circle as number] = 2;
  w.castleBanks.set(P0, bank);
  return w;
}

interface Box { box: Container; bg: Graphics; hover: boolean; press: boolean }

function stateOf(bg: unknown): string {
  const mine = skinned.filter((s) => s.g === bg);
  expect(mine.length, 'skinned exactly once per sync').toBe(1);
  return mine[0]!.state;
}

describe('S195 N5 — castle panel: a held row / slot skins PRESS through its own Pixi handlers (real sync)', () => {
  const stage = new Container();
  const panel = new CastlePanel({ stage } as never);
  const w = castleWorld();
  panel.open(0);
  const rows = (panel as unknown as { rows: Box[] }).rows;
  const slots = (panel as unknown as { slots: Box[] }).slots;

  const draw = (b: Box): string => { skinned.length = 0; panel.sync(w); return stateOf(b.bg); };

  it('anti-vacuity: rows exist and at least one is ENABLED at the opening balance (its rest state is rest)', () => {
    expect(rows.length).toBe(CASTLE_ROW_KEYS.length);
    const live = rows.filter((r) => draw(r) === 'rest');
    expect(live.length).toBeGreaterThan(0);
  });

  it('every enabled row: down → PRESS, up (still over) → HOVER, out → REST', () => {
    let checked = 0;
    for (const r of rows) {
      if (draw(r) !== 'rest') continue; // a disabled row says why instead (its own contract); not under test here
      checked++;
      r.box.emit('pointerover', {} as never);
      expect(draw(r)).toBe('hover');
      r.box.emit('pointerdown', {} as never);
      expect(draw(r), 'held under the pointer').toBe('press');
      r.box.emit('pointerup', {} as never);
      expect(draw(r), 'released, pointer still over').toBe('hover');
      r.box.emit('pointerout', {} as never);
      expect(draw(r)).toBe('rest');
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('⚠ dragging OFF a held row never leaves it sunk: pointerupoutside clears the latch', () => {
    const r = rows.find((x) => draw(x) === 'rest')!;
    r.box.emit('pointerover', {} as never);
    r.box.emit('pointerdown', {} as never);
    r.box.emit('pointerout', {} as never); // the pointer slides off while held
    expect(draw(r), 'held but no longer under the pointer: not pressed').toBe('rest');
    r.box.emit('pointerupoutside', {} as never);
    r.box.emit('pointerover', {} as never);
    expect(draw(r), 'back over it after the release: hover, not a stale press').toBe('hover');
  });

  it('a press that lands while hovering a DIFFERENT row lights only that row', () => {
    const live = rows.filter((x) => draw(x) === 'rest');
    expect(live.length).toBeGreaterThanOrEqual(2);
    const [a, b] = [live[0]!, live[1]!];
    b.box.emit('pointerover', {} as never);
    b.box.emit('pointerdown', {} as never);
    skinned.length = 0;
    panel.sync(w);
    expect(stateOf(b.bg)).toBe('press');
    expect(stateOf(a.bg)).toBe('rest');
    b.box.emit('pointerup', {} as never);
    b.box.emit('pointerout', {} as never);
  });

  it('the inventory slot that HOLDS shapes presses; an empty one stays DISABLED under the same gesture', () => {
    const filled = slots[SparkType.Circle as number]!;
    const empty = slots[SparkType.Square as number]!;
    expect(draw(filled)).toBe('rest');
    expect(draw(empty)).toBe('disabled');
    for (const s of [filled, empty]) { s.box.emit('pointerover', {} as never); s.box.emit('pointerdown', {} as never); }
    skinned.length = 0;
    panel.sync(w);
    expect(stateOf(filled.bg)).toBe('press');
    expect(stateOf(empty.bg)).toBe('disabled');
    for (const s of [filled, empty]) { s.box.emit('pointerupoutside', {} as never); s.box.emit('pointerout', {} as never); }
    expect(draw(filled)).toBe('rest');
  });

  it('the press changes only the STATE: the plate rect is the same one the skin was drawn on at rest', () => {
    const r = rows.find((x) => draw(x) === 'rest')!;
    skinned.length = 0; panel.sync(w);
    const rest = skinned.find((s) => s.g === r.bg)!;
    r.box.emit('pointerover', {} as never); r.box.emit('pointerdown', {} as never);
    skinned.length = 0; panel.sync(w);
    const down = skinned.find((s) => s.g === r.bg)!;
    expect([down.x, down.y, down.w, down.h]).toEqual([rest.x, rest.y, rest.w, rest.h]);
    r.box.emit('pointerup', {} as never); r.box.emit('pointerout', {} as never);
  });
});

/* ── draft overlay ────────────────────────────────────────────────────────────────────────────── */

function offerAsIfBuilt(waveNumber: number, race: RaceId): DraftOptions {
  return { general: generalPickForWave(waveNumber), racial: RACIAL_PERKS_BY_RACE[race][draftIndexForWave(waveNumber)] ?? null };
}
const centre = (r: { x: number; y: number; w: number; h: number }): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

describe('S195 N5 — draft tiles: a lit tile under a held primary button skins PRESS (real DraftOverlay.render)', () => {
  const w = makeWorld(0x195d);
  applyStartGame(w, { type: 'START_GAME' } as never);
  const seat = [...w.players.keys()][0] as PlayerId;
  const o = new DraftOverlay(() => {}, { optionsFor: offerAsIfBuilt, loadCard: () => new Promise(() => {}) });
  const g = generalTileRect();
  const r = racialTileRect();
  const draw = (): Rec[] => { skinned.length = 0; o.render(w, seat); return [...skinned]; };
  const at = (recs: Rec[], rect: { x: number; y: number }): string => recs.find((s) => s.x === rect.x && s.y === rect.y)!.state;

  it('hover the GENERAL tile, press, release, leave — hover / press / hover / rest; the racial tile never moves', () => {
    draw(); // the hit-test reads the options of the LAST render; before the first there are none
    o.container.emit('pointermove', { global: centre(g) } as never);
    expect(at(draw(), g)).toBe('hover');
    o.container.emit('pointerdown', { button: 0 } as never);
    const held = draw();
    expect(at(held, g)).toBe('press');
    expect(at(held, r)).not.toBe('press');
    o.container.emit('pointerup', {} as never);
    expect(at(draw(), g)).toBe('hover');
    o.container.emit('pointerleave', {} as never);
    expect(at(draw(), g)).toBe('rest');
  });

  it('a RIGHT-button down does not look like a press (it cannot pick, so it must not promise one)', () => {
    o.container.emit('pointermove', { global: centre(r) } as never);
    o.container.emit('pointerdown', { button: 2 } as never);
    expect(at(draw(), r)).toBe('hover');
    o.container.emit('pointerupoutside', {} as never);
  });

  it('⚠ a drag off the panel while held: pointerupoutside clears the latch', () => {
    o.container.emit('pointermove', { global: centre(g) } as never);
    o.container.emit('pointerdown', { button: 0 } as never);
    o.container.emit('pointerleave', {} as never);
    o.container.emit('pointerupoutside', {} as never);
    o.container.emit('pointermove', { global: centre(g) } as never);
    expect(at(draw(), g), 'back over the tile after the outside release: hover, not a stale press').toBe('hover');
  });
});

/* ── chips (attachChipHover) ──────────────────────────────────────────────────────────────────── */

function chipsOf(root: Container): Container[] {
  const out: Container[] = [];
  const walk = (n: Container): void => {
    if (sheenRectOf(n) !== undefined && n.getChildByLabel(CHIP_PRESS_VEIL_LABEL) !== null) out.push(n);
    for (const ch of n.children) walk(ch as Container);
  };
  walk(root);
  return out;
}

/** The plate `attachChipHover` tints on a plate chip: its FIRST Graphics child (the bg, added before anything else). */
function plateOf(c: Container): Graphics {
  const g = c.children.find((ch) => ch instanceof Graphics && ch.label !== 'sheen' && ch.label !== CHIP_PRESS_VEIL_LABEL);
  expect(g, 'a plate chip has a bg Graphics').toBeDefined();
  return g as Graphics;
}

function checkChipPress(c: Container, label: string, plate: Graphics | null): void {
  const r = sheenRectOf(c)!;
  const veil = c.getChildByLabel(CHIP_PRESS_VEIL_LABEL) as Graphics;
  expect(veil.context.instructions.length, `${label}: no veil at rest`).toBe(0);
  c.emit('pointerover', {} as never);
  if (plate !== null) expect(plate.tint, `${label}: hover tint`).toBe(CHIP_HOVER_TINT);
  c.emit('pointerdown', {} as never);
  expect(veil.context.instructions.length, `${label}: the veil is drawn while held`).toBeGreaterThan(0);
  const b = veil.bounds;
  expect(b.minX >= r.x && b.minY >= r.y && b.maxX <= r.x + r.w && b.maxY <= r.y + r.h, `${label}: veil inside the chip rect`).toBe(true);
  if (plate !== null) expect(plate.tint, `${label}: press tint, below rest`).toBe(CHIP_PRESS_TINT);
  c.emit('pointerup', {} as never);
  expect(veil.context.instructions.length, `${label}: lifted on release`).toBe(0);
  if (plate !== null) expect(plate.tint, `${label}: back to hover after release over it`).toBe(CHIP_HOVER_TINT);
  c.emit('pointerout', {} as never);
  if (plate !== null) expect(plate.tint, `${label}: rest tint`).toBe(0xffffff);
  // The trap: held, dragged off, released elsewhere.
  c.emit('pointerover', {} as never);
  c.emit('pointerdown', {} as never);
  c.emit('pointerout', {} as never);
  expect(veil.context.instructions.length, `${label}: pointerout while held lifts the veil`).toBe(0);
  c.emit('pointerupoutside', {} as never);
  expect(veil.context.instructions.length, `${label}: pointerupoutside leaves nothing sunk`).toBe(0);
  if (plate !== null) expect(plate.tint, `${label}: rest tint after an outside release`).toBe(0xffffff);
}

describe('S195 N5 — chips: the shared press half, reached through real chips', () => {
  it('CONNECTION LOST — Return to Title (a plate chip)', () => {
    const stage = new Container();
    const h = makeConnectionLostOverlay({ stage } as never, () => {});
    h.setVisible(true);
    const chips = chipsOf(stage);
    expect(chips.length).toBe(1);
    checkChipPress(chips[0]!, 'connection lost', plateOf(chips[0]!));
  });

  it('race picker — every choosable tile (a NULL-plate chip: the veil alone carries the press); a taken tile stays inert', () => {
    const stage = new Container();
    const p = makeRacePicker(() => {});
    stage.addChild(p.container);
    p.open(new Set(['orcs'] as never), undefined);
    const chips = chipsOf(stage);
    const live = chips.filter((c) => c.eventMode === 'static');
    const taken = chips.filter((c) => c.eventMode !== 'static');
    expect(live.length).toBeGreaterThanOrEqual(5);
    expect(taken.length).toBe(1);
    for (const c of live) checkChipPress(c, 'race tile', null); // racePicker hands attachChipHover a NULL plate
    const veil = taken[0]!.getChildByLabel(CHIP_PRESS_VEIL_LABEL) as Graphics;
    taken[0]!.emit('pointerover', {} as never);
    taken[0]!.emit('pointerdown', {} as never);
    expect(veil.context.instructions.length, 'an inert tile does not pretend to take the click').toBe(0);
  });

  it('CODEX — every combo tile on the COMBOS tab', () => {
    const stage = new Container();
    const app = { stage, canvas: { addEventListener() {}, removeEventListener() {} }, ticker: { add() {}, remove() {} } };
    const codex = new CodexOverlay(app as never, { towers: [] }, () => {});
    (codex as unknown as { switchTab(t: string): void }).switchTab('combos');
    const chips = chipsOf(codex.container);
    expect(chips.length, 'the fourteen combo tiles (anti-vacuity: more than a handful)').toBeGreaterThan(5);
    for (const c of chips) checkChipPress(c, 'combo tile', plateOf(c));
  });
});
