/**
 * SPARK — S188 (audit F1) — **A CLICK ON THE DRAFT PANEL IS THE PANEL'S, AND NOTHING UNDER IT ACTS.**
 *
 * The S187 upgrade panel is a zIndex-900 opaque plate over the quarry whose side margins lie over
 * buildable ground. Its pick is its own Pixi `pointertap`; `controls.ts` listens on the raw canvas,
 * and Pixi never stops the native event — so before this fix ONE click on a tile ALSO stamped an
 * armed tower, re-tasked a gatherer, raided, opened a card, planted a dropped spark or potato, or
 * cast a held Power of Ra, all on ground the plate hides.
 *
 * ⭐ DRIVEN THROUGH THE REAL `Controls` HANDLERS AND THE REAL `DraftOverlay` after a real `render`,
 * because a source-text tripwire proves a line exists and cannot prove it is reached (S182 lesson 2
 * — `s182UiSurfaceGuards.test.ts` carries the tripwire half). Every scenario is run three ways:
 *   · PRE-FIX — the panel drawn, but not wired into `Controls` (exactly the shipped S187 code path):
 *     the ORACLE that the scenario really does act on the board there (anti-vacuity);
 *   · OPEN — the panel drawn and wired: NO board action at all;
 *   · CLOSED — the draft resolved (panel hidden), wired vs unwired: IDENTICAL, i.e. exactly as before.
 * Every point is derived from the panel's own exported geometry, never a literal.
 *
 * ⚠ The harness stubs only what a headless run lacks: `window`, a 1:1 canvas, the UI sound cues, and
 * a fixed-advance text measurer (the same stand-in `draftOverlay.test.ts` uses).
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../render/audioManager.ts', () => ({
  playUiClickSFX: vi.fn(async () => {}),
  playUiRefusedSFX: vi.fn(async () => {}),
}));

import { Container, Graphics } from 'pixi.js';
import { PLAYER_COLORS, SparkType } from '../constants.ts';
import { asCreatureId, asPlayerId, asSparkId, asSpawnerId, type PlayerId } from '../types.ts';
import { dispatch, makeWorld, type GameAction, type World } from '../state/world.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { makeCreature } from '../state/creatures/creature.ts';
import { GOBLIN_MELEE_CONFIG } from '../state/creatures/voltkin-config.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import type { DraftPick } from '../state/draft.ts';
import { Controls, type CastlePanelLike, type CharacterSheetLike, type SheetSelectable } from './controls.ts';
import { DraftOverlay, PANEL_H, PANEL_W, PANEL_X, PANEL_Y, generalTileRect, racialTileRect } from '../render/draftOverlay.ts';
import { FooterBand } from '../render/footerBand.ts';
import { raAimPreview, setRaAimPreview } from '../render/raAimPreview.ts';

class FakeContext2D {
  font = '10px sans-serif';
  letterSpacing = '0px';
  textLetterSpacing = '0px';
  measureText(s: string): { width: number; actualBoundingBoxLeft: number; actualBoundingBoxRight: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number } {
    const px = Number(/(\d+)px/.exec(this.font)?.[1] ?? 10);
    const w = s.length * px * 0.6;
    return { width: w, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w, actualBoundingBoxAscent: px * 0.8, actualBoundingBoxDescent: px * 0.2 };
  }
}
class FakeOffscreenCanvas {
  constructor(public width: number, public height: number) {}
  getContext(): FakeContext2D {
    return new FakeContext2D();
  }
}

beforeAll(() => {
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('document', { activeElement: null });
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  vi.stubGlobal('CanvasRenderingContext2D', FakeContext2D);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
afterEach(() => setRaAimPreview(null));

type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
const centre = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/* ── the points, all derived from the panel's exported geometry ─────────────────────────────── */

const G = generalTileRect();
const R = racialTileRect();
const MID_Y = PANEL_Y + PANEL_H / 2;
/** The plate's padding either side of the tiles — derived, so a re-laid panel moves the points. */
const PAD = G.x - PANEL_X;
const POINTS: Readonly<Record<string, Pt>> = {
  'the general tile, centre': centre(G),
  'the racial tile, centre': centre(R),
  'the general tile, outer edge (clear of the quarry keep-out)': { x: G.x + PAD, y: MID_Y },
  'the racial tile, outer edge (clear of the quarry keep-out)': { x: R.x + R.w - PAD, y: MID_Y },
  'the left side margin': { x: PANEL_X + PAD / 2, y: MID_Y },
  'the right side margin': { x: PANEL_X + PANEL_W - PAD / 2, y: MID_Y },
};

