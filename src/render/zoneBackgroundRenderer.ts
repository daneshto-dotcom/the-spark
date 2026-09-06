/**
 * SPARK — PER-RACE ZONE BACKGROUNDS (S165, owner brief 2026-09-03 + ruling R137).
 *
 * Each seat's quarter of the board is painted in its race's world instead of deep black space:
 * zombies a rotting swamp, orcs a badlands war-camp, demons hell, nagas a drowned military citadel,
 * mummies a desert necropolis, vampires a Carpathian valley.
 *
 * ⭐ TWELVE IMAGES, NOT SIX, AND THE REASON IS GEOMETRIC (R137). Measured against `zones.ts`:
 * `PITCH_2P` splits the canvas on ONE VERTICAL line, so a zone is 960x1080 — PORTRAIT.
 * `QUADRANTS_4P` splits on a CROSS, so a zone is 960x540 — LANDSCAPE. One image cannot serve both:
 * stretched it distorts, letterboxed it leaves dead ground, cropped it loses the composition. The
 * castle anchor also sits in the GOALMOUTH on one board and the OUTER CORNER on the other, so the
 * focal point belongs in a different part of the frame per board.
 *
 * ⛔ IT DRAWS BEHIND EVERYTHING AND IT STAYS QUIET. The owner's requirement is that the art be
 * *"partially transparent so towers, structures, connectors and creatures stay readable"*. Two
 * halves make that true and BOTH are needed:
 *   · the ART is dark and low-contrast by construction — measured at generation, mean max-channel
 *     22–41 out of 255 with ZERO pixels above 200 across all twelve;
 *   · this renderer draws it at `ZONE_BG_ALPHA` into the FIRST layer added to the stage, so every
 *     spark, bond, structure and creature paints on top of it.
 *
 * ⚠ TOGGLEABLE, because the owner asked for it: `setEnabled(false)` restores the plain black board.
 * Kept as renderer state rather than world state on purpose — this is a display preference, it must
 * never reach the wire or the hash, and two peers may legitimately disagree about it.
 *
 * ⭐ LAZY, PER RACE. The twelve backgrounds are ~11 MB on disk. A 1v1 match needs TWO of them and a
 * 4-player match four, so loading all twelve would spend most of that budget on races nobody is
 * playing — the same reasoning `gathererRenderer` and the race-unit atlas loader already follow.
 *
 * ⚠ RENDER-ONLY. It reads `world.layout` and each player's `raceId`, both already synced, and writes
 * nothing. No new wire field, no protocol bump.
 */
import { Application, Assets, Container, Sprite, Texture } from 'pixi.js';

import type { World } from '../state/world.ts';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants.ts';
import { zoneOwner, type ZoneLayout } from '../state/zones.ts';
import { defaultRaceForSeat, isRaceId, type RaceId } from '../state/races.ts';

/**
 * How strongly the backdrop shows through.
 *
 * ⚠ THIS NUMBER IS MINE, NOT THE OWNER'S. The art is already dark enough that 1.0 would not blow
 * out gameplay, but the brief asks for *partially* transparent and a backdrop that competes for
 * attention is worse than none. 0.55 keeps each race's world legible as a place while leaving the
 * board unmistakably a board. It is one constant and it is cheap to overrule on sight.
 */
const ZONE_BG_ALPHA = 0.55;

/** Where a race's zone art lives, per board. `-4p` is landscape, `-2p` portrait — see R137. */
function zoneArtUrl(race: RaceId, layout: ZoneLayout): string {
  return `/art/race-zones/zone-${race}-${layout === 'PITCH_2P' ? '2p' : '4p'}.png`;
}

/**
 * The rectangle a zone index occupies.
 *
 * ⚠ DERIVED FROM THE SAME SPLIT LINES `zones.ts` USES, and deliberately not imported from it —
 * `zones.ts` exports predicates (`zoneOf`, `zoneOwner`) rather than rects, and adding a render-only
 * geometry helper to a SIM module would put a display concern inside the hashed layer. The split is
 * dead centre on both boards, which is the one fact both files depend on.
 *
 * ⛔ CLOCK ORDER on QUADRANTS_4P, matching `zoneOf`: 0 = top-left, 1 = top-right, 2 = bottom-right,
 * 3 = bottom-left. Getting this wrong paints a seat's world over its neighbour's ground, which is
 * exactly the kind of thing that looks like an art bug and is a mapping bug.
 */
function zoneRect(
  zone: number,
  layout: ZoneLayout,
): { x: number; y: number; w: number; h: number } {
  const hx = CANVAS_WIDTH / 2;
  const hy = CANVAS_HEIGHT / 2;
  if (layout === 'PITCH_2P') {
    return { x: zone === 0 ? 0 : hx, y: 0, w: hx, h: CANVAS_HEIGHT };
  }
  const left = zone === 0 || zone === 3;
  const top = zone === 0 || zone === 1;
  return { x: left ? 0 : hx, y: top ? 0 : hy, w: hx, h: hy };
}

