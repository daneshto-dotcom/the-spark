/**
 * SPARK — S141 P1 stink-tower renderer.
 *
 * Draws every DEFENDER of kind 'stinkTower' as an ORIGINAL pencil-sketch squat tower: a blocky
 * plinth (it is anchored on a Square) with a slung crossbar from which the remaining BAGS hang, and
 * a lob arc on throw. One shared Graphics, cleared + redrawn each frame from `world.defenders` — the
 * TurretRenderer pattern — parented to `aboveFogLayer` so an enemy's tower is visible through the
 * fog, matching every other structure with cross-player reach.
 *
 * ⛔ THIS FILE IS WHY THE TOWER IS VISIBLE AT ALL. Both shipped defender renderers are EXCLUSION
 * filters (`if (d.kind !== 'turret') continue;`) with no registry and no exhaustiveness check, so a
 * new DefenderKind exists in `world.defenders`, ticks its FSM, deals damage, rides the wire — and
 * draws NOTHING, with no compile error and no failing test. The identical trap swallowed the S139
 * goblin one session ago. Adding a renderer is not polish here; it is the difference between a
 * feature and an invisible entity.
 *
 * Everything is derived from SYNCED defender state so host and the 1v1 client render identically:
 * the hanging bag count from `bagsRemaining`, the wind-up from `nextFireTick - world.tick`, the lob
 * from the `state === 'FIRE'` window drawn to the synced `lastStrikePos`. RENDER-ONLY: reads world,
 * never mutates. Wall-clock is used ONLY for cosmetic sway — every timing DECISION is tick-derived,
 * because a render that branches on wall-clock is a desync waiting for a slow frame.
 */

import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';

/* ⭐ S151 P3 — the veo atlas built from the owner's own STINK TOWER design. Owner: *"the stink tower
 * there is designed and actually looks good so make sure you make the stink tower look like that
 * too"*. The procedural rig below is retained as the instant-first-paint and load-failure fallback,
 * the same posture as HELGA and Voltkin — an emplacement that draws nothing is worse than one that
 * draws a placeholder. */
const STINK_ATLAS_BASE = '/godly/stink-tower/anim/stink-tower';
interface StinkAtlasState { row: number; frames: number; ticksPerFrame: number; }
interface StinkAtlasManifest {
  cellW: number; cellH: number;
  footAnchor: { x: number; y: number };
  states: Record<string, StinkAtlasState>;
}
import type { World } from '../state/world.ts';
import type { DefenderId } from '../types.ts';
import { getDefenderConfig } from '../state/defenders/defender.ts';
import {
  STINK_AURA_RADIUS,
  STINK_TOWER_BAGS,
  STINK_TOWER_SPRITE_BASE_SCALE,
} from '../constants.ts';

// ── pencil palette (shared vocabulary with turretRenderer) ──
const GRAPHITE = 0x2e2f36;
const GRAPHITE_SOFT = 0x4a4c55;
const PAPER_FILL = 0xe9e7df;
/** Stink green — the one colour in the game that reads as "this is unpleasant". */
const STINK = 0x7fbf3f;
const STINK_DEEP = 0x4e7d22;

const BODY_W = 30;
const BODY_H = 26;

export class StinkTowerRenderer {
  private readonly graphics: Graphics;
  /** Per-tower last-seen FSM state — used to fire the lob VFX on the entry edge, not every frame. */
  private readonly lastState: Map<DefenderId, string> = new Map();

  private readonly spriteLayer: Container;
  private readonly sprites: Map<DefenderId, Sprite> = new Map();
  private atlas: { cells: Record<string, Texture[]>; manifest: StinkAtlasManifest } | null = null;
  private atlasLoadStarted = false;