/* ── the rig ────────────────────────────────────────────────────────────────────────────────── */

interface RigOpts {
  readonly seat?: 0 | 1;
  /** Wire the panel into Controls. `false` is the PRE-FIX code path. */
  readonly wire?: boolean;
  /** Leave the draft open (the panel drawn). `false` resolves it, so the panel hides. */
  readonly open?: boolean;
  /** A mummies seat holding POWER OF RA, in a FIGHT, with the wave-6 draft still owed. */
  readonly ra?: boolean;
  /**
   * The seat under test plays MUMMIES, at the wave-1 draft. `mummies.l0` is built, so once the
   * s188/cards panel (live racial tile) is merged that seat's right-hand tile is CHOOSABLE; on a
   * panel whose racial tile is still COMING SOON it is dead. The assertions hold either way.
   */
  readonly mummies?: boolean;
}

interface Rig {
  readonly w: World;
  readonly c: Controls;
  readonly seat: PlayerId;
  readonly overlay: DraftOverlay;
  readonly band: FooterBand;
  readonly castle: CastlePanelLike & { armed: GodlyId | null };
  readonly sent: GameAction[];
  readonly built: Array<{ id: GodlyId; centre: Pt }>;
  readonly selects: Array<SheetSelectable | null>;
  readonly picks: DraftPick[];
  readonly canvas: { style: { cursor: string } };
}

function castleStub(): CastlePanelLike & { armed: GodlyId | null } {
  const s = {
    armed: null as GodlyId | null,
    isOpen: () => false,
    toggle() {},
    close() {},
    isOverPanel: () => false,
    armedBlueprint: () => s.armed,
    disarm() { s.armed = null; },
    armExternal(id: GodlyId | null) { s.armed = id; },
    requestShapesFor() {},
  };
  return s;
}

function sheetStub(selects: Array<SheetSelectable | null>): CharacterSheetLike {
  let sel: SheetSelectable | null = null;
  return {
    select(t) { sel = t; selects.push(t); },
    selection: () => sel,
    ownedRowAt: () => null,
    isOver: () => false,
    actionAt: () => null,
    isOverAnyAction: () => false,
    actionPrimitiveId: () => null,
    actionFeedSpawnerId: () => null,
    setHover() {},
  };
}

function rig(o: RigOpts = {}): Rig {
  const seatN = o.seat ?? 0;
  const seat = asPlayerId(seatN);
  const w = makeWorld(0xd4a7);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: [0, 1].map((s) => ({
      seat: s, color: PLAYER_COLORS[s]!,
      raceId: (o.ra === true || o.mummies === true) && s === seatN ? ('mummies' as const) : undefined,
    })),
    botSeats: [1],
  });
  expect(w.layout).toBe('PITCH_2P');
  expect(w.matchPhase, 'the pre-wave-1 draft opens in BUILD, with the board live underneath').toBe('BUILD');
  expect(w.draft, 'the draft is open from the first tick').not.toBeNull();
  if (o.ra === true) {
    dispatch(w, { type: 'CHOOSE_DRAFT', playerId: seat, pick: 'racial' });
    // Held from wave 1; the wave-6 draft is open and owed; the fight is on. Forced, because the
    // draft closes with BUILD — the guard is about WHERE the click lands, not about the clock.
    w.draft = { openedAtTick: w.tick, waveNumber: 6 };
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = w.tick + 1_000_000;
  }
  if (o.open === false) w.draft = null;

  const sent: GameAction[] = [];
  const built: Array<{ id: GodlyId; centre: Pt }> = [];
  const selects: Array<SheetSelectable | null> = [];
  const picks: DraftPick[] = [];
  const canvas = {
    addEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    style: { cursor: '' },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080, right: 1920, bottom: 1080, x: 0, y: 0 }),
  };
  const c = new Controls({ canvas } as never, w, seat, (a) => { sent.push(a); dispatch(w, a); });
  const castle = castleStub();
  c.setCastlePanel(castle);
  c.setBuildBlueprintHandler((id, at) => built.push({ id, centre: { x: at.x, y: at.y } }));
  c.setCharacterSheet(sheetStub(selects));
  const stage = new Container();
  const band = new FooterBand({ stage } as never, stage);
  c.setFooterBand(band);
  band.sync(w);
  const overlay = new DraftOverlay((p) => picks.push(p));
  overlay.render(w, seat);
  expect(overlay.container.visible, 'the panel is drawn exactly when the draft is owed').toBe(o.open !== false);
  if (o.wire !== false) c.setDraftPanel(overlay);
  return { w, c, seat, overlay, band, castle, sent, built, selects, picks, canvas };
}

