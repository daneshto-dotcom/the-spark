/**
 * SPARK — S112 — HELGA princess renderer (veo-atlas character + procedural-puppet fallback).
 *
 * S112 REWRITE: HELGA is drawn from her owner-approved VEO clips (idle / walk / slap), matted offline
 * into ONE static atlas (public/godly/helga/anim/helga-atlas.png + manifest) and tick-indexed by the
 * PURE `helgaCell(state, ticksInState, world.tick, id)` selector — so host AND the 1v1 client render
 * the same frame from the same SYNCED state (Council Δ3; the determinism the procedural rig had). The
 * slap's HIT is sold by the FIRE-edge SFX (HHWAPAH + clap) + the impact star-burst (veo can't draw a
 * crisp slap; owner-approved). Atlas frames are foot-anchored on a shared canvas (Δ2) so she doesn't
 * jitter; the sprite anchor sits on that foot baseline so her feet plant at the synced hub pos.
 *
 * The legacy `helgaPose` articulated puppet is RETAINED as instant first-paint + atlas-load-fail
 * fallback (S110 Voltkin precedent): until the atlas resolves (or if it fails on a peer) she renders
 * procedurally so she is never blank — a cosmetic-only divergence (gameplay state is identical).
 *
 * One container.
 *
 * ⭐ S169 (owner) — NOW ON `fogHiddenLayer`, i.e. UNDER the fog. The old sentence here claimed an
 * enemy's building is visible THROUGH the fog because a raid target is a cross-player landmark.
 * The owner has overruled that: *"It should all be hidden during build state. You can go explore
 * it with your spark ... You should only see, like, their castle."* Scouting has to cost
 * something. The castle remains the one exception.
 *
 * RENDER-ONLY; wall-clock
 * is used only for the cosmetic impact-burst flicker (the slap TIMING is tick-synced).
 */

import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { isConcealed } from './concealment.ts';
import {
  DEFENDER_FIRE_HOLD_TICKS,
  DEFENDER_RECOVER_TICKS,
  PHYSICS_HZ,
  PRINCESS_SPRITE_BASE_SCALE,
  PRINCESS_WINDUP_TICKS,
} from '../constants.ts';
import type { World } from '../state/world.ts';
import type { DefenderState } from '../state/defenders/defender.ts';
import type { DefenderId } from '../types.ts';
import { helgaPose, type HelgaPose } from './helgaPose.ts';
import { helgaCell, type HelgaAnimConfig, type HelgaAnimState } from './helgaFrame.ts';
import { playSlapSFX, playSlotSFX } from './audioManager.ts';
import { fxActive, fxTop, fxTopShade } from './fx/fxState.ts';
import { easeOutCubic, fxSeed } from './fx/emitter.ts';
import { slapImpactFx } from './fx/combatFx.ts';
import { UNIT_DEATH_LIFE_TICKS, unitDeathFx } from './fx/unitDeathFx.ts';
import { helgaInvolvesSeat, helgaVictimSeat, type HelgaVictimMemo } from './coherence/helgaAudience.ts';

/*
 * ⭐⭐ S195 T19 — **OWNER B-7, RULED: *"she needs to look like she dies when she dies."***
 *
 * Until now she BLINKED OUT: `damage.ts` (R190-J) flips a killed Helga to `state: 'DORMANT'` on the kill
 * tick, this renderer skipped DORMANT records before adding them to `live`, and the cull at the bottom
 * destroyed her sprite the same frame. No fall, no beat, no sound — on every peer.
 *
 * ⭐ THE KILL IS ALREADY A SYNCED STATE EDGE, SO THIS COSTS NO WIRE FIELD. `DefenderState` is serialized
 * and hashed; a kill is the one writer of `'DORMANT'` (`damage.ts:455`); the BUILD-edge revive is the one
 * writer OUT of it (`reviveDormantHelgas`); a hall that FALLS removes her record outright (never DORMANT)
 * and prints nothing, exactly as the S182 number sweep treats it — a removal is not a death. So every peer
 * sees `prev !== 'DORMANT' && now === 'DORMANT'` on the same record, within one snapshot of the host. The
 * S186 test ("can two builds that shake hands disagree about anything either computes?") — no: nothing is
 * computed from new data, no shared constant moves. NO BUMP. (The brief's premise — that a kill LEAVES
 * `world.defenders` — was S158's; R190-J changed it in S189.)
 *
 * THE BEAT: the shared unit death beat (`fx/unitDeathFx.ts`, `'boss'` family — she is the one hero unit, a
 * ring is earned) in her seat colour, PLUS her sprite handed over as a corpse that keels over about her feet
 * and fades (`HELGA_FALL_TICKS`; her atlas has idle/walk/slap and no `die` row), PLUS the `unitFalls` sound
 * slot (silent until the owner drops the file in — `audioManager.SFX_SLOTS`). Aged by `world.tick`, so two
 * players watch the same fall. Fogged like her: a kill inside the fog shows nothing (owner S170). A first
 * sighting that is ALREADY DORMANT (a joiner, a save/load) is not an edge and draws nothing.
 */
