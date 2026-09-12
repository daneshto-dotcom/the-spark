/**
 * SPARK — S173 B1: THE LOBBY BACKDROP IS PARTITIONED BY SEAT, EXACTLY LIKE THE BOARD.
 *
 * > Owner, after a live 2-player internet playtest: *"the multiplayer lobby only shows player one
 * > background. This doesn't show player two or any other player's background. However many people
 * > are in the lobby has to split the background into the zones or quadrants just like the game
 * > has. So if there's just two players, you will have player one's side and player two's side with
 * > his class, whatever background he chose. And then if there's more joining, then it splits into
 * > four. Right? Up to four."*
 *
 * ⭐ THE DIAGNOSIS, AND IT IS NOT A MISSING FEATURE — IT IS THE BOARD'S RENDERER SEEN THROUGH A
 * LOBBY. `ZoneBackgroundRenderer.sync` early-returns on `TITLE` and on nothing else, so in `LOBBY`
 * it runs its ordinary loop over `world.players` — and in the lobby `world.players` holds exactly
 * ONE entry. `createWorld` seats P1 and no one else (`state/world.ts`), and peers are not seated
 * until Begin mints the dense roster (`net/lobbyRoster.ts` → `buildMatchRoster`). On the default
 * `PITCH_2P` board that one seat owns zone 0, i.e. the LEFT HALF of the canvas. "Only player one's
 * background", precisely as reported, with the right half black.
 *
 * ⛔ SO THE LOBBY ROSTER IS THE ONLY THING THAT KNOWS, AND THIS FILE DRAWS FROM IT. Occupancy and
 * each seat's chosen race live in the presence roster the host broadcasts, projected by
 * `lobbyView` into `SeatView[]`; none of it reaches `world` until the match starts. This renderer
 * therefore reads `SeatView[]` and touches `world` not at all — which is also why it can be a
 * child of the lobby screen rather than another board layer.
 *
 * ⭐ THE SEAT→REGION MAPPING IS THE BOARD'S OWN, REUSED RATHER THAN RE-DERIVED. `layoutForSeatCount`
 * picks the board (≤2 seats = the pitch, 3-4 = the quadrants), `zoneOwner` picks the zone and
 * `zoneRect` picks the rectangle — the same three calls `ZoneBackgroundRenderer` makes. A second,
 * independent notion of "which quadrant is seat N" would drift, and `zoneRect`'s own docblock
 * already warns that getting the clock order wrong "looks like an art bug and is a mapping bug".
 *
 * ⚠ AND IT IS THE **DENSE** SEAT, NOT THE RACK SEAT. Lobby seats are STABLE and may hold a HOLE (a
 * departed peer leaves its cell empty — `lobbyRoster.ts` says so at length), while `buildMatchRoster`
 * COMPACTS to contiguous seats 0..N-1 at Begin and `world.layout` is then stamped from
 * `world.players.size`. Mirroring the rack index instead would put a player's lobby side on the
 * opposite side of the board he actually plays — so the region for the i-th occupied seat, in
 * ascending rack order, is the region of board seat i. That is the same compaction, applied to the
 * same ordering, so the preview matches Begin for exactly as long as `buildMatchRoster` does.
 */
import { Assets, Container, Graphics, Sprite, Texture, Ticker } from 'pixi.js';

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import { layoutForSeatCount, zoneOwner } from '../state/zones.ts';
import type { RaceId } from '../state/races.ts';
import { isZoneBackgroundEnabled } from './displayPrefs.ts';
import type { SeatView } from './lobbyStateMachine.ts';
// ⚠ READ-ONLY IMPORT. `zoneRect` is the board's rectangle, exported in S170 P6 for exactly this
// kind of second consumer; nothing here writes to or through the board renderer.
import { zoneRect } from './zoneBackgroundRenderer.ts';

/**
 * How strongly the lobby backdrop shows through.
 *
 * ⚠ THIS NUMBER IS MINE, and it is deliberately the same 0.55 the board uses (`ZONE_BG_ALPHA` in
 * `zoneBackgroundRenderer.ts`): the lobby is a PREVIEW of the ground you are about to play on, and
 * a preview that is brighter than the thing it previews is a small lie. It is a separate constant
 * rather than an import because the two surfaces carry different content — 48px title text, two
 * panes and a seat rack sit over this one — so if either ever needs to move it must move alone.
 */
const LOBBY_BG_ALPHA = 0.55;