type Ptr = { button: number; clientX: number; clientY: number; pointerId: number };
const down = (c: Controls, p: Pt, button = 0): void =>
  (c as unknown as { onDown(e: Ptr): void }).onDown({ button, clientX: p.x, clientY: p.y, pointerId: 1 });
const up = (c: Controls, p: Pt, button = 0): void =>
  (c as unknown as { onUp(e: Ptr): void }).onUp({ button, clientX: p.x, clientY: p.y, pointerId: 1 });
const move = (c: Controls, p: Pt): void =>
  (c as unknown as { onMove(e: Ptr): void }).onMove({ button: 0, clientX: p.x, clientY: p.y, pointerId: 1 });
const click = (c: Controls, p: Pt, button = 0): void => {
  down(c, p, button);
  up(c, p, button);
};
/** The panel's own Pixi tap, as Pixi would deliver it for a primary press at `p`. */
const panelTap = (o: DraftOverlay, p: Pt): void => {
  o.container.emit('pointertap', { global: { x: p.x, y: p.y }, button: 0 } as never);
};
/** The panel's own Pixi hover, as Pixi would deliver it. */
const panelHover = (o: DraftOverlay, p: Pt): void => {
  o.container.emit('pointermove', { global: { x: p.x, y: p.y }, button: 0 } as never);
};

/**
 * What reached the BOARD. ⚠ `DROP_SPARK` is left out on purpose: it is how a spark drag ENDS on
 * every release, placed or not (it hands the claim back and the spark stays where physics put it —
 * the S58 no-glued-spark rule). The placement is `PLACE_FROM_FREE`, and that is what is counted.
 */
function boardActions(r: Rig): string[] {
  return [
    ...r.sent.filter((a) => a.type !== 'DROP_SPARK').map((a) => a.type),
    ...r.built.map((b) => `BUILD ${b.id}`),
    ...r.selects.map((s) => `CARD ${s === null ? 'closed' : s.kind}`),
  ];
}
function clearLogs(r: Rig): void {
  r.sent.length = 0;
  r.built.length = 0;
  r.selects.length = 0;
}

/* ── the scenarios: one gesture each, each a thing the audit reproduced or the code allowed ─── */

interface Scenario {
  readonly name: string;
  readonly seats: ReadonlyArray<0 | 1>;
  readonly ra?: boolean;
  /** Put the world in the state the gesture needs. Anything it dispatches is not counted. */
  setup(r: Rig, p: Pt): void;
  /** The gesture itself — the click (or release) on the panel. */
  act(r: Rig, p: Pt): void;
}

const STAMPED: GodlyId = 't3TowerVampires' as GodlyId;

function ownGatherer(r: Rig) {
  const g = [...r.w.gatherers.values()].find((q) => q.ownerPlayerId === r.seat);
  expect(g, 'every seat starts with a gatherer').toBeDefined();
  return g!;
}

function enemyGoblinAt(r: Rig, p: Pt): void {
  const enemy = asPlayerId(r.seat === asPlayerId(0) ? 1 : 0);
  const gob = makeCreature(GOBLIN_MELEE_CONFIG, {
    id: asCreatureId(9100 + r.w.creatures.size),
    ownerPlayerId: enemy,
    pos: { x: p.x, y: p.y },
    targetPos: { x: p.x, y: p.y },
    spawnedAtTick: r.w.tick,
    sourceSpawnerId: asSpawnerId(9900),
    clock: r.w,
  });
  r.w.creatures.set(gob.id, gob);
}

/** Where a spark drag STARTS: off the panel, on the dragging seat's own side, outside the quarry. */
const dragStart = (seat: PlayerId): Pt =>
  seat === asPlayerId(0) ? { x: PANEL_X - 80, y: PANEL_Y + 40 } : { x: PANEL_X + PANEL_W + 80, y: PANEL_Y + 40 };

