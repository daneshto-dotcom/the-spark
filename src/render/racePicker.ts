/**
 * SPARK — S161 P6: the lobby's RACE / COLOUR PICKER.
 *
 * > Owner, 2026-09-03: *"in multiplayer you should be able to click on your player with its assigned
 * > color (based on lobby log in order) and then there should be a menu where you can chose one of
 * > the other six colors!"* and *"the popup menue should have a color with an artistic background
 * > that shows the race and color."*
 *
 * ⭐ SIX TILES FOR FOUR SEATS, WHICH IS WHY THIS IS A REAL CHOICE. `MAX_PLAYERS` is 4 and there are
 * six races, so two are always unclaimed — the picker is not a rearrangement of who has what, it is
 * a menu with genuine spare options. That also means a "taken" tile is the exception rather than
 * the rule, so it is drawn as a clearly disabled variant rather than hidden (hiding it would make
 * the grid reflow under the player's cursor as other people pick).
 *
 * ⛔ THE "TAKEN" TEST IS THE HOST'S, NOT A LOOKALIKE. The caller passes the set of races already
 * held, derived from the same presence roster the host arbitrates from, and the host re-validates
 * every claim with `raceIsFree` anyway. A picker that offers a race the host then refuses is the
 * "surface says yes, reducer says no" defect `footerBandModel.ts` documents; a picker that greys out
 * a race the host would have allowed is the same defect wearing the other sign.
 *
 * ⚠ COSMETIC AND CLIENT-LOCAL. Clicking a tile SENDS a claim; it does not apply one. The seat rack
 * only changes when the host's LOBBY_PRESENCE beacon comes back, so a refused claim silently
 * corrects itself and the UI never shows a colour the host does not agree with.
 */

import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { ALL_RACES, RACE_COLORS, type RaceId } from '../state/races.ts';
import { RACE_BANNER_SRC, raceDisplayName } from './raceBanners.ts';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';

const TILE_W = 300;
const TILE_H = 132;
const GAP = 22;
const COLS = 3;
const CORNER = 12;
const PANEL_PAD = 30;
const TITLE_H = 54;

const PANEL_W = COLS * TILE_W + (COLS - 1) * GAP + PANEL_PAD * 2;
const ROWS = Math.ceil(ALL_RACES.length / COLS);
const PANEL_H = ROWS * TILE_H + (ROWS - 1) * GAP + PANEL_PAD * 2 + TITLE_H;

/** PURE — where tile `i` sits inside the panel. Exported for `racePicker.test.ts`. */
export function raceTileRect(i: number): { x: number; y: number; w: number; h: number } {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  return {
    x: PANEL_PAD + col * (TILE_W + GAP),
    y: PANEL_PAD + TITLE_H + row * (TILE_H + GAP),
    w: TILE_W,
    h: TILE_H,
  };
}

/** PURE — the whole panel's rect on the canvas, centred. Exported for e2e geometry. */
export function racePickerPanelRect(): { x: number; y: number; w: number; h: number } {
  return {
    x: (CANVAS_WIDTH - PANEL_W) / 2,
    y: (CANVAS_HEIGHT - PANEL_H) / 2,
    w: PANEL_W,
    h: PANEL_H,
  };
}

export interface RacePickerHandle {
  readonly container: Container;
  /** Show the menu. `taken` are races held by OTHER players; `current` is this seat's own. */
  open(taken: ReadonlySet<RaceId>, current: RaceId | undefined): void;
  close(): void;
  isOpen(): boolean;
  /** Canvas-space tile centres, for the e2e geometry-getter convention (S85 P4c). */
  tileCenters(): Record<RaceId, { x: number; y: number }>;
}

