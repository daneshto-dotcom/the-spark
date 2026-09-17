/**
 * SPARK — S175 P4a: THE VOLTKIN TV IS A BUILDING NOW, NOT A BARE CHAIN OF SHAPES.
 *
 * Owner, S175: *"for now it's just fucking connectors of, what is it, four squares and then four
 * triangle. It looks stupid. It should be like that, but then the tower happens, you know, the whole
 * video game and him emerging, blah blah blah — make it look sick."* And on the direction:
 * *"we're redoing the whole way that Voltkin is coming out of the TV. It's gonna be in game. It's
 * gonna be like the tower is being built … kind of like when bosses come out. But even cooler."*
 *
 * ⛔ **WHY THIS IS ITS OWN RENDERER AND NOT A BRANCH IN `towerRenderer`.** Phase A.0's decisive
 * finding: `voltkin` is the ONLY `kind: 'cinematic'` recipe in the registry. It registers no spawner
 * and no defender, and `world.currentCinematicEvent.targetComponentPrimitiveIds` — the only record
 * that a chain ever existed — is cleared on `GODLY_COMPLETE`. `towerRenderer.sync` iterates
 * `world.creatureSpawners` and would never see a Voltkin, and `towerArtForRecipe` requires a
 * `RaceId` and a `tier: 3 | 9` that a race-agnostic TV does not have. Widening either to fit would
 * ripple into `destroyAtlasBase` and both row tables for one structure.
 *
 * ⭐ **SO THE CHAIN IS RE-DERIVED EVERY FRAME FROM SYNCED STATE, WHICH COSTS NOTHING AND SYNCS FREE.**
 * `findAllVoltkinChains` walks `world.primitives` and `world.bonds` — both REQUIRED, fully-serialized
 * wire fields — so every peer computes the identical set. No sim change, no snapshot bytes, no new
 * `GameEffect`, and **PROTOCOL_VERSION stays 46**. It is the same reasoning `towerCover` rests on:
 * a structure's identity in this game is topology, and topology is already on the wire.
 *
 * ⭐ **AND IT PHASES THE SHAPES OUT, WHICH IS THE HALF HE ACTUALLY COMPLAINED ABOUT.** Drawing a TV
 * over the chain while leaving eight bright primitives and seven connectors on top of it would not
 * fix *"it looks stupid"*. This renderer calls `markTowerCover`, so the shapes underneath phase out
 * exactly as they do under a race tower, and phase back in when the chain breaks.
 *
 * ⚠ **SIX ROWS, THREE DAMAGE STATES — AND THE DISTINCTION IS THE WHOLE DESIGN.** His art is a
 * six-panel sequence and S176 P2 packs all six, but the engine's `TowerState` is STILL three-valued
 * (intact/damaged/destroyed) and widening it would still break `tsc` across both row tables. Only
 * those three are reachable from `towerStateForHp`: intact ← tv-1, damaged ← tv-3-burning (his own
 * "the state it wears most of the match"), destroyed ← tv-6-ruins. The spawn, critical and explosion
 * rows are BEATS this renderer sequences itself — frame-driven, the `TOWER_CRUMBLE_FRAMES` shape —
 * and are deliberately not damage states. ⛔ A future session must not "complete" the mapping by
 * adding them to `TowerState`; there is nothing to complete.
 */