const SCENARIOS: readonly Scenario[] = [
  {
    name: 'a tower armed from the footer — LMB',
    seats: [0, 1],
    setup(r) { r.castle.armed = STAMPED; },
    act(r, p) { click(r.c, p); },
  },
  {
    name: 'one of your own gatherers under the click — LMB',
    seats: [0, 1],
    setup(r, p) { const g = ownGatherer(r); g.pos.x = p.x; g.pos.y = p.y; },
    act(r, p) { click(r.c, p); },
  },
  {
    name: 'an enemy unit under a RIGHT-click — the raid',
    seats: [0, 1],
    setup(r, p) { enemyGoblinAt(r, p); },
    act(r, p) { click(r.c, p, 2); },
  },
  {
    name: 'an enemy unit under a LEFT-click — its character card',
    seats: [0],
    setup(r, p) { enemyGoblinAt(r, p); },
    act(r, p) { click(r.c, p); },
  },
  {
    name: 'a spark dragged off the board and released over the panel',
    seats: [0, 1],
    setup(r, p) {
      const at = dragStart(r.seat);
      const s = makeFreeSpark({ id: asSparkId(8800), type: SparkType.Square, pos: at, velocity: { x: 0, y: 0 }, dt: 1, createdTick: r.w.tick });
      r.w.freeSparks.set(s.id, s);
      down(r.c, at); // the grab happens OFF the panel — it is the release under test
      expect(r.c.state.kind, 'the grab landed').toBe('AttractDrag');
      s.pos.x = p.x; // the spark has caught up with the cursor, as the attract lerp does
      s.pos.y = p.y;
      move(r.c, p);
    },
    act(r, p) { up(r.c, p); },
  },
  {
    name: 'a potato carried and released over the panel',
    seats: [0],
    setup(r) { r.w.players.get(r.seat)!.carriedPotatoId = 1 as never; },
    act(r, p) { up(r.c, p); },
  },
  {
    name: 'POWER OF RA aimed — the cast click',
    seats: [0],
    ra: true,
    setup(r) {
      const b = r.band.getUiPoints().ra;
      expect(b, 'the seat holds Ra, so its button is drawn').not.toBeNull();
      click(r.c, centre(b!));
      expect(raAimPreview(), 'aiming').not.toBeNull();
    },
    act(r, p) { click(r.c, p); },
  },
];

function run(s: Scenario, seat: 0 | 1, p: Pt, o: { wire: boolean; open: boolean }): { r: Rig; actions: string[] } {
  const r = rig({ seat, wire: o.wire, open: o.open, ra: s.ra });
  s.setup(r, p);
  clearLogs(r);
  s.act(r, p);
  return { r, actions: boardActions(r) };
}

describe('⛔⛔ S188 F1 — a click on the draft panel acts on NOTHING under it', () => {
  for (const s of SCENARIOS) {
    for (const seat of s.seats) {
      describe(`${s.name} (seat ${seat})`, () => {
        it('PRE-FIX it reaches the board at least once — the scenario is real (anti-vacuity)', () => {
          const reached = Object.entries(POINTS).filter(([, p]) => run(s, seat, p, { wire: false, open: true }).actions.length > 0);
          expect(reached.length, 'if this is 0 the scenario proves nothing').toBeGreaterThan(0);
        });

        it.each(Object.entries(POINTS))('with the panel OPEN: %s → no board action', (_name, p) => {
          const { r, actions } = run(s, seat, p, { wire: true, open: true });
          expect(actions).toEqual([]);
          if (s.name.startsWith('a tower armed')) {
            expect(r.castle.armed, 'swallowed, not spent — the tower stays in hand').toBe(STAMPED);
          }
          if (s.ra === true) expect(raAimPreview(), 'still aiming — the cast was not spent either').not.toBeNull();
        });

        it.each(Object.entries(POINTS))('with the panel CLOSED: %s → exactly what it did before', (_name, p) => {
          const wired = run(s, seat, p, { wire: true, open: false }).actions;
          const unwired = run(s, seat, p, { wire: false, open: false }).actions;
          expect(wired).toEqual(unwired);
        });
      });
    }
  }
});