/**
 * ⛔ THE OPAQUE BACKING IS LOAD-BEARING, NOT DECORATION. Two things sit under it and both must be
 * hidden, or the fix reproduces the bug it is fixing:
 *
 *   · the board's own `ZoneBackgroundRenderer`, still painting seat 0's half on `groundLayer`
 *     underneath the lobby (that IS the reported defect);
 *   · the empty quadrant of a 3-player split, which must read as the cosmos black the board's
 *     unowned ground reads as — see `lobbyBackdropRegions`.
 *
 * Without it a 0.55-alpha region would COMPOSITE over the stale half rather than replace it, which
 * is worse than the bug: two race worlds blended into one.
 *
 * ⚠ SAFE ONLY BECAUSE OF ONE FACT — CHECK IT BEFORE MOVING THIS. The connection-lost overlay is a
 * STAGE SIBLING mounted BELOW the lobby container (`connectionLostOverlay.ts` adds itself to
 * `app.stage` while `LobbyScreen`'s own `addChild` runs later in the same constructor), so an
 * opaque full-canvas fill inside the lobby would cover it. It cannot today, because that overlay is
 * only ever shown while `gameState === 'PLAYING'` (main.ts's `peersGone` / `zombieDeposed` gates),
 * where the lobby container is hidden outright. If either fact changes, this fill covers it.
 */
const BACKING_COLOR = 0x000000;

/** Which of the two shipped art variants fits a rectangle. See `orientationFor`. */
export type ZoneArtOrientation = 'portrait' | 'landscape';

/** One seat's slice of the lobby backdrop. Pure data — no Pixi, no textures. */
export interface LobbyRegion {
  /** The seat's STABLE rack index, i.e. which cell in the seat rack this is. */
  readonly seat: number;
  /**
   * The seat it will actually PLAY as once Begin compacts the roster, and therefore the board zone
   * this region mirrors. Equal to `seat` in every lobby with no hole in it.
   */
  readonly boardSeat: number;
  /**
   * ⚠ `null` MEANS COSMOS BLACK, AND IT IS UNREACHABLE TODAY — deliberately kept as the fail-closed
   * arm rather than invented away. A seat that has joined but never opened the race picker is NOT
   * this case: `lobbyView` resolves a roster entry with no `raceId` to `defaultRaceForSeat`, and the
   * count-based fallback does the same, so an occupied seat always carries the race it will really
   * play. `null` would only arise if that projection ever stopped defaulting, and the right answer
   * then is an empty region — never a guessed race, which is how "player one's background" got
   * painted over everybody in the first place.
   */
  readonly raceId: RaceId | null;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Derived from the RECT, never from the layout name — see `orientationFor`. */
  readonly orientation: ZoneArtOrientation;
}

/**
 * Which art variant fits a rectangle.
 *
 * ⭐ KEYED ON THE RECT AND NOT ON THE LAYOUT, which is the one place this file cannot simply copy
 * `zoneBackgroundRenderer`'s `zoneArtUrl` (that one keys on `ZoneLayout`). Both agree for every
 * real board zone — `PITCH_2P` zones are 960x1080 (portrait → `-2p`) and `QUADRANTS_4P` zones are
 * 960x540 (landscape → `-4p`), and `lobbyBackdrop.test.ts` pins that equivalence — but the
 * one-seat lobby paints the WHOLE 1920x1080 canvas, which has no board analogue and is landscape.
 */
export function orientationFor(w: number, h: number): ZoneArtOrientation {
  return w < h ? 'portrait' : 'landscape';
}

/**
 * Where a race's zone art lives. Same twelve files the board loads (S165), so a lobby and the match
 * that follows it share one decoded texture per race rather than two.
 */
export function lobbyZoneArtUrl(race: RaceId, orientation: ZoneArtOrientation): string {
  return `/art/race-zones/zone-${race}-${orientation === 'portrait' ? '2p' : '4p'}.png`;
}