/** ⚠ MINE — how long she lies falling, ticks (0.8 s): the `die` rows the units play are 12 frames at 4. */
export const HELGA_FALL_TICKS = 48;
/** ⚠ MINE — the beat's scale against `UNIT_DEATH_BASE_R`: her sprite (221×256 at 0.34) is ~2.3 goblins tall. */
export const HELGA_DEATH_BEAT_SCALE = 1.6;
/** The seat colour when the owner is unknown (a left player). Same neutral `unitDeathRenderer` falls back to. */
const NEUTRAL = 0xc8c8d0;

// ── palette (CtCD: thick dark outline, saturated flats) — used by the procedural fallback puppet ──
const OUTLINE = 0x241a14;
const SKIRT = 0x2e6b4f;
const SKIRT_TRIM = 0xe8d9a0;
const BODICE = 0x6b1f1f;
const SKIN = 0xf2c9a0;
const SKIN_SHADE = 0xd99a76;
const HAIR = 0xc8922e;
const CHEEK = 0xe06a5a;
const STEIN = 0xcfd2d8;
const FOAM = 0xfbf6e6;
const IMPACT = 0xfff0b0; // slap-impact star-burst

const SHO_Y = -50;
const SHO_X = 9;
const ARM_LEN = 20;

const ATLAS_URL = '/godly/helga/anim/helga-atlas.png';
const MANIFEST_URL = '/godly/helga/anim/helga-anim.json';

interface ManifestState { row: number; frames: number; ticksPerFrame: number; }
interface AtlasManifest {
  cellW: number;
  cellH: number;
  footAnchor: { x: number; y: number };
  states: Record<HelgaAnimState, ManifestState>;
}

interface LoadedAtlas {
  cells: Record<HelgaAnimState, Texture[]>;
  footAnchor: { x: number; y: number };
  cfg: HelgaAnimConfig;
}

/**
 * ⭐ S194 (T8) — the clock the slap's star-burst spins by while the rebuilt fx are on: SIM SECONDS,
 * the synced tick over `PHYSICS_HZ` — the same unit the legacy path's `performance.now() / 1000` is
 * in, so the spin rate (8 rad a second) is the same on both looks. Pure, so both peers agree.
 */
export function slapSpinSeconds(tick: number): number {
  return tick / PHYSICS_HZ;
}

export class PrincessRenderer {
  private readonly container: Container;
  private readonly bodyGfx: Graphics; // procedural fallback puppet + impact star-burst
  private readonly spriteLayer: Container; // veo-atlas character sprites
  private readonly sprites: Map<DefenderId, Sprite> = new Map();