describe('⭐ ONE click on a tile: the pick, and nothing else', () => {
  it('the general tile at a stampable spot, with a tower armed AND a gatherer under it', () => {
    const p = POINTS['the general tile, outer edge (clear of the quarry keep-out)']!;
    const act = (r: Rig): void => {
      r.castle.armed = STAMPED;
      const g = ownGatherer(r);
      g.pos.x = p.x;
      g.pos.y = p.y;
      click(r.c, p);
      panelTap(r.overlay, p); // Pixi's pointertap, which fires for the same physical click
    };
    const before = rig({ wire: false });
    act(before);
    expect(before.picks, 'pre-fix: the pick…').toHaveLength(1);
    expect(boardActions(before).length, '…AND a board action, from ONE click').toBeGreaterThan(0);

    const after = rig();
    act(after);
    expect(after.picks, 'the pick').toHaveLength(1);
    expect(boardActions(after), 'and nothing else').toEqual([]);
  });
});

describe('⭐ the racial tile, DEAD or LIVE — the board under it is never reached', () => {
  /*
   * The verifier's ask: run the stamp with the racial tile dead AND live. On this branch the panel's
   * racial tile is COMING SOON; with s188/cards merged a mummies seat at wave 1 is offered
   * `mummies.l0` and the tile is choosable. `isOverChoosable` says which world the test is in, and
   * the pick count follows it; the board assertions do not care.
   */
  const p = POINTS['the racial tile, outer edge (clear of the quarry keep-out)']!;
  const cases: ReadonlyArray<{ seat: 0 | 1; what: string; arm: boolean }> = [
    { seat: 0, what: 'one of your gatherers under it', arm: false },
    { seat: 1, what: 'one of your gatherers under it', arm: false },
    // Seat 1's own ground: the stamp the audit reproduced under this tile.
    { seat: 1, what: 'a tower armed', arm: true },
  ];
  for (const k of cases) {
    it(`seat ${k.seat} (mummies), ${k.what}: the racial tile's pick, if live, and nothing else`, () => {
      const act = (r: Rig): void => {
        if (k.arm) {
          r.castle.armed = STAMPED;
        } else {
          const g = ownGatherer(r);
          g.pos.x = p.x;
          g.pos.y = p.y;
        }
        click(r.c, p);
        panelTap(r.overlay, p);
      };
      const before = rig({ seat: k.seat, mummies: true, wire: false });
      act(before);
      expect(boardActions(before).length, 'pre-fix it acted on the board (anti-vacuity)').toBeGreaterThan(0);

      const r = rig({ seat: k.seat, mummies: true });
      const live = r.overlay.isOverChoosable(p.x, p.y);
      console.info(`[draftPanel.test] seat ${k.seat} racial tile is ${live ? 'LIVE' : 'DEAD (COMING SOON)'} on this tree`);
      act(r);
      expect(boardActions(r), `racial tile ${live ? 'LIVE' : 'dead'}: nothing reaches the board`).toEqual([]);
      expect(r.picks, live ? 'the live tile makes its pick' : 'the dead tile picks nothing').toEqual(live ? ['racial'] : []);
      if (k.arm) expect(r.castle.armed, 'and the tower stays in hand').toBe(STAMPED);
    });
  }
});