export class ZoneBackgroundRenderer {
  private readonly layer: Container;
  private readonly sprites: Map<number, Sprite> = new Map();
  private readonly textures: Map<string, Texture> = new Map();
  private readonly loadStarted: Set<string> = new Set();
  private enabled = true;

  constructor(app: Application, parent: Container = app.stage) {
    this.layer = new Container();
    /*
     * ⛔ AT INDEX 0 OF `aboveFogLayer`, NOT OF THE STAGE — and the first cut got this wrong in a way
     * only a real frame could show.
     *
     * Putting it at the bottom of the STAGE looked obviously right and rendered a black board in
     * every multiplayer match. `fogRenderer` paints unexplored ground in `FOG_COLOR = 0x000000`
     * (pure black, chosen so fog reads as darkness rather than a tint), and it sits ABOVE the board
     * layers — so the backdrop was drawn, then painted over. It was visible only on the TITLE screen,
     * where there is no fog, which is exactly the sort of half-working that a green suite calls
     * success.
     *
     * ⭐ ABOVE THE FOG IS ALSO THE CORRECT ANSWER, not merely the one that shows. Which race owns
     * which quarter is already public — the castle art and the leaderboard both say so — and terrain
     * is static, so it reveals nothing about what an opponent is DOING. Fog exists to hide activity,
     * not geography.
     *
     * At index 0 of that layer so every structure, creature and effect on it still paints on top.
     */
    parent.addChildAt(this.layer, 0);
    void app;
  }

  /** Owner-facing toggle: `false` restores the plain black board. Display-only, never synced. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.layer.visible = on;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private ensureTexture(url: string): void {
    if (this.loadStarted.has(url)) return;
    this.loadStarted.add(url);
    void (async () => {
      try {
        this.textures.set(url, (await Assets.load(url)) as Texture);
      } catch {
        // Deliberately silent, and the failure mode is benign by design: with no texture the zone
        // simply stays the black board it has always been. A backdrop is the one thing in this
        // renderer stack whose absence costs the player nothing.
      }
    })();
  }

  sync(world: World): void {
    if (!this.enabled) return;
    /*
     * ⛔ NOT ON THE TITLE SCREEN. Seat 0 exists before a match starts, so without this the menu got
     * half a Carpathian valley behind it — caught by looking at the running app, not by any test.
     * WIN and POSTGAME deliberately still draw: the ceremony happens on the board the match was
     * played on, and blanking it mid-ceremony would read as a bug.
     */
    if (world.gameState === 'TITLE') {
      this.layer.visible = false;
      return;
    }
    this.layer.visible = true;
    const layout = world.layout;

    for (const [playerId, player] of world.players) {
      const seat = playerId as unknown as number;
      const zone = zoneOwner(seat, layout);
      // ⚠ `null` is NOT dead code: a seat can own no ground on a given board (`zones.ts` says so in
      // as many words, and warns against "simplifying" it into a modulo).
      if (zone === null) continue;

      const race: RaceId = isRaceId(player.raceId) ? player.raceId : defaultRaceForSeat(seat);
      const url = zoneArtUrl(race, layout);
      this.ensureTexture(url);
      const tex = this.textures.get(url);
      if (tex === undefined) continue; // still loading — the black board shows meanwhile

      let sp = this.sprites.get(zone);
      if (sp === undefined) {
        sp = new Sprite(tex);
        sp.alpha = ZONE_BG_ALPHA;
        this.layer.addChild(sp);
        this.sprites.set(zone, sp);
      } else if (sp.texture !== tex) {
        // A seat can change race in the lobby, and a rematch can change the board.
        sp.texture = tex;
      }

      const r = zoneRect(zone, layout);
      /*
       * COVER, not stretch. The generated aspect never matches the zone exactly — 3:4 is the
       * nearest portrait the generator offers to the true 8:9 — so fitting would letterbox and
       * stretching would distort a horizon. Scale by the LARGER ratio and let the overflow clip.
       */
      const scale = Math.max(r.w / tex.width, r.h / tex.height);
      sp.width = tex.width * scale;
      sp.height = tex.height * scale;
      sp.x = r.x + (r.w - sp.width) / 2;
      sp.y = r.y + (r.h - sp.height) / 2;
    }

    // Drop any zone that no longer has an owner (a seat left, or the board shrank on rematch).
    for (const [zone, sp] of [...this.sprites]) {
      const stillOwned = [...world.players.keys()].some(
        (pid) => zoneOwner(pid as unknown as number, layout) === zone,
      );
      if (!stillOwned) {
        sp.destroy();
        this.sprites.delete(zone);
      }
    }
  }
}