import { Application, Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { World } from '../state/world.ts';
import type { BondId, PrimitiveId } from '../types.ts';
import { findAllVoltkinChains } from '../state/godlyRecipes/voltkin.ts';
import { isConcealed } from './concealment.ts';
import { markTowerCover } from './towerCover.ts';
import { TOWER_SPRITE_ANCHOR, towerHpFrac, towerStateForHp } from './towerFrames.ts';

const ATLAS_BASE = '/art/voltkin-tv/voltkin-tv';

/**
 * On-screen size, px.
 *
 * ⚠ THE NUMBER IS MINE, and it is derived rather than picked: the owner's own turnaround sheet
 * labels the TV **~4.5 m**, against a tier-9 boss tower's 150 px sprite on a nine-node ring. The
 * Voltkin chain is eight primitives in a line rather than a ring, so it is physically wider and a
 * taller sprite would swamp it. 132 px sits between the tier-3 84 and the tier-9 150, which matches
 * a structure that costs seven connectors. Overrule it against the live board.
 */
/**
 * ⭐ S177 P4 — **RAISED 132 → 215 TO HOLD THE TV AT ITS SHIPPED ON-SCREEN SIZE.**
 *
 * ⚠ THIS IS ARITHMETIC, NOT TASTE, and the measurement is here so nobody re-tunes it by eye. The
 * packer fits ONE union bbox across every frame of every row, and the destruction clip's blast is far
 * wider than the TV. Packing the two clips took that bbox from 724×633 to 1181×671, so the fitted
 * cell content went 240×210 → 240×136 — the sheet is 1181/724 = 1.63× wider than it was, and every
 * row shrank by that factor, the static `intact` TV included.
 *
 * 132 × 1.63 = 215, which restores the set to the size the owner has already seen and approved
 * (*"the TV, it kinda looks good standing there"*). The blast is now proportionally larger than the
 * cabinet, which is what an explosion should be.
 */
/*
 * ⭐⭐⭐ S178 (owner) — **AND THE OTHER HALF OF "NOT DONE" IS THAT IT DRAWS AT 61 px.**
 *
 * Owner, S178: *"Now it looks tiny … See how small it is compared to the laser tower? Just tiny."*
 *
 * ⛔ 215 WAS DERIVED AGAINST A MODEL OF THE SHEET, NOT AGAINST THE SHEET. The block above reasoned
 * that the destruction clip widened the union bbox 1.63×, so fitted cell content went 240×210 →
 * 240×136, and set 132 × 1.63 = 215 to restore the size he had approved. MEASURED off the shipped
 * PNG at S178, the cell content is not 136 px tall — it is **73**:
 *
 *     row        subject h   fill of the 256 px cell
 *     intact        73 px      28.5 %      damaged   65 px   25.4 %
 *     critical      64 px      25.0 %      explosion 73 px   28.5 %
 *     spawning  58–111 px      43 %        destroyed 28–108 px  42 %
 *
 * So the drawn TV was `215 × 0.285` = **61 px**, against `T3_TOWER_SPRITE_PX` 84 and
 * `T9_TOWER_SPRITE_PX` 150. His hero building rendered smaller than a tier-3 tower — and, because
 * the subject's foot IS the cell's bottom row (botFrac 1.000) under a bottom anchor, the whole 61 px
 * hung between +46 and +107 px BELOW the structure centroid instead of straddling it the way every
 * other tower does. Small, and sitting in the wrong place.
 *
 * ⛔⛔ S178 SECOND PASS — **"TIER-9 PARITY" WAS SET TO 150 AND THAT REPEATED THE ORIGINAL MISTAKE IN
 * THE OPPOSITE DIRECTION.** `T9_TOWER_SPRITE_PX` = 150 is a tier-9 tower's SPRITE BOX, not the size
 * its art draws at — which is the exact box-vs-art confusion that produced the 61 px bug. Measured
 * off the shipped tier-9 sheets, a tower's art fills 68–91 % of its own 256 px cell and therefore
 * DRAWS at **103–137 px** (median 111). Setting the TV's ART to 150 made it the tallest building on
 * the board.
 *
 * ⚠ THE TARGET IS THE MEASURED MEDIAN, AND IT IS MINE, NOT HIS: 112 px, so the TV reads as one of
 * the tier-9 buildings it stands beside rather than as the biggest thing on screen. `TV_ART_PX` is
 * the single dial — 61 px was the bug, 150 px was my overshoot, 112 px is the measurement.
 */
/** Measured off `voltkin-tv-atlas.png` at S178: the steady rows fill 73 of each 256 px cell. */
const TV_SUBJECT_FILL = 73 / 256;
/**
 * How tall the TV's ART should READ on the board. MEASURED against what a tier-9 race tower actually
 * draws (103–137 px across the six sheets, median 111), not against its sprite box.
 */
const TV_ART_PX = 112;
const TV_SPRITE_PX = Math.round(TV_ART_PX / TV_SUBJECT_FILL);

/**
 * ⭐⭐⭐ S178 SECOND PASS — **WHERE EACH ROW'S FEET ACTUALLY ARE, so the TV does not FLOAT.**
 *
 * The manifest carries ONE `footAnchor` (y 0.9961) and it is true of only four of the six rows.
 * Measured bottom of the drawn subject, per row, in a 256 px cell:
 *
 *     intact 255 · damaged 255 · critical 255 · explosion 255   ← the still rows, foot == cell bottom
 *     spawning 212 · destroyed 217                              ← 38–43 px of empty cell BELOW the art
 *
 * So the emergence and the ruins were always drawn hovering above the ground line the intact TV
 * stands on, and scaling the sprite box scales that gap with it — the S178 first pass would have
 * amplified an existing pop by 2.45×. Offsetting each row by ITS OWN foot removes the gap entirely
 * instead, for every row, which is a fix rather than a mitigation.
 */
const TV_ROW_FOOT_FRAC: Readonly<Record<TvRow, number>> = {
  intact: 256 / 256,
  damaged: 256 / 256,
  critical: 256 / 256,
  explosion: 256 / 256,
  spawning: 213 / 256,
  destroyed: 218 / 256,
};

/** The y a sprite must be given so THIS row's drawn feet land on the ground line `groundY`. */
function tvSpriteY(row: TvRow, groundY: number): number {
  return groundY + TV_SPRITE_PX * (1 - TV_ROW_FOOT_FRAC[row]);
}

/** How close a SPAWNING Voltkin must be to a TV for that TV to be the one he is coming out of. */
const VOLTKIN_EMERGE_MATCH_PX = 160;

/** Six rows, and only three of them are `TowerState`s — see TV_ROWS. */
interface StateTextures {
  readonly intact: Texture;
  readonly spawning: Texture;
  readonly damaged: Texture;
  readonly critical: Texture;
  readonly explosion: Texture;
  readonly destroyed: Texture;
}
type TvRow = keyof StateTextures;
interface RowMeta { row: number; frames?: number; ticksPerFrame?: number }
interface Manifest { cellW: number; cellH: number; states: Partial<Record<TvRow, RowMeta>> }

/**
 * ⭐⭐⭐ S177 P4 (owner) — **A ROW CAN BE A SEQUENCE NOW, AND TWO OF THEM ARE.**
 *
 * He gave the general pipeline: *"every structure has kind of the same few stances as a creature
 * would. It's just a kind of different pipeline. The first one is when you deploy structure, him
 * being built. Second one, when the structure is built is when he stands idle — that's not really a
 * video, that's just a state, like a picture. But there's the video between one and two, being built
 * to idle. Then three, there's another state which is damaged. And then four is destroyed is another
 * video. It's another state transition."*
 *
 * So a structure is TWO videos and the rest pictures, and this renderer could draw neither: it cut
 * ONE texture per row and every shipped row was `frames: 1`. `spawning` and `destroyed` are real
 * 12-frame clips now; `intact` and `damaged` stay stills and cost nothing.
 *
 * ⚠ ONE-SHOT, NOT LOOPING, for both — a modulo would loop a wreck and re-burst a TV he has already
 * climbed out of. The index clamps to the last frame and HOLDS, the same contract `creatureRenderer`
 * states for `attack` and `die`.
 */
function clipFrame(meta: RowMeta | undefined, elapsedTicks: number): number {
  const frames = Math.max(1, meta?.frames ?? 1);
  const per = Math.max(1, meta?.ticksPerFrame ?? 1);
  return Math.min(frames - 1, Math.max(0, Math.floor(elapsedTicks / per)));
}

/**
 * ⭐⭐ S178 (owner) — A ROW THAT LOOPS FOREVER, rather than one that plays once and freezes.
 *
 * Owner, S178: *"Voltkin TV is not done … I didn't see it generate. I didn't see destroyed. It was
 * just a tiny TV."*
 *
 * ⛔ AND THE REASON IS THAT NOTHING BUT `spawning` AND `destroyed` WAS EVER ANIMATED. The draw block
 * below opened with `let frame = 0` and only ever reassigned it on those two rows, so `intact`,
 * `damaged`, `critical` and `explosion` — all twelve-frame rows on the shipped sheet — were each
 * drawn as **frozen frame 0**. The TV had no idle at all, and its destruction cinematic was two
 * still pictures. That is the whole of *"not done"*: the frames were on disk the entire time.
 *
 * `clipFrame` CLAMPS, which is right for a one-shot beat that must settle on its last frame. A
 * steady state needs the opposite, so this wraps. Driven by `world.tick`, which is synced, so every
 * peer draws the same frame of the same idle.
 */
function loopFrame(meta: RowMeta | undefined, elapsedTicks: number): number {
  const frames = Math.max(1, meta?.frames ?? 1);
  const per = Math.max(1, meta?.ticksPerFrame ?? 1);
  return Math.floor(Math.max(0, elapsedTicks) / per) % frames;
}

/**
 * Fallback row order, and the CONTRACT — the shipped manifest is the authority.
 *
 * ⭐ `spawning` LIVES HERE AND NOT IN `TowerState`, DELIBERATELY. The engine's damage union is three
 * valued and widening it breaks `tsc` across both shared row tables and forces a decision about rows
 * the tier-9 sheets do not have. The emergence is not a damage state anyway — it is a beat the TV
 * holds while the Voltkin climbs out of it — so this renderer owns its own row map and maps the
 * three DAMAGE rows through `towerStateForHp` exactly as before.
 */
const TV_ROWS: Readonly<Record<TvRow, number>> = {
  intact: 0, spawning: 1, damaged: 2, critical: 3, explosion: 4, destroyed: 5,
};

/*
 * ⭐⭐ S176 P2 — THE DESTRUCTION BEAT, AND THE EMERGENCE THAT WAS ONE FROZEN PICTURE.
 *
 * Owner, S176, with a screenshot: *"you can see the TV broken in him kind of coming out. but it's
 * stuck in that image. Like, it's not like it's moving anywhere or generating the whole video loop
 * of him coming out … you should, like, do the whole thing, and then he comes out."*
 *
 * ⛔ HE IS RIGHT, AND IT WAS NOT A STUCK FRAME — IT WAS THE ONLY FRAME. S175 packed `spawning` as a
 * single still at `framesPerState: 1` and held it for the whole 60-tick spawn window. Nothing was
 * broken; there was simply no sequence to play. Both beats below are therefore SEQUENCES, driven by
 * frames rather than by damage states, which is the shape S175 named (`TOWER_CRUMBLE_FRAMES`) and
 * deferred.
 *
 * ⭐⭐ AND THE OWNER'S OTHER RULING IS ALREADY SATISFIED BY THE ART, WHICH IS WHY NOTHING CHANGES TO
 * HONOUR IT. He said: *"then he waits by his TV that's broken, but it's not, like, you know, damaged
 * or anything. You need to be very consistent about this."* `tv-1-intact` IS a TV with a blown-out,
 * star-cracked screen on an undamaged chassis — broken, not damaged. So the resting texture after he
 * emerges is correct as it stands, and the damage rows stay driven by hp alone. ⚠ DO NOT "fix" this
 * by pointing the resting state at `spawning`: that row has the Voltkin's body IN it, so a TV he has
 * already left would still be drawing him climbing out of itself.
 */

/** Wind-up before the burst. The TV sits there, THEN he comes through it. */
const TV_EMERGE_WINDUP_TICKS = 12;
/**
 * Destruction beat: ticks on `critical`, then on `explosion`, then ruins.
 *
 * ⛔⛔⛔ S178 SECOND PASS — **THESE WERE WIDENED TO 36 / 48 AND THAT WAS A REGRESSION. RESTORED.**
 *
 * The first pass read the manifest, saw `frames: 12` on `critical` and `explosion`, and widened each
 * window to `frames × ticksPerFrame` so a twelve-frame row would have time to play. A verification
 * pass then MEASURED THE SHIPPED PNG instead of trusting the manifest, and the twelve frames are a
 * lie the sheet tells: on `intact`, `damaged`, `critical` and `explosion` all twelve cells are
 * **BYTE-IDENTICAL COPIES OF ONE STILL** (total absolute pixel difference from frame 0: zero, for
 * all eleven). Only `spawning` and `destroyed` carry real motion.
 *
 * So widening them did not buy animation — there is none to buy. It bought **1.4 s of staring at two
 * frozen pictures** before the only genuinely animated destruction row begins, where it used to be
 * 0.6 s. That is strictly worse against the complaint it cited (*"I didn't see destroyed"*): the
 * thing he did not see is `destroyed`, and the fix DELAYED it.
 *
 * ⚠ A STILL SHOULD BE HELD BRIEFLY AND THEN GOT OUT OF THE WAY. 18 ticks (0.30 s) each, as shipped
 * before S178. The budget belongs to `destroyed` — 12 real frames at `ticksPerFrame` 3 = 36 ticks,
 * comfortably inside `TV_RUINS_HOLD_TICKS` (42), so the one animation in the sequence plays in full.
 *
 * ⭐ `loopFrame` / `beatFrame` ARE KEPT even though they are no-ops on four of six rows today. They
 * are correct, they are what the sequence needs the moment those rows carry real frames, and on
 * `spawning` and `destroyed` they are doing real work right now.
 */
export const TV_CRITICAL_TICKS = 18;
export const TV_EXPLOSION_TICKS = 18;
/**
 * ⭐ S177 P4 — how long the RUINS linger once the beat has played out.
 *
 * Finite, and that is not a detail: a Voltkin chain that has lost a connector no longer matches its
 * recipe, so `markTowerCover` stops hiding its shapes and they draw themselves again. A ruins sprite
 * held forever would sit on top of shapes the player can still see, repair and rebuild from.
 */
const TV_RUINS_HOLD_TICKS = 42;
/** Total length of the destruction beat, after which the sprite is released. */
export const TV_DESTRUCTION_TICKS = TV_CRITICAL_TICKS + TV_EXPLOSION_TICKS + TV_RUINS_HOLD_TICKS;

/**
 * PURE — the emergence beat. Exported for test.
 *
 * ⚠ Keyed off the Voltkin's OWN `ticksInState`, which is a REQUIRED serialized wire field, so every
 * peer plays the same beat on the same tick with nothing added to the snapshot.
 */
export function tvEmergenceRow(ticksEmerging: number): 'intact' | 'spawning' {
  return ticksEmerging < TV_EMERGE_WINDUP_TICKS ? 'intact' : 'spawning';
}

/**
 * PURE — the destruction beat. Exported for test.
 *
 * ⚠ `ticksSinceDestroyed` is CLIENT-LOCAL (the tick this peer first saw the chain read destroyed),
 * not a synced field — deliberately, and it is the one place this renderer does not derive from the
 * wire. A tower's death is a one-shot cosmetic; two peers being a frame apart on an explosion is
 * invisible, whereas putting it on the wire would cost a PROTOCOL bump for a puff of smoke.
 */
export function tvDestructionRow(ticksSinceDestroyed: number): 'critical' | 'explosion' | 'destroyed' {
  if (ticksSinceDestroyed < TV_CRITICAL_TICKS) return 'critical';
  if (ticksSinceDestroyed < TV_CRITICAL_TICKS + TV_EXPLOSION_TICKS) return 'explosion';
  return 'destroyed';
}

/**
 * Is a Voltkin currently climbing out of the TV standing at (cx, cy)?
 *
 * ⚠ MATCHED BY POSITION, not by an id, because the chain and the creature are never linked in state:
 * `currentCinematicEvent` is cleared on GODLY_COMPLETE and the creature carries no chain reference.
 * The spawn happens AT the chain centroid (`pendingCreatureSpawn` uses `event.targetPos`), so a
 * generous radius around the sprite is exact in practice and degrades to 'no emergence frame' rather
 * than to a wrong one.
 */
function voltkinEmergingTicksAt(world: World, cx: number, cy: number): number {
  const rSq = VOLTKIN_EMERGE_MATCH_PX * VOLTKIN_EMERGE_MATCH_PX;
  // ⚠ TOTAL ORDER, not Map order: with two Voltkins inside one radius, `Map` iteration would decide
  // which one's clock drives the TV, and insertion order is not the same on both peers.
  let best = -1;
  let bestId = -1;
  for (const c of world.creatures.values()) {
    if (c.type !== 'voltkin' || c.state !== 'SPAWNING') continue;
    const dx = c.pos.x - cx;
    const dy = c.pos.y - cy;
    if (dx * dx + dy * dy > rSq) continue;
    const id = Number(c.id);
    if (best < 0 || id < bestId) { best = c.ticksInState; bestId = id; }
  }
  return best;
}

export class VoltkinTowerRenderer {
  readonly layer = new Container();
  private loadStarted = false;
  /** Keyed by the chain's stable identity (its sorted member ids). */
  private readonly sprites = new Map<string, Sprite>();
  /** S176 P2 — world.tick at which THIS peer first saw a chain read destroyed. Client-local; see
   *  `tvDestructionRow` for why that is deliberate and costs no protocol bump. */
  private readonly destroyedAt = new Map<string, number>();
  private sheet: Texture | null = null;
  private manifest: Manifest | null = null;
  /** Cut textures, keyed `row:frame`. Cutting is cheap but not free, and this runs every frame. */
  private readonly cells = new Map<string, Texture>();
  /**
   * ⭐⭐⭐ S177 P4 (owner) — **THE DESTRUCTION BEAT HAD NO CHANCE TO RUN, AND THIS IS WHY.**
   *
   * Owner: *"I didn't see the TV, like, also do a destroyed loop when someone destroyed the first
   * connector. So I think — I'm not sure — that one wasn't correctly attached. We need to make sure
   * this is worked to completion. The whole loop correctly."*
   *
   * ⛔ HE IS RIGHT, AND IT WAS NEVER ATTACHED TO ANYTHING REACHABLE. The beat was gated on
   * `towerStateForHp(...) === 'destroyed'` — a chain whose SHAPES have been ground to zero while the
   * chain still matches its recipe. But the way a Voltkin tower actually dies is a SEVERED
   * CONNECTOR: the moment one goes, the recipe stops matching, `chain` no longer resolves, the key
   * drops out of `live`, and the sweep at the bottom of `sync` destroyed the sprite on that very
   * frame. The TV vanished between two frames and the critical/explosion panels were unreachable.
   *
   * So a chain that LEAVES the live set during a fight becomes a ghost: its last position is kept
   * and the beat plays out there, after the thing itself is gone.
   *
   * ⚠ FIGHT-GATED, so scrapping your own tower in BUILD does not detonate it. A structure taken
   * apart deliberately is not a destruction, which is the same distinction `destroyDefender`'s
   * "a reset is not a death" rule draws.
   *
   * ⚠ CLIENT-LOCAL, like `destroyedAt` beside it and for the same reason: a tower's death is a
   * one-shot cosmetic, and two peers a frame apart on an explosion is invisible — where putting it
   * on the wire would cost a PROTOCOL bump for a puff of smoke.
   */
  private readonly dying = new Map<string, { at: number; x: number; y: number }>();
  /** Last drawn centroid per live chain — the anchor a ghost inherits. */
  private readonly lastPos = new Map<string, { x: number; y: number }>();

  constructor(_app: Application, parent: Container) {
    parent.addChild(this.layer);
  }

  private ensureAtlas(): void {
    if (this.loadStarted) return;
    this.loadStarted = true;
    void (async () => {
      try {
        const manifest = (await (await fetch(`${ATLAS_BASE}-anim.json`)).json()) as Manifest;
        const sheet = (await Assets.load(`${ATLAS_BASE}-atlas.png`)) as Texture;
        /*
         * ⭐ S177 P4 — CUT ON DEMAND, PER FRAME. This used to build one Texture per row at x=0, which
         * is frame 0 — correct while every row was `frames: 1` and silently wrong the moment two of
         * them became 12-frame clips. The sheet and manifest are kept instead and `frameTexture`
         * cuts (and caches) whatever cell is asked for.
         */
        this.sheet = sheet;
        this.manifest = manifest;
      } catch {
        /*
         * Left null and never retried. The chain's own shapes stay fully visible, because a failed
         * atlas means this renderer never calls `markTowerCover` — the board degrades to exactly what
         * it looked like before this feature, which is the same fallback contract `towerRenderer`
         * states for its own load failures.
         */
        this.sheet = null;
        this.manifest = null;
      }
    })();
  }

  /**
   * One cell of the sheet: row `state`, frame `i`. Cached, because `sync` runs every rendered frame.
   * Falls back to frame 0 for a row the manifest does not describe, which is the same degrade the
   * row-table fallback above takes.
   */
  /**
   * ⭐ S178 — WHICH FRAME OF A DESTRUCTION BEAT IS SHOWING, given ticks since the chain died.
   *
   * ONE place, because there are TWO draw paths — the live sprite and the `dying` ghost — and before
   * this they disagreed: the live path animated only `destroyed` and the ghost path passed a literal
   * `0` for everything but `destroyed`. Each row is offset by the beats that run before it, so every
   * one opens on its own frame 0 and `clipFrame` settles it on its last.
   */
  private beatFrame(row: TvRow, elapsed: number): number {
    if (this.manifest === null) return 0;
    if (row === 'critical') return clipFrame(this.manifest.states.critical, elapsed);
    if (row === 'explosion') {
      return clipFrame(this.manifest.states.explosion, elapsed - TV_CRITICAL_TICKS);
    }
    if (row === 'destroyed') {
      return clipFrame(this.manifest.states.destroyed, elapsed - TV_CRITICAL_TICKS - TV_EXPLOSION_TICKS);
    }
    return 0;
  }

  /**
   * ⭐⭐ S181 — **THE TV'S PORTRAIT, and the card was showing a literal ellipsis for it.**
   *
   * Found by the S181 portrait audit rather than by the owner, and it is worse than the emblem case
   * he reported: `CODEX_COPY.voltkin` deliberately carries NO `emblem` field (a chain is neither
   * ring nor star), so `drawPortrait`'s emblem arm cannot fire and the spec fell all the way through
   * to the word plate — which prints `'…'` for an `emblem` kind. An empty box with three dots.
   *
   * ⚠ IT CANNOT RIDE `towerFrame`, and this renderer's own docblock already ruled on why:
   * `TowerArt` requires a `RaceId` and a `tier: 3 | 9` that a race-agnostic TV does not have, and
   * *"widening either to fit would ripple into `destroyAtlasBase` and both row tables for one
   * structure"*. So it gets its own accessor and its own spec arm.
   */
  portraitTexture(): Texture | null {
    return this.frameTexture('intact', 0);
  }

  private frameTexture(state: TvRow, i: number): Texture | null {
    const sheet = this.sheet;
    const manifest = this.manifest;
    if (sheet === null || manifest === null) return null;
    const key = `${state}:${i}`;
    const hit = this.cells.get(key);
    if (hit !== undefined) return hit;
    const meta = manifest.states[state];
    const frames = Math.max(1, meta?.frames ?? 1);
    const col = Math.min(Math.max(0, i), frames - 1);
    const tex = new Texture({
      source: sheet.source,
      frame: new Rectangle(
        col * manifest.cellW, (meta?.row ?? TV_ROWS[state]) * manifest.cellH,
        manifest.cellW, manifest.cellH,
      ),
    });
    this.cells.set(key, tex);
    return tex;
  }

  /** Stable identity for a chain, independent of which end the search started from. */
  private static keyOf(chain: readonly PrimitiveId[]): string {
    return [...chain].map(Number).sort((a, b) => a - b).join(',');
  }

  sync(world: World): void {
    const chains = findAllVoltkinChains(world);
    if (chains.length === 0 && this.sprites.size === 0) return;
    this.ensureAtlas();

    const live = new Set<string>();
    for (const chain of chains) {
      const first = world.primitives.get(chain[0]!);
      // Fog: an enemy's building is not drawn unless it is in live vision — the same test, on the
      // same field, that `towerRenderer` applies to its anchor primitive.
      if (first !== undefined && isConcealed(first.pos.x, first.pos.y, first.placedBy)) continue;
      if (this.manifest === null) continue; // still loading, or failed — shapes stay bare

      let cx = 0; let cy = 0; let n = 0;
      for (const id of chain) {
        const p = world.primitives.get(id);
        if (p === undefined) continue;
        cx += p.pos.x; cy += p.pos.y; n++;
      }
      if (n === 0) continue;
      cx /= n; cy /= n;

      const key = VoltkinTowerRenderer.keyOf(chain);
      let sprite = this.sprites.get(key);
      if (sprite === undefined) {
        sprite = new Sprite();
        sprite.anchor.set(TOWER_SPRITE_ANCHOR.x, TOWER_SPRITE_ANCHOR.y);
        this.layer.addChild(sprite);
        this.sprites.set(key, sprite);
      }
      /*
       * ⭐⭐ S175 P4b — **THE EMERGENCE, DRIVEN OFF THE VOLTKIN'S OWN SPAWNING STATE.**
       *
       * Owner: *"it's gonna be like the tower is being built … kind of like when bosses come out.
       * But even cooler."* So while he is climbing out, the TV wears his burst-through-the-screen
       * panel, and the moment he is on the board it returns to intact.
       *
       * ⛔ `creature.state` IS THE RIGHT CLOCK AND `activeCinematicPlayerId` IS NOT. The latter is
       * host-local — it appears nowhere in `save.ts` — so a joiner would never see the emergence at
       * all. `Creature.state` and `pos` are REQUIRED, fully-serialized wire fields, so every peer
       * switches to the spawn frame on the same tick, for free. No new state, no bump.
       */
      const emergingTicks = voltkinEmergingTicksAt(world, cx, cy);
      const hpState = towerStateForHp(towerHpFrac(chain, (id) => world.primitives.get(id)?.hp));
      /*
       * Remember the tick this peer FIRST saw the chain dead, so the beat runs from there. Recorded
       * before it is read so a chain that is already destroyed on the frame it appears still plays
       * the sequence rather than snapping to ruins.
       */
      if (hpState === 'destroyed') {
        if (!this.destroyedAt.has(key)) this.destroyedAt.set(key, world.tick);
      } else {
        this.destroyedAt.delete(key);
      }
      let row: TvRow;
      let frame = 0;
      if (emergingTicks >= 0) {
        row = tvEmergenceRow(emergingTicks);
        // ⭐ S177 P4 — the emergence clip starts when the wind-up ends, not when the creature spawns.
        if (row === 'spawning') {
          frame = clipFrame(this.manifest.states.spawning, emergingTicks - TV_EMERGE_WINDUP_TICKS);
        }
      } else if (hpState === 'destroyed') {
        const elapsed = world.tick - (this.destroyedAt.get(key) ?? world.tick);
        row = tvDestructionRow(elapsed);
        /*
         * ⭐ S178 — ALL THREE DESTRUCTION ROWS ANIMATE NOW, not just the ruins. `critical` and
         * `explosion` reached `frameTexture` with `frame` still 0, so the burst the owner went
         * looking for was a single held picture. Each row is offset by the beats that precede it,
         * so every one starts at its own frame 0 when its window opens.
         */
        frame = this.beatFrame(row, elapsed);
      } else {
        row = hpState;
        // ⭐ S178 — the STEADY rows loop instead of holding frame 0. `intact`, `damaged` and
        // `critical` are twelve-frame idles on the sheet and had never once been played.
        frame = loopFrame(this.manifest.states[row], world.tick);
      }
      const tex = this.frameTexture(row, frame);
      if (tex === null) continue;
      sprite.texture = tex;
      sprite.width = TV_SPRITE_PX;
      sprite.height = TV_SPRITE_PX;
      sprite.x = cx;
      /*
       * The sprite's FOOT sits at the centroid, so the TV stands ON the shapes rather than being
       * buried to its waist in them — the CASTLE_SPRITE_ANCHOR lesson, which cost a capture once.
       *
       * ⭐ S178 — OFFSET BY THE ART, NOT BY THE BOX. The bottom anchor means the sprite BOX is
       * centred on the centroid, and the art occupies only the bottom `TV_SUBJECT_FILL` of it — so
       * offsetting by half the BOX pushed the whole TV below the shapes it is supposed to stand on.
       * Half the ART straddles the centroid exactly the way `towerRenderer` does, and it now stays
       * put when `TV_ART_PX` is re-dialled.
       */
      sprite.y = tvSpriteY(row, cy + TV_ART_PX * 0.5);

      /*
       * ⭐ Declared HERE, at the point the sprite is committed, and never re-derived inside
       * `towerCover` — the fog skip and the atlas-load bail above must NOT hide the shapes, or a
       * Voltkin chain in the dark becomes a blank patch of board.
       */
      const bonds: BondId[] = [];
      const members = new Set<PrimitiveId>(chain);
      let newestTick = 0;
      for (const bond of world.bonds.values()) {
        if (!members.has(bond.aId) || !members.has(bond.bId)) continue;
        bonds.push(bond.id);
        if (bond.createdTick > newestTick) newestTick = bond.createdTick;
      }
      markTowerCover(chain, bonds, newestTick);
      this.lastPos.set(key, { x: cx, y: cy });
      live.add(key);
    }

    /*
     * ⭐ S177 P4 — a chain that left the live set during a FIGHT does not vanish; it plays out.
     * Started BEFORE the sweep below so the sprite it needs is still in hand.
     */
    for (const key of this.sprites.keys()) {
      if (live.has(key) || this.dying.has(key)) continue;
      if (world.matchPhase !== 'FIGHT') continue; // a deliberate scrap is not a destruction
      const at = this.lastPos.get(key);
      if (at === undefined) continue;
      this.dying.set(key, { at: world.tick, x: at.x, y: at.y });
    }

    for (const [key, ghost] of [...this.dying]) {
      const elapsed = world.tick - ghost.at;
      const sprite = this.sprites.get(key);
      // A missing manifest means the load failed; the board degrades to plain shapes, exactly as the
      // load-failure contract above states, rather than holding a ghost that can never be drawn.
      if (this.manifest === null || sprite === undefined || elapsed >= TV_DESTRUCTION_TICKS) {
        this.dying.delete(key);
        continue;
      }
      /*
       * ⭐ S178 — THE GHOST ANIMATES THE SAME THREE BEATS AS THE LIVE SPRITE. This passed a literal
       * `0` for `critical` and `explosion`, so the death of a chain that had already lost its recipe
       * — which is the death the owner is MOST likely to watch, since losing a connector is what
       * kills a Voltkin TV — played as two frozen pictures. Same offsets as the live path.
       */
      const ghostRow = tvDestructionRow(elapsed);
      const ghostTex = this.frameTexture(ghostRow, this.beatFrame(ghostRow, elapsed));
      if (ghostTex === null) { this.dying.delete(key); continue; }
      sprite.texture = ghostTex;
      sprite.width = TV_SPRITE_PX;
      sprite.height = TV_SPRITE_PX;
      sprite.x = ghost.x;
      sprite.y = tvSpriteY(ghostRow, ghost.y + TV_ART_PX * 0.5); // S178 — per-row foot, as the live site
      live.add(key); // keep it off the reaper for one more frame
    }

    for (const [key, sprite] of this.sprites) {
      if (live.has(key)) continue;
      sprite.destroy();
      this.sprites.delete(key);
      this.destroyedAt.delete(key);
      this.lastPos.delete(key);
      this.dying.delete(key);
    }
  }

  /** Drop every sprite — title-return, same contract as the other renderers. */
  clear(): void {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.destroyedAt.clear();
    this.dying.clear();
    this.lastPos.clear();
  }
}