describe('⭐ the panel as a surface — `DraftOverlay.isOver` registers everything it draws', () => {
  it('every Graphics it draws answers isOver — the plate, both tiles, and the hover-detail plate BELOW the panel', () => {
    const r = rig();
    panelHover(r.overlay, centre(G)); // the general tile's detail plate is drawn while it is hovered
    r.overlay.render(r.w, r.seat);
    const drawn = r.overlay.container.children.filter((ch): ch is Graphics => ch instanceof Graphics && ch.bounds.width > 0);
    expect(drawn.length).toBeGreaterThanOrEqual(3);
    const tip = drawn.find((g) => g.bounds.minY >= PANEL_Y + PANEL_H);
    expect(tip, 'the hover-detail plate is drawn below the panel rect (anti-vacuity)').toBeDefined();
    for (const g of drawn) {
      const b = g.bounds;
      const inset = 4; // clear of the rounded corners
      for (const p of [
        { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
        { x: b.minX + inset, y: b.minY + inset },
        { x: b.maxX - inset, y: b.minY + inset },
        { x: b.minX + inset, y: b.maxY - inset },
        { x: b.maxX - inset, y: b.maxY - inset },
      ]) {
        expect(r.overlay.isOver(p.x, p.y), `drawn at (${p.x}, ${p.y}) but not a surface`).toBe(true);
      }
    }
  });

  it('⛔ the tip plate is a surface ONLY while it is drawn — the ground under it is board otherwise', () => {
    const r = rig();
    panelHover(r.overlay, centre(G));
    r.overlay.render(r.w, r.seat);
    const tip = r.overlay.container.children.find(
      (ch): ch is Graphics => ch instanceof Graphics && ch.bounds.width > 0 && ch.bounds.minY >= PANEL_Y + PANEL_H,
    )!;
    const p = { x: tip.bounds.minX + PAD * 2, y: (tip.bounds.minY + tip.bounds.maxY) / 2 };
    expect(r.overlay.isOver(p.x, p.y)).toBe(true);
    r.castle.armed = STAMPED;
    click(r.c, p);
    expect(r.built, 'no tower under the detail plate').toEqual([]);

    panelHover(r.overlay, POINTS['the left side margin']!); // off the tile: the plate goes away
    r.overlay.render(r.w, r.seat);
    expect(r.overlay.isOver(p.x, p.y), 'cleared, it swallows nothing').toBe(false);
    click(r.c, p);
    expect(r.built.map((b) => b.id), 'the same point is board again').toEqual([STAMPED]);
  });

  it('nothing it does not draw: off the plate, below it with no tip, and all of it once hidden', () => {
    const r = rig();
    const off = [
      { x: PANEL_X - 3, y: MID_Y },
      { x: PANEL_X + PANEL_W + 3, y: MID_Y },
      { x: PANEL_X + PANEL_W / 2, y: PANEL_Y + PANEL_H + 12 },
    ];
    for (const p of off) expect(r.overlay.isOver(p.x, p.y), `(${p.x}, ${p.y})`).toBe(false);
    for (const p of Object.values(POINTS)) expect(r.overlay.isOver(p.x, p.y)).toBe(true);
    r.w.draft = null;
    r.overlay.render(r.w, r.seat);
    for (const p of Object.values(POINTS)) expect(r.overlay.isOver(p.x, p.y), 'hidden').toBe(false);
  });

  it('⭐ isOverChoosable is the CONTROL half: a live tile, never the plate', () => {
    const r = rig();
    expect(r.overlay.isOverChoosable(centre(G).x, centre(G).y)).toBe(true);
    for (const k of ['the left side margin', 'the right side margin'] as const) {
      const p = POINTS[k]!;
      expect(r.overlay.isOverChoosable(p.x, p.y), k).toBe(false);
    }
    // The racial tile is choosable exactly when a perk is on offer; either way it is a surface.
    const rc = centre(R);
    if (r.overlay.isOverChoosable(rc.x, rc.y)) expect(r.overlay.isOver(rc.x, rc.y)).toBe(true);
    r.w.draft = null;
    r.overlay.render(r.w, r.seat);
    expect(r.overlay.isOverChoosable(centre(G).x, centre(G).y), 'hidden').toBe(false);
  });
});

describe('⭐ the cursor promises a pointer exactly where a click picks', () => {
  it('a live tile → pointer; the plate and the margins → plain; the dead tile → only if it is live', () => {
    const r = rig();
    move(r.c, centre(G));
    expect(r.canvas.style.cursor).toBe('pointer');
    move(r.c, POINTS['the left side margin']!);
    expect(r.canvas.style.cursor).toBe('');
    const rc = centre(R);
    move(r.c, rc);
    expect(r.canvas.style.cursor).toBe(r.overlay.isOverChoosable(rc.x, rc.y) ? 'pointer' : '');
  });

  it('closed, the tile\'s ground promises nothing', () => {
    const r = rig({ open: false });
    move(r.c, centre(G));
    expect(r.canvas.style.cursor).toBe('');
  });
});

describe('⛔ S190 (audit IL-2) — a RIGHT-click on the plate still puts back what is in hand; the raid stays swallowed', () => {
  /*
   * RMB is the put-it-back gesture, and it acts on the HAND, not on the ground the plate hides — so
   * the panel must not eat it. An enemy unit sits under every point, so a raid that leaked through
   * the put-back would show as a RAID_TARGET.
   */
  it.each(Object.entries(POINTS))('a held tower + RMB at %s: put back, nothing raided, nothing built', (_name, p) => {
    const r = rig();
    enemyGoblinAt(r, p);
    r.castle.armed = STAMPED;
    clearLogs(r);
    click(r.c, p, 2);
    expect(r.castle.armed, 'the tower is put back').toBeNull();
    expect(boardActions(r), 'and no RAID_TARGET / build / card reached the board').toEqual([]);
    expect(r.picks, 'a right-click makes no pick').toEqual([]);
  });

  it.each(Object.entries(POINTS))('POWER OF RA aimed + RMB at %s: put away, nothing raided', (_name, p) => {
    const r = rig({ ra: true });
    enemyGoblinAt(r, p);
    const b = r.band.getUiPoints().ra;
    expect(b, 'the seat holds Ra, so its button is drawn').not.toBeNull();
    click(r.c, centre(b!));
    expect(raAimPreview(), 'aiming').not.toBeNull();
    clearLogs(r);
    click(r.c, p, 2);
    expect(raAimPreview(), 'the aim is put away').toBeNull();
    expect(boardActions(r)).toEqual([]);
  });

  it('with nothing in hand an RMB on the plate is still swallowed (the raid scenario above), and LMB still keeps the tower', () => {
    const r = rig();
    const p = POINTS['the left side margin']!;
    enemyGoblinAt(r, p);
    click(r.c, p, 2);
    expect(boardActions(r), 'no raid through the plate').toEqual([]);
    r.castle.armed = STAMPED;
    click(r.c, p);
    expect(r.castle.armed, 'LMB is swallowed, not a put-back').toBe(STAMPED);
  });
});

describe('⛔ S190 (audit IL-1) — a control HIDDEN under the plate promises nothing: no pointer, no highlight', () => {
  /*
   * A character-card control straddling the plate's LEFT edge. `onDown` swallows every click on the
   * plate, so the half under it must read plain and must not light up, while the half outside it is
   * a live control. Driven through the real `Controls.onMove` and the real drawn panel.
   */
  const inside = POINTS['the left side margin']!;
  const outside = { x: PANEL_X - PAD / 2, y: MID_Y };
  const onControl = (p: Pt): boolean => p.x >= PANEL_X - PAD && p.x <= PANEL_X + PAD && Math.abs(p.y - MID_Y) <= 20;

  function sheetWithControlAcrossTheEdge(kind: 'button' | 'owned row', hovers: Pt[]): CharacterSheetLike {
    const hit = (x: number, y: number): boolean => onControl({ x, y });
    return {
      ...sheetStub([]),
      isOverAnyAction: (x, y) => kind === 'button' && hit(x, y),
      ownedRowAt: (x, y) => (kind === 'owned row' && hit(x, y) ? ({ kind: 'castle', seat: asPlayerId(0) } as SheetSelectable) : null),
      setHover(x, y) { hovers.push({ x, y }); },
    };
  }

  for (const kind of ['button', 'owned row'] as const) {
    it(`a card ${kind} under the plate reads plain and does not lift; just outside the plate it is a control`, () => {
      const r = rig();
      const hovers: Pt[] = [];
      r.c.setCharacterSheet(sheetWithControlAcrossTheEdge(kind, hovers));
      // Anti-vacuity: both points are on the control; only one is under the plate.
      expect(onControl(inside) && onControl(outside)).toBe(true);
      expect(r.overlay.isOver(inside.x, inside.y), 'inside is under the plate').toBe(true);
      expect(r.overlay.isOver(outside.x, outside.y), 'outside is not').toBe(false);

      move(r.c, outside);
      expect(r.canvas.style.cursor, 'off the plate the control is live').toBe('pointer');
      expect(hovers.at(-1), 'and its highlight is fed the cursor').toEqual(outside);

      move(r.c, inside);
      expect(r.canvas.style.cursor, 'under the plate the click is swallowed, so no pointer').toBe('');
      expect(onControl(hovers.at(-1)!), 'and nothing hidden lifts').toBe(false);
    });

    it(`closed, the same ${kind} is a control on both sides of where the plate was`, () => {
      const r = rig({ open: false });
      const hovers: Pt[] = [];
      r.c.setCharacterSheet(sheetWithControlAcrossTheEdge(kind, hovers));
      for (const p of [outside, inside]) {
        move(r.c, p);
        expect(r.canvas.style.cursor).toBe('pointer');
        expect(hovers.at(-1)).toEqual(p);
      }
    });
  }

  it('a live tile over a hidden card button is still a pointer — the tile\'s', () => {
    const r = rig();
    const hovers: Pt[] = [];
    r.c.setCharacterSheet({ ...sheetStub([]), isOverAnyAction: () => true, setHover(x, y) { hovers.push({ x, y }); } });
    move(r.c, centre(G));
    expect(r.canvas.style.cursor).toBe('pointer');
    expect(hovers.at(-1), 'the card under the tile still does not lift').toEqual({ x: -1, y: -1 });
  });
});