  constructor(app: Application, parent: Container = app.stage) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
    this.spriteLayer = new Container();
    parent.addChild(this.spriteLayer);
  }

  /** One-time lazy atlas load; the procedural tower keeps drawing until (or unless) it resolves. */
  private ensureAtlas(): void {
    if (this.atlasLoadStarted) return;
    this.atlasLoadStarted = true;
    void (async () => {
      try {
        const manifest =
          (await (await fetch(`${STINK_ATLAS_BASE}-anim.json`)).json()) as StinkAtlasManifest;
        const tex = (await Assets.load(`${STINK_ATLAS_BASE}-atlas.png`)) as Texture;
        const cells: Record<string, Texture[]> = {};
        for (const [name, st] of Object.entries(manifest.states)) {
          const arr: Texture[] = [];
          for (let i = 0; i < st.frames; i++) {
            arr.push(new Texture({
              source: tex.source,
              frame: new Rectangle(
                i * manifest.cellW, st.row * manifest.cellH, manifest.cellW, manifest.cellH,
              ),
            }));
          }
          cells[name] = arr;
        }
        this.atlas = { cells, manifest };
      } catch {
        this.atlas = null; // procedural fallback keeps the tower visible
      }
    })();
  }

  sync(world: World): void {
    const g = this.graphics;
    g.clear();
    this.ensureAtlas();
    const nowSec = performance.now() / 1000;
    const live = new Set<DefenderId>();

    for (const d of world.defenders.values()) {
      if (d.kind !== 'stinkTower') continue;
      live.add(d.id);
      const config = getDefenderConfig('stinkTower');
      const remaining = d.nextFireTick - world.tick;
      // Charge 0..1 toward the next lob. Only meaningful while the tower still has ammo.
      const charge = Math.max(0, Math.min(1, 1 - remaining / config.fireIntervalTicks));
      const depleted = d.bagsRemaining <= 0;
      const firing = d.state === 'FIRE';
      this.lastState.set(d.id, d.state);

      // A DEPLETED tower advertises its aura, because the aura is the only thing it still does and an
      // invisible damage field is indistinguishable from a bug. Sway is cosmetic wall-clock.
      if (depleted) {
        const pulse = 0.5 + 0.5 * Math.sin(nowSec * 1.6 + (d.id as unknown as number));
        g.circle(d.pos.x, d.pos.y, STINK_AURA_RADIUS)
          .fill({ color: STINK, alpha: 0.05 + pulse * 0.05 })
          .stroke({ color: STINK_DEEP, width: 1.2, alpha: 0.25 + pulse * 0.2 });
      }

      if (this.atlas !== null) {
        // ⚠ Frame index from the SYNCED `ticksInState`, never wall-clock — two peers watching the
        // same tower must see the same frame, exactly as for HELGA and the goblins. The aura ring
        // and the lob arc above/below stay procedural because they are STATE readouts, not art.
        const name = firing ? 'attack' : 'idle';
        const row = this.atlas.cells[name] ?? this.atlas.cells.idle;
        const st = this.atlas.manifest.states[name] ?? this.atlas.manifest.states.idle;
        if (row !== undefined && row.length > 0) {
          const per = Math.max(1, st?.ticksPerFrame ?? 6);
          const raw = Math.floor(d.ticksInState / per);
          // The throw plays once and holds; the idle loops.
          const i = firing ? Math.min(row.length - 1, raw) : raw % row.length;
          let sp = this.sprites.get(d.id);
          if (sp === undefined) {
            sp = new Sprite();
            sp.anchor.set(this.atlas.manifest.footAnchor.x, this.atlas.manifest.footAnchor.y);
            this.spriteLayer.addChild(sp);
            this.sprites.set(d.id, sp);
          }
          sp.texture = row[i]!;
          sp.position.set(d.pos.x, d.pos.y);
          sp.scale.set(STINK_TOWER_SPRITE_BASE_SCALE);
          // A depleted tower visibly dims — the magazine state must stay readable at a glance now
          // that the art no longer draws the bag count itself.
          sp.alpha = depleted ? 0.72 : 1;
        }
      } else {
        this.drawTower(g, d.pos.x, d.pos.y, d.bagsRemaining, depleted, charge, nowSec);
      }

      if (firing && d.lastStrikePos !== null) {
        this.drawLob(g, d.pos.x, d.pos.y - BODY_H, d.lastStrikePos.x, d.lastStrikePos.y);
      }
    }

    // A destroyed tower's sprite must go with it, or it stands there forever after the rubble.
    for (const [id, sp] of [...this.sprites]) {
      if (!live.has(id)) { sp.destroy(); this.sprites.delete(id); }
    }
    if (this.lastState.size > live.size) {
      for (const id of [...this.lastState.keys()]) if (!live.has(id)) this.lastState.delete(id);
    }
  }

  private drawTower(
    g: Graphics, x: number, y: number, bags: number, depleted: boolean, charge: number, nowSec: number,
  ): void {
    // ⚠ A SPENT TOWER SAGS. This is the whole read: a player must be able to tell at a glance whether
    // killing this thing will detonate a full magazine or a harmless husk, because that is the entire
    // tactical decision the death blast creates. The lean is the cheapest legible signal there is.
    const lean = depleted ? 0.16 : 0;
    const topY = y - BODY_H;

    // Ground shadow + squat plinth (it is anchored on a Square, so it reads square).
    g.ellipse(x, y + 6, BODY_W * 0.6, 4).fill({ color: 0x000000, alpha: 0.18 });
    g.moveTo(x - BODY_W / 2, y)
      .lineTo(x + BODY_W / 2, y)
      .lineTo(x + BODY_W / 2 - lean * BODY_H, topY)
      .lineTo(x - BODY_W / 2 - lean * BODY_H, topY)
      .closePath()
      .fill({ color: PAPER_FILL, alpha: 0.95 })
      .stroke({ color: GRAPHITE, width: 2.2 });

    // Crossbar the bags hang from.
    const barY = topY - 2;
    const barX = x - lean * BODY_H;
    g.moveTo(barX - BODY_W * 0.6, barY)
      .lineTo(barX + BODY_W * 0.6, barY)
      .stroke({ color: GRAPHITE, width: 2.4 });

    // ── THE BAGS — the ammo counter IS the art. No HUD number, no separate meter: the thing you
    // shoot at tells you how dangerous it is to shoot at. Slots are drawn at a FIXED pitch so a
    // half-empty rack reads as half-empty rather than as a smaller full rack.
    const slots = Math.max(1, STINK_TOWER_BAGS);
    for (let i = 0; i < slots; i++) {
      const t = slots === 1 ? 0.5 : i / (slots - 1);
      const bx = barX - BODY_W * 0.5 + t * BODY_W;
      const sway = Math.sin(nowSec * 1.3 + i * 0.9) * 1.1; // cosmetic only
      const by = barY + 9 + sway;
      if (i < bags) {
        g.moveTo(bx, barY).lineTo(bx, by - 4).stroke({ color: GRAPHITE_SOFT, width: 1.1, alpha: 0.8 });
        g.circle(bx, by, 4.4).fill({ color: STINK, alpha: 0.92 }).stroke({ color: STINK_DEEP, width: 1.3 });
      } else {
        // An empty hook, drawn faintly — the absence has to be visible or "3 left" looks like "3 total".
        g.moveTo(bx, barY).lineTo(bx, barY + 4).stroke({ color: GRAPHITE_SOFT, width: 1, alpha: 0.35 });
      }
    }

    // Charge tell: the next bag swells slightly as the lob nears. Skipped when spent — a depleted
    // tower must never look like it is about to do something.
    if (!depleted && bags > 0) {
      const t = slots === 1 ? 0.5 : Math.min(bags - 1, slots - 1) / Math.max(1, slots - 1);
      const cx = barX - BODY_W * 0.5 + t * BODY_W;
      g.circle(cx, barY + 9, 4.4 + charge * 2.6).stroke({ color: STINK, width: 1.4, alpha: 0.35 + charge * 0.45 });
    }
  }

  /** The lob arc + splash ring, drawn from the synced FIRE window to the synced strike position. */
  private drawLob(g: Graphics, x0: number, y0: number, x1: number, y1: number): void {
    // A high arc, so it reads as THROWN rather than fired. The control point is a fixed function of
    // the endpoints — no wall-clock — so both peers draw the same arc.
    const mx = (x0 + x1) / 2;
    const my = Math.min(y0, y1) - Math.abs(x1 - x0) * 0.35 - 26;
    g.moveTo(x0, y0).quadraticCurveTo(mx, my, x1, y1)
      .stroke({ color: STINK_DEEP, width: 2, alpha: 0.55 });
    g.circle(x1, y1, 10).fill({ color: STINK, alpha: 0.35 });
    g.circle(x1, y1, 5).fill({ color: STINK, alpha: 0.7 }).stroke({ color: STINK_DEEP, width: 1.4 });
  }

  clear(): void {
    this.graphics.clear();
    this.lastState.clear();
  }
}