/**
 * ⭐ THE WHOLE ANSWER TO B1: seat count → one rectangle per occupied seat.
 *
 * 1 seat  → the whole canvas.  2 seats → two halves.  3-4 seats → quadrants.
 *
 * ⚠ THE ONE-SEAT CASE IS THE ONE DELIBERATE DIVERGENCE FROM THE BOARD, and it is divergence from
 * nothing real: `layoutForSeatCount(1)` is `PITCH_2P`, whose zone 0 is the LEFT HALF — which is the
 * exact half-black screen the owner reported. A one-seat lobby can never become a match either
 * (`beginVisible` latches only on `peerCount > 0`), so there is no board for it to be consistent
 * with, and filling the canvas is also what makes the split legible: the moment a second player
 * arrives the screen visibly halves.
 *
 * ⚠ WITH 3 PLAYERS THE FOURTH QUADRANT IS SIMPLY ABSENT FROM THE RESULT, and the renderer leaves it
 * the backing's cosmos black. That is not a placeholder — it is what the BOARD does: R2 says there
 * is no 3-player map, three seats play `QUADRANTS_4P` with one quadrant empty, and
 * `ZoneBackgroundRenderer` paints no backdrop on ground nobody owns. Bottom-LEFT is the quadrant
 * that stays empty, because the dense seats 0/1/2 take the clock-order zones TL/TR/BR.
 *
 * ⚠ NO SEATS AT ALL → NO REGIONS, which is the SELECT screen (`lobbyView` reports every seat
 * unoccupied outside a room). With no roster there is no seat to partition by, and inventing one is
 * how a single seat's world ended up standing in for everybody's.
 *
 * PURE. No Pixi, no textures, no `world` — which is what lets `lobbyBackdrop.test.ts` assert the
 * tiling, the board agreement and the 3-player hole without a GPU.
 */
export function lobbyBackdropRegions(seats: readonly SeatView[]): readonly LobbyRegion[] {
  // `filter` copies, so the sort cannot reach the caller's array. Ascending rack order is what the
  // dense compaction below is defined against (`buildMatchRoster` sorts stable seats ascending).
  const occupied = seats.filter((s) => s.occupied).sort((a, b) => a.index - b.index);
  const n = occupied.length;
  if (n === 0) return [];

  if (n === 1) {
    const only = occupied[0]!;
    return [
      {
        seat: only.index,
        boardSeat: 0,
        raceId: only.raceId ?? null,
        x: 0,
        y: 0,
        w: CANVAS_WIDTH,
        h: CANVAS_HEIGHT,
        orientation: orientationFor(CANVAS_WIDTH, CANVAS_HEIGHT),
      },
    ];
  }

  const layout = layoutForSeatCount(n);
  const out: LobbyRegion[] = [];
  for (let dense = 0; dense < n; dense++) {
    const s = occupied[dense]!;
    const zone = zoneOwner(dense, layout);
    // ⚠ NOT DEAD CODE, and not to be "simplified" into a modulo for the same reason `zones.ts`
    // refuses one: a seat with no ground owns no region. Unreachable while MAX_PLAYERS (4) is
    // within `MAX_SEATS_WITH_GROUND` (4), which `zones.test.ts` pins; a roster that ever overflowed
    // would drop the surplus region rather than paint it over somebody else's.
    if (zone === null) continue;
    const r = zoneRect(zone, layout);
    out.push({
      seat: s.index,
      boardSeat: dense,
      raceId: s.raceId ?? null,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      orientation: orientationFor(r.w, r.h),
    });
  }
  return out;
}

/**
 * COVER-fit a texture into a region — scale by the LARGER ratio and centre the overflow, the exact
 * placement `ZoneBackgroundRenderer.sync` uses, so the lobby and the board frame the same art the
 * same way.
 *
 * ⭐ THE SHIPPED ART OVERFLOWS BY ZERO, MEASURED: `zone-*-2p.png` is 480x540 (8:9) into a 960x1080
 * zone (8:9), and `zone-*-4p.png` is 480x270 (16:9) into a 960x540 zone AND into the 1920x1080
 * one-seat canvas (16:9). Every case scales uniformly, so nothing spills across a seam and no mask
 * is needed — which matters, because a per-frame stencil over this canvas is what cost the board
 * renderer a whole CI lane in S166. Art regenerated at a different aspect would bleed here exactly
 * as it would bleed on the board; that is the same behaviour on purpose, not an oversight.
 */