export function makeRacePicker(onPick: (raceId: RaceId) => void): RacePickerHandle {
  const container = new Container();
  container.label = 'racePicker';
  container.visible = false;
  container.eventMode = 'static';

  // Full-canvas scrim: dims the lobby AND swallows clicks so a stray tap cannot reach the rack
  // behind the menu. Clicking it closes, which is the escape every modal in this game offers.
  const scrim = new Graphics()
    .rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    .fill({ color: 0x000000, alpha: 0.72 });
  scrim.eventMode = 'static';
  scrim.on('pointertap', () => hide());
  container.addChild(scrim);

  const panelRect = racePickerPanelRect();
  const panel = new Container();
  panel.position.set(panelRect.x, panelRect.y);
  // ⚠ The panel must EAT its own clicks, or every tap inside the menu would bubble to the scrim
  // and close it before the tile handler ran.
  panel.eventMode = 'static';
  panel.on('pointertap', (e) => e.stopPropagation());
  container.addChild(panel);

  panel.addChild(
    new Graphics()
      .roundRect(0, 0, PANEL_W, PANEL_H, 18)
      .fill({ color: 0x101014, alpha: 0.98 })
      .stroke({ width: 2, color: 0x3a3a44 }),
  );

  const title = new Text({
    text: 'CHOOSE YOUR RACE',
    style: new TextStyle({
      fontFamily: 'monospace', fontSize: 28, fill: 0xf4f4f4, letterSpacing: 4,
    }),
  });
  title.anchor.set(0.5, 0);
  title.position.set(PANEL_W / 2, PANEL_PAD - 4);
  panel.addChild(title);

  interface Tile {
    readonly root: Container;
    readonly banner: Sprite;
    readonly overlay: Graphics;
    readonly name: Text;
    readonly status: Text;
  }
  const tiles = new Map<RaceId, Tile>();

  ALL_RACES.forEach((raceId, i) => {
    const r = raceTileRect(i);
    const root = new Container();
    root.position.set(r.x, r.y);
    root.eventMode = 'static';
    root.cursor = 'pointer';

    const mask = new Graphics().roundRect(0, 0, r.w, r.h, CORNER).fill(0xffffff);
    const banner = new Sprite();
    banner.width = r.w;
    banner.height = r.h;
    banner.mask = mask;
    root.addChild(banner);
    root.addChild(mask);

    // A wash of the race's own colour over the art, so the tile reads as a COLOUR swatch too — the
    // owner asked for a menu of colours, and the art is what says which colour it is.
    root.addChild(
      new Graphics()
        .roundRect(0, 0, r.w, r.h, CORNER)
        .fill({ color: RACE_COLORS[raceId], alpha: 0.2 }),
    );

    const overlay = new Graphics();
    root.addChild(overlay);

    const name = new Text({
      text: raceDisplayName(raceId),
      style: new TextStyle({
        fontFamily: 'monospace', fontSize: 24, fill: 0xffffff, letterSpacing: 3,
        dropShadow: { color: 0x000000, alpha: 0.95, blur: 5, distance: 2, angle: Math.PI / 2 },
      }),
    });
    name.anchor.set(0.5);
    name.position.set(r.w / 2, r.h / 2 - 8);
    root.addChild(name);

    const status = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 15, fill: 0xd0d0d0, letterSpacing: 2 }),
    });
    status.anchor.set(0.5);
    status.position.set(r.w / 2, r.h / 2 + 22);
    root.addChild(status);

    root.on('pointertap', (e) => {
      e.stopPropagation();
      if (root.eventMode !== 'static') return;
      onPick(raceId);
      hide();
    });

    // Lazy per-race load, cached by Pixi's own Assets registry (a second `load` of the same URL
    // resolves from cache), so opening the picker twice does not refetch.
    void Assets.load(RACE_BANNER_SRC[raceId])
      .then((t: Texture) => { banner.texture = t; })
      .catch(() => { banner.visible = false; }); // the colour wash alone still identifies the tile

    panel.addChild(root);
    tiles.set(raceId, { root, banner, overlay, name, status });
  });

  function hide(): void {
    container.visible = false;
  }

  return {
    container,
    open(taken, current) {
      for (const raceId of ALL_RACES) {
        const t = tiles.get(raceId)!;
        const isMine = raceId === current;
        const isTaken = taken.has(raceId) && !isMine;
        t.overlay.clear();
        if (isTaken) {
          t.overlay
            .roundRect(0, 0, TILE_W, TILE_H, CORNER)
            .fill({ color: 0x000000, alpha: 0.66 })
            .stroke({ width: 2, color: 0x555560 });
        } else {
          t.overlay
            .roundRect(0, 0, TILE_W, TILE_H, CORNER)
            .stroke({ width: isMine ? 5 : 2, color: isMine ? 0xffffff : 0x8a8a96, alpha: isMine ? 0.95 : 0.8 });
        }
        t.status.text = isMine ? 'YOURS' : isTaken ? 'TAKEN' : '';
        t.name.alpha = isTaken ? 0.45 : 1;
        // ⛔ A taken tile is INERT, not merely dim: `eventMode` is the click gate, and leaving it
        // clickable would send the host a claim it is guaranteed to refuse.
        t.root.eventMode = isTaken ? 'none' : 'static';
        t.root.cursor = isTaken ? 'default' : 'pointer';
      }
      container.visible = true;
    },
    close: hide,
    isOpen: () => container.visible,
    tileCenters() {
      const out = {} as Record<RaceId, { x: number; y: number }>;
      ALL_RACES.forEach((raceId, i) => {
        const r = raceTileRect(i);
        out[raceId] = { x: panelRect.x + r.x + r.w / 2, y: panelRect.y + r.y + r.h / 2 };
      });
      return out;
    },
  };
}