  /**
   * ⭐ S172 — the measured sprite box, so Helga's health bar clears her head instead of being
   * drawn inside her at the 26 px fallback. Owner: *"Helga doesn't have a health bar."*
   * ⚠ `Math.abs` on the width because the X scale is negative when she faces left.
   */
  /**
   * ⭐⭐ S181 — **HELGA'S PORTRAIT, AND A CORRECTION TO THE OWNER.** He listed her with the art-less
   * things — *"not for pentagram, not for laser tower, not for Helga"* — but her veo atlas has been
   * on disk and loading in this renderer since S112 (`/godly/helga/anim/helga-atlas.png`). What he
   * is right about is her HUB: the building she is fielded from has no structure art, so that one
   * keeps the emblem. Her own card gets her face.
   *
   * ⚠ `idle` frame 0 — the neutral stance, not a mid-slap frame. A portrait taken from an action row
   * reads as a blur at 76px.
   *
   * ⚠ NULL BEFORE THE ATLAS RESOLVES, and on a peer whose fetch failed. The card's labelled plate is
   * the fallback for that window, exactly as the procedural puppet is on the board.
   */
  portraitTexture(): Texture | null {
    const idle = this.atlas?.cells['idle'];
    return idle === undefined || idle.length === 0 ? null : (idle[0] ?? null);
  }

  spriteBoxOf(id: DefenderId): { w: number; h: number } | null {
    const sp = this.sprites.get(id);
    return sp === undefined ? null : { w: Math.abs(sp.width), h: sp.height };
  }
  private readonly lastState: Map<DefenderId, string> = new Map();
  private readonly facing: Map<DefenderId, 1 | -1> = new Map();
  /** ⭐ S195 T19 (B-7) — the death beats of Helgas who fell, aged by `world.tick`. */
  private readonly deathBeats: Array<{ x: number; y: number; bornTick: number; seed: number; color: number }> = [];
  /** ⭐ S195 T19 (B-7) — her sprite after the kill edge: it keels over and fades, then is destroyed. */
  private readonly fallen: Array<{ sprite: Sprite; bornTick: number; face: 1 | -1 }> = [];
  /** ⭐ S195 T19 (N4) — the seat whose unit each Helga is on, remembered through the strike (`helgaAudience.ts`). */
  private readonly victimMemo: HelgaVictimMemo = new Map();

  private atlas: LoadedAtlas | null = null;
  private atlasLoadStarted = false;

  constructor(app: Application, parent: Container = app.stage) {
    this.container = new Container();
    parent.addChild(this.container);
    this.bodyGfx = new Graphics();
    this.container.addChild(this.bodyGfx);
    this.spriteLayer = new Container();
    this.container.addChild(this.spriteLayer);
  }

  /**
   * One-time lazy load of the veo atlas + manifest. Until it resolves sync() falls back to the
   * procedural puppet; on failure it stays null (procedural forever — cosmetic-only). Public/ assets
   * load by URL → off the JS entry chunk (no bundle-cap impact). Browser-only (Assets).
   */
  private ensureAtlas(): void {
    if (this.atlasLoadStarted) return;
    this.atlasLoadStarted = true;
    void (async (): Promise<void> => {
      try {
        const res = await fetch(MANIFEST_URL);
        if (!res.ok) throw new Error(`helga manifest ${res.status}`);
        const m = (await res.json()) as AtlasManifest;
        const tex = (await Assets.load(ATLAS_URL)) as Texture;
        const cells = {} as Record<HelgaAnimState, Texture[]>;
        for (const name of ['idle', 'walk', 'slap'] as HelgaAnimState[]) {
          const s = m.states[name];
          const arr: Texture[] = [];
          for (let i = 0; i < s.frames; i++) {
            arr.push(new Texture({
              source: tex.source,
              frame: new Rectangle(i * m.cellW, s.row * m.cellH, m.cellW, m.cellH),
            }));
          }
          cells[name] = arr;
        }
        this.atlas = {
          cells,
          footAnchor: m.footAnchor,
          cfg: {
            idleFrames: m.states.idle.frames,
            walkFrames: m.states.walk.frames,
            slapFrames: m.states.slap.frames,
            idleTicksPerFrame: m.states.idle.ticksPerFrame,
            walkTicksPerFrame: m.states.walk.ticksPerFrame,
            windupTicks: PRINCESS_WINDUP_TICKS,
            fireTicks: DEFENDER_FIRE_HOLD_TICKS,
            recoverTicks: DEFENDER_RECOVER_TICKS,
          },
        };
      } catch {
        this.atlas = null; // procedural fallback keeps HELGA visible
      }
    })();
  }