export function coverFit(
  texW: number,
  texH: number,
  r: { x: number; y: number; w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  const scale = Math.max(r.w / texW, r.h / texH);
  const w = texW * scale;
  const h = texH * scale;
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}

/**
 * ⭐ LAZY, CACHED, PER URL — the same guard `seatRack`'s banners and `GathererRenderer`'s castle
 * atlas use, for the same reason: `update` runs on every presence beacon and must not queue a fresh
 * fetch each time before the first one resolves. A FAILED url is remembered separately so the
 * ticker's re-projection poll below terminates instead of retrying forever.
 *
 * ⚠ NO HOLD TICKS, unlike the board. `ZONE_BG_HOLD_TICKS` exists because a texture decode landing
 * inside match boot starved the sim on a software-GL runner; a lobby has no sim to starve and the
 * player is sitting still reading a room code, so the art loads immediately. It is also the SAME
 * url the match will ask for moments later, so this is a pre-warm rather than an extra cost.
 */
const texCache = new Map<string, Texture>();
const texStarted = new Set<string>();
const texFailed = new Set<string>();

function backdropTexture(url: string): Texture | null {
  const hit = texCache.get(url);
  if (hit !== undefined) return hit;
  if (!texStarted.has(url)) {
    texStarted.add(url);
    void Assets.load(url)
      .then((t: Texture) => texCache.set(url, t))
      // A missing backdrop is cosmetic by design: that region stays the black the lobby has always
      // been. Recorded as FAILED so the poll below stops asking.
      .catch(() => texFailed.add(url));
  }
  return null;
}

export interface LobbyBackdropHandle {
  readonly container: Container;
  /** Apply a `SeatView[]` projection (the same one the seat rack receives). */
  update(seats: readonly SeatView[]): void;
}

/**
 * Build the lobby's partitioned backdrop.
 *
 * `isShown` is the lobby screen's own visibility, and it gates the per-frame poll below so a hidden
 * lobby costs nothing at all.
 */
export function makeLobbyBackdrop(isShown: () => boolean): LobbyBackdropHandle {
  const container = new Container();
  // Hidden until the first `update` — the lobby can be shown before any transition has run.
  container.visible = false;

  const backing = new Graphics();
  backing.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill(BACKING_COLOR);
  container.addChild(backing);

  /*
   * The region sprites live one level down so the backing can never be reordered into the middle of
   * them. One container, one job — the same split `zoneBackgroundRenderer` keeps for its sprite host.
   */
  const spriteHost = new Container();
  container.addChild(spriteHost);

  const sprites: Sprite[] = [];
  let lastSeats: readonly SeatView[] | null = null;
  let lastEnabled = isZoneBackgroundEnabled();
  /** True while some region asked for a texture that has neither arrived nor failed. */
  let awaitingTexture = false;

  function update(seats: readonly SeatView[]): void {
    lastSeats = seats;
    /*
     * ⚠ THE DISPLAY TOGGLE GOVERNS THE LOBBY TOO. A player who chose the cosmos-black board and then
     * met race art in the lobby would have been told his setting does not mean what it says — and
     * `settings-toggles.spec.ts` asserts that with the toggle off the browser never even ASKS for a
     * backdrop, which is a claim about the whole app, not about one renderer.
     */
    lastEnabled = isZoneBackgroundEnabled();
    const regions = lastEnabled ? lobbyBackdropRegions(seats) : [];
    container.visible = regions.length > 0;
    awaitingTexture = false;

    while (sprites.length < regions.length) {
      const sp = new Sprite();
      sp.alpha = LOBBY_BG_ALPHA;
      spriteHost.addChild(sp);
      sprites.push(sp);
    }

    for (let i = 0; i < sprites.length; i++) {
      const sp = sprites[i]!;
      const r = regions[i];
      if (r === undefined || r.raceId === null) {
        sp.visible = false;
        continue;
      }
      const url = lobbyZoneArtUrl(r.raceId, r.orientation);
      const tex = backdropTexture(url);
      if (tex === null) {
        // Still loading (or gone for good) — that region stays cosmos black meanwhile.
        sp.visible = false;
        if (!texFailed.has(url)) awaitingTexture = true;
        continue;
      }
      sp.texture = tex;
      sp.visible = true;
      const fit = coverFit(tex.width, tex.height, r);
      sp.width = fit.w;
      sp.height = fit.h;
      sp.x = fit.x;
      sp.y = fit.y;
    }
  }

  /*
   * ⭐ ADOPT A TEXTURE THAT ARRIVED AFTER THE LAST `update()`, AND NOTICE A TOGGLE FLIPPED WHILE THE
   * LOBBY IS UP. `update` runs only on a lobby STATE change — a join, a leave, a race pick — while
   * `backdropTexture` returns null on its first call and resolves milliseconds later. A host sitting
   * alone in a fresh room produces no further state change, so without this poll the texture would
   * land in the cache and nothing would ever apply it: exactly the bug `seatRack`'s own ticker note
   * records catching for the race banners.
   *
   * Gated on `isShown()`, so a hidden lobby does no work and reads no `localStorage`.
   */
  Ticker.shared.add(() => {
    if (lastSeats === null || !isShown()) return;
    if (awaitingTexture || isZoneBackgroundEnabled() !== lastEnabled) update(lastSeats);
  });

  return { container, update };
}
