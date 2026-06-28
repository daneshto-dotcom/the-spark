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
 * One container, aboveFogLayer (an enemy's HELGA is visible through the fog). RENDER-ONLY; wall-clock
 * is used only for the cosmetic impact-burst flicker (the slap TIMING is tick-synced).
 */

import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import {
  DEFENDER_FIRE_HOLD_TICKS,
  DEFENDER_RECOVER_TICKS,
  PRINCESS_SPRITE_BASE_SCALE,
  PRINCESS_WINDUP_TICKS,
} from '../constants.ts';
import type { World } from '../state/world.ts';
import type { DefenderState } from '../state/defenders/defender.ts';
import type { DefenderId } from '../types.ts';
import { helgaPose, type HelgaPose } from './helgaPose.ts';
import { helgaCell, type HelgaAnimConfig, type HelgaAnimState } from './helgaFrame.ts';
import { playSlapSFX } from './audioManager.ts';

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

export class PrincessRenderer {
  private readonly container: Container;
  private readonly bodyGfx: Graphics; // procedural fallback puppet + impact star-burst
  private readonly spriteLayer: Container; // veo-atlas character sprites
  private readonly sprites: Map<DefenderId, Sprite> = new Map();
  private readonly lastState: Map<DefenderId, string> = new Map();
  private readonly facing: Map<DefenderId, 1 | -1> = new Map();

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
      live.add(d.id);
      const firing = d.state === 'FIRE';

      // Face the target (synced strike/target pos), holding the last facing when idle.
      const aimAt = firing ? d.lastStrikePos
        : d.targetCreatureId !== null ? world.creatures.get(d.targetCreatureId)?.pos ?? null
        : null;
      let face = this.facing.get(d.id) ?? 1;
      if (aimAt) face = aimAt.x >= d.pos.x ? 1 : -1;
      this.facing.set(d.id, face);

      // Slap SFX on the FIRE edge (synced state = the event bus; fires exactly once per slap on both
      // peers — DEFENDER_FIRE_HOLD_TICKS spans ≥2 snapshots, the prev!=='FIRE' edge triggers once).
      const prev = this.lastState.get(d.id);
      if (firing && prev !== 'FIRE') void playSlapSFX({ x: d.pos.x, y: d.pos.y });
      this.lastState.set(d.id, d.state);

      if (this.atlas !== null) {
        this.syncSprite(d.id, d.state, d.ticksInState, world.tick, d.pos.x, d.pos.y, face);
      } else {
        // Procedural fallback until the atlas resolves (or if it failed).
        const pose = helgaPose(d.state, d.ticksInState, world.tick, d.id as unknown as number);
        this.drawHelga(g, d.pos.x, d.pos.y, face, pose);
      }

      if (firing && d.lastStrikePos !== null) {
        this.drawImpact(g, d.lastStrikePos.x, d.lastStrikePos.y, d.ticksInState, nowSec);
      }
    }

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

  /** Position/scale/face a HELGA's veo sprite from SYNCED state (pure cell selection). */
  private syncSprite(
    id: DefenderId, state: DefenderState,
    ticksInState: number, worldTick: number, x: number, y: number, face: 1 | -1,
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
    const cell = helgaCell(state, ticksInState, worldTick, id as unknown as number, atlas.cfg);
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
  }
}