  sync(world: World): void {
    const g = this.bodyGfx;
    g.clear();
    this.ensureAtlas();
    const nowSec = performance.now() / 1000;
    const live = new Set<DefenderId>();

    for (const d of world.defenders.values()) {
      if (d.kind !== 'princess') continue;
      // N4 — track her victim's seat every frame (fogged or not), so the slap below knows its audience.
      helgaVictimSeat(world, d, this.victimMemo);
      if (d.state === 'DORMANT') {
        // S189 R190-J — she is dead; her HALL still draws. ⭐ S195 T19 (B-7) — and the EDGE into DORMANT is
        // her death: the one frame `lastState` still holds a live state for this record.
        const was = this.lastState.get(d.id);
        if (was !== undefined && was !== 'DORMANT') this.onHelgaFell(world, d);
        continue; // not `live`, so the cull below forgets her state until she is revived
      }
      /*
       * ⭐ S170 (owner) — FOG: an enemy DEFENDER is not drawn unless it is in live vision.
       * He named Helga specifically: *"Also, Helga and stuff, like, all of those need to be
       * hidden. You shouldn't be able to see it unless you're in fight phase"* — or unless the
       * spark is there, which is what `isConcealed` answers.
       */
      if (isConcealed(d.pos.x, d.pos.y, d.ownerPlayerId)) continue;
      live.add(d.id);
      const firing = d.state === 'FIRE';

      /**
       * ⭐⭐ S185 — IS SHE ACTUALLY MOVING? Derived, never stored.
       *
       * S183's patrol walks her while `d.state === 'IDLE'`, and it nulls `walkTargetPos` the
       * moment she arrives (then calls `freezeDefender`). So `walkTargetPos !== null` IS the
       * locomotion predicate, exactly, with no tolerance to tune and no position delta to measure.
       *
       * ⛔ A POSITION DELTA WOULD HAVE BEEN THE WRONG SOURCE, and it is the obvious one to reach
       * for. On a CLIENT, positions are interpolated between snapshots (`sync.ts` — "Positions
       * only"), so a delta reads non-zero on frames where the sim did not step her and zero on
       * frames where it did. `walkTargetPos` is synced state and is identical on both peers.
       */
      const isMoving = d.walkTargetPos !== null;

      /**
       * ⛔⛔ AND THE FACING HAD TO BE FIXED IN THE SAME EDIT OR THIS SHIPS A MOONWALK.
       *
       * `aimAt` is non-null only while firing or while holding a creature target. On the patrol leg
       * she has neither, so `face` held its LAST value — she would now play the walk row while
       * sliding backwards, which is a worse artefact than the beer-sip the owner reported.
       *
       * Walking toward a destination faces that destination. The strike/target arms still win when
       * they apply, because where she is hitting outranks where she is heading.
       */
      const aimAt = firing ? d.lastStrikePos
        : d.targetCreatureId !== null ? world.creatures.get(d.targetCreatureId)?.pos ?? null
        : isMoving ? d.walkTargetPos
        : null;
      let face = this.facing.get(d.id) ?? 1;
      if (aimAt) face = aimAt.x >= d.pos.x ? 1 : -1;
      this.facing.set(d.id, face);

      // Slap SFX on the FIRE edge (synced state = the event bus; fires exactly once per slap on both
      // peers — DEFENDER_FIRE_HOLD_TICKS spans ≥2 snapshots, the prev!=='FIRE' edge triggers once).
      const prev = this.lastState.get(d.id);
      // ⭐ S195 T19 (owner N4, VERIFIED — it leaked): only her OWNER and the seat whose unit she is hitting hear
      // the slap. `coherence/helgaAudience.ts` is the one rule her theme also asks.
      if (firing && prev !== 'FIRE' && helgaInvolvesSeat(world, d, world.localPlayerId, this.victimMemo)) {
        void playSlapSFX({ x: d.pos.x, y: d.pos.y });
      }
      this.lastState.set(d.id, d.state);

      if (this.atlas !== null) {
        this.syncSprite(d.id, d.state, d.ticksInState, world.tick, d.pos.x, d.pos.y, face, isMoving);
      } else {
        // Procedural fallback until the atlas resolves (or if it failed).
        const pose = helgaPose(d.state, d.ticksInState, world.tick, isMoving, d.id as unknown as number);
        this.drawHelga(g, d.pos.x, d.pos.y, face, pose);
      }

      if (firing && d.lastStrikePos !== null) {
        // ⭐ S193 (V23) — a white-hot flash, a shock ring and star sparks (`fx/combatFx.ts`), aged by her
        // synced FIRE clock and seeded by her id and the strike tick. The S112 star-burst stays (it is
        // the slap's shape), spun by the tick instead of the wall clock while the rebuilt fx are on.
        if (fxActive()) {
          slapImpactFx(fxTop(), d.lastStrikePos.x, d.lastStrikePos.y, d.ticksInState,
            fxSeed(d.id as unknown as number, world.tick - d.ticksInState));
          // ⭐ S194 (T8) — SIM SECONDS, i.e. the tick over `PHYSICS_HZ`: `drawImpact` spins by seconds
          // (`nowSec × 8` rad), and this read a literal `/ 60` that only equalled it while the sim ran at 60.
          this.drawImpact(g, d.lastStrikePos.x, d.lastStrikePos.y, d.ticksInState, slapSpinSeconds(world.tick));
        } else {
          this.drawImpact(g, d.lastStrikePos.x, d.lastStrikePos.y, d.ticksInState, nowSec);
        }
      }
    }

    this.drawDeaths(world);

    // Drop sprites + bookkeeping for defenders gone this frame (death/despawn) so nothing leaks.
    if (this.sprites.size > 0) {
      for (const [id, sp] of [...this.sprites]) {
        if (!live.has(id)) { sp.destroy(); this.sprites.delete(id); }
      }
    }
    if (this.lastState.size > live.size) {
      for (const id of [...this.lastState.keys()]) {
        if (!live.has(id)) { this.lastState.delete(id); this.facing.delete(id); }
      }
    }
  }

  /**
   * ⭐ S195 T19 (B-7) — the kill edge, on every peer: the beat, the fall, the sound. Rule 2 (PLAYING) and rule 4
   * (not concealed) of `coherence/unitDeparture.ts` apply; rule 3 (mass clear) cannot arise — a cleared map has
   * no record to flip — and rule 1 (expiry) has no analogue, she has no lifetime.
   */
  private onHelgaFell(world: World, d: { id: DefenderId; pos: { x: number; y: number }; ownerPlayerId: import('../types.ts').PlayerId }): void {
    const sp = this.sprites.get(d.id);
    if (world.gameState !== 'PLAYING' || isConcealed(d.pos.x, d.pos.y, d.ownerPlayerId)) {
      if (sp !== undefined) { sp.destroy(); this.sprites.delete(d.id); }
      return;
    }
    const color = world.players.get(d.ownerPlayerId)?.color ?? NEUTRAL;
    this.deathBeats.push({
      x: d.pos.x, y: d.pos.y, bornTick: world.tick, seed: fxSeed(d.id as unknown as number, 0x4e16a), color,
    });
    if (sp !== undefined) {
      this.sprites.delete(d.id);
      this.fallen.push({ sprite: sp, bornTick: world.tick, face: this.facing.get(d.id) ?? 1 });
    }
    void playSlotSFX('unitFalls', { x: d.pos.x, y: d.pos.y });
  }

  /** Age and draw every death in flight; retire what has played out. Tick-driven, never wall-clock. */
  private drawDeaths(world: World): void {
    for (let i = this.deathBeats.length - 1; i >= 0; i--) {
      const b = this.deathBeats[i]!;
      const age = world.tick - b.bornTick;
      if (age < 0 || age >= UNIT_DEATH_LIFE_TICKS) { this.deathBeats.splice(i, 1); continue; }
      if (fxActive()) {
        unitDeathFx(fxTop(), fxTopShade(), b.seed, 'boss', b.x, b.y, HELGA_DEATH_BEAT_SCALE, b.color, age / UNIT_DEATH_LIFE_TICKS);
      }
    }
    for (let i = this.fallen.length - 1; i >= 0; i--) {
      const f = this.fallen[i]!;
      const t = (world.tick - f.bornTick) / HELGA_FALL_TICKS;
      if (t < 0 || t >= 1) { f.sprite.destroy(); this.fallen.splice(i, 1); continue; }
      // She keels over about her feet (the sprite anchor IS her foot) and fades in the last two fifths.
      f.sprite.rotation = -f.face * (Math.PI / 2) * easeOutCubic(Math.min(1, t * 1.6));
      f.sprite.alpha = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
    }
  }

  /** Test + bench seams (B-7): deaths in flight. */
  deathBeatCount(): number { return this.deathBeats.length; }
  fallenCount(): number { return this.fallen.length; }

  /** Position/scale/face a HELGA's veo sprite from SYNCED state (pure cell selection). */
  private syncSprite(
    id: DefenderId, state: DefenderState,
    ticksInState: number, worldTick: number, x: number, y: number, face: 1 | -1,
    isMoving: boolean,
  ): void {
    const atlas = this.atlas;
    if (atlas === null) return;
    let sp = this.sprites.get(id);
    if (sp === undefined) {
      sp = new Sprite();
      sp.anchor.set(atlas.footAnchor.x, atlas.footAnchor.y);
      this.spriteLayer.addChild(sp);
      this.sprites.set(id, sp);
    }
    const cell = helgaCell(state, ticksInState, worldTick, id as unknown as number, atlas.cfg, isMoving);
    const tex = atlas.cells[cell.state][cell.frame];
    if (tex !== undefined && sp.texture !== tex) sp.texture = tex;
    sp.scale.set(face * PRINCESS_SPRITE_BASE_SCALE, PRINCESS_SPRITE_BASE_SCALE);
    sp.position.set(x, y);
  }

  /** Procedural fallback puppet (pre-atlas / load-fail). (lx,ly)=feet anchor; `face` mirrors X. */
  private drawHelga(g: Graphics, lx: number, ly: number, face: 1 | -1, pose: HelgaPose): void {
    const X = (px: number): number => lx + face * px;
    const Y = (py: number): number => ly + py + pose.bodyBobY;
    const O = { color: OUTLINE, width: 3.2, alpha: 1 } as const;
    const Othin = { color: OUTLINE, width: 2, alpha: 0.9 } as const;

    g.ellipse(lx, ly + 2, 16, 4).fill({ color: 0x000000, alpha: 0.2 });

    for (const s of [-1, 1]) {
      g.moveTo(X(s * 5), Y(-16)).lineTo(X(s * 5), Y(-2)).stroke({ color: OUTLINE, width: 4.5 });
    }

    const sway = pose.skirtSway;
    const hemL = X(-17 + sway * 14), hemR = X(17 + sway * 14);
    g.moveTo(X(-8), Y(-36)).lineTo(hemL, Y(-15)).lineTo(hemR, Y(-15)).lineTo(X(8), Y(-36)).closePath()
      .fill({ color: SKIRT }).stroke(O);
    g.moveTo(hemL, Y(-15)).lineTo(hemR, Y(-15)).stroke({ color: SKIRT_TRIM, width: 4, alpha: 0.95 });
    g.moveTo(X(-4), Y(-34)).lineTo(X(-6), Y(-16)).stroke({ color: SKIRT_TRIM, width: 5, alpha: 0.8 });

    g.moveTo(X(-8), Y(-36)).lineTo(X(-9), Y(-52)).lineTo(X(9), Y(-52)).lineTo(X(8), Y(-36)).closePath()
      .fill({ color: BODICE }).stroke(O);
    g.moveTo(X(0), Y(-50)).lineTo(X(0), Y(-37)).stroke({ color: SKIRT_TRIM, width: 1.6, alpha: 0.8 });

    const ba = pose.beerArmAngle;
    const bSho = { x: X(-SHO_X), y: Y(SHO_Y) };
    const bHand = { x: bSho.x - face * Math.sin(ba) * ARM_LEN, y: bSho.y + Math.cos(ba) * ARM_LEN - pose.sip * 8 };
    g.moveTo(bSho.x, bSho.y).lineTo(bHand.x, bHand.y).stroke({ color: SKIN, width: 6 }).stroke(Othin);
    g.roundRect(bHand.x - 4, bHand.y - 6, 8, 11, 1.5).fill({ color: STEIN }).stroke(O);
    g.ellipse(bHand.x, bHand.y - 6, 5, 2.4).fill({ color: FOAM }).stroke(Othin);

    const sa = pose.slapArmAngle;
    const sSho = { x: X(SHO_X), y: Y(SHO_Y) };
    const reach = ARM_LEN + pose.slapReach;
    const sHand = { x: sSho.x + face * Math.sin(sa) * reach, y: sSho.y + Math.cos(sa) * reach };
    g.moveTo(sSho.x, sSho.y).lineTo(sHand.x, sHand.y).stroke({ color: SKIN, width: 6 }).stroke(Othin);
    g.circle(sHand.x, sHand.y, 5).fill({ color: SKIN }).stroke(Othin);
    g.circle(sHand.x + face * 2, sHand.y - 2, 2).fill({ color: SKIN_SHADE });

    const hx = X(0 + pose.leanAngle * 10), hy = Y(-62);
    for (const s of [-1, 1]) {
      g.moveTo(hx + face * s * 8, hy + 2).lineTo(hx + face * s * 11, hy + 16).stroke({ color: HAIR, width: 5 }).stroke(Othin);
    }
    g.circle(hx, hy, 11).fill({ color: SKIN }).stroke(O);
    g.moveTo(hx - 11, hy - 2).quadraticCurveTo(hx, hy - 16, hx + 11, hy - 2).stroke({ color: HAIR, width: 5 }).stroke(Othin);
    g.circle(hx - face * 5, hy + 3, 2.4).fill({ color: CHEEK, alpha: 0.8 });
    g.circle(hx + face * 5, hy + 3, 2.4).fill({ color: CHEEK, alpha: 0.8 });
    const eo = face * 1.5;
    g.circle(hx - face * 3 + eo, hy - 1, 1.6).fill({ color: OUTLINE });
    g.circle(hx + face * 3 + eo, hy - 1, 1.6).fill({ color: OUTLINE });
    g.moveTo(hx - face * 6, hy - 5).lineTo(hx - face * 1, hy - 4).stroke({ color: OUTLINE, width: 1.4 });
    g.moveTo(hx + face * 1, hy - 4).lineTo(hx + face * 6, hy - 5).stroke({ color: OUTLINE, width: 1.4 });
    if (pose.slapReach > 1) g.circle(hx + face * 1, hy + 6, 2.6).fill({ color: 0x7a2b2b });
    else g.moveTo(hx - face * 3, hy + 6).quadraticCurveTo(hx + face * 1, hy + 8, hx + face * 4, hy + 6).stroke({ color: OUTLINE, width: 1.6 });
  }

  /** A quick cartoon star-burst at the slap point (cosmetic flicker via wall-clock). */
  private drawImpact(g: Graphics, x: number, y: number, ticksInState: number, nowSec: number): void {
    const t = Math.min(1, ticksInState / 8);
    const alpha = 1 - t;
    if (alpha <= 0) return;
    const r = 8 + t * 16;
    const spin = nowSec * 8;
    g.circle(x, y, r * 0.5).fill({ color: IMPACT, alpha: 0.5 * alpha });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + spin;
      const x1 = x + Math.cos(a) * r, y1 = y + Math.sin(a) * r;
      g.moveTo(x, y).lineTo(x1, y1).stroke({ color: IMPACT, width: 2.5 * alpha + 0.5, alpha: 0.9 * alpha });
    }
  }

  clear(): void {
    this.bodyGfx.clear();
    for (const [, sp] of this.sprites) sp.destroy();
    this.sprites.clear();
    this.lastState.clear();
    this.facing.clear();
    // ⭐ S195 T19 (B-7) — a title return forgets every death in flight (the S167 goblin-corpse lesson).
    for (const f of this.fallen) f.sprite.destroy();
    this.fallen.length = 0;
    this.deathBeats.length = 0;
    this.victimMemo.clear();
  }
}
