/**
 * SPARK — S180: **THE CHARACTER SHEET.** The card itself; the model is `characterSheetModel.ts`.
 *
 * > *"Little picture of the character, like we have the little little fucking health bar, stats,
 * > done."* — owner, S180
 *
 * ## ⛔ VISIBILITY IS A PURE FUNCTION OF STATE, RE-EVALUATED EVERY FRAME
 *
 * The discipline `arcadeRunOverlay.ts` records in full, and the reason it exists: an overlay shown by
 * an imperative `.show()` stays up forever the first time some exit path forgets its `.hide()`. Here
 * `sync()` runs unconditionally, re-derives the whole card from the world, and **clears its own
 * selection when the model returns null** — so a card cannot outlive its subject, and no new exit
 * path has to remember anything.
 *
 * ## ⛔ THE SELECTION IS AN ID AND NEVER ENTERS `world`
 *
 * Two players may have different things selected at the same instant and the sim does not care. That
 * is what keeps this feature off the hash, out of the save format and off the wire — the same
 * argument `structurePanel.ts` makes for the FIX/SCRAP popover it grew out of.
 *
 * RENDER-ONLY: reads `world`, never mutates it.
 */

import { Application, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { PlayerId } from '../types.ts';
import type { World } from '../state/worldTypes.ts';
import { codexCopyFor, drawEmblem } from './codexPresentation.ts';
import {
  characterSheetModel,
  SHEET_W,
  type CharacterSheetView,
  type PortraitSpec,
  type SheetTarget,
} from './characterSheetModel.ts';

const PAD = 12;
const PORTRAIT = 76;
const BAR_H = 12;
const ROW_H = 20;

const INK = 0xe8eef6;
const DIM = 0x93a6bb;
const PLATE = 0x0a1622;
const EDGE = 0x2a3a4a;
const HP_GOOD = 0x6fd08a;
const HP_WARN = 0xe8c35a;
const HP_LOW = 0xe2684a;
/** A frozen bar is LAST-SEEN, not live — it reads as greyed so it cannot be mistaken for current. */
const HP_FROZEN = 0x6c7a8a;

/** Hands back one still frame for a creature portrait. Injected so this file never imports the
 *  sprite renderer — that direction would be a cycle, and `main.ts` already owns both. */
export type PortraitSource = (spec: PortraitSpec) => Texture | null;

function barColor(cur: number, max: number, frozen: boolean): number {
  if (frozen) return HP_FROZEN;
  const f = max <= 0 ? 0 : cur / max;
  return f > 0.5 ? HP_GOOD : f > 0.2 ? HP_WARN : HP_LOW;
}

export class CharacterSheet {
  private readonly container: Container;
  private readonly g: Graphics;
  private readonly emblem: Graphics;
  private readonly portrait: Sprite;
  private readonly labels: Text[] = [];
  private used = 0;
  private selected: SheetTarget | null = null;
  private view: CharacterSheetView | null = null;
  private portraitSource: PortraitSource = () => null;
  /** Where the owned-unit row was drawn this frame, so a click on it can open that unit's own card. */
  private ownedHit: { x: number; y: number; w: number; h: number } | null = null;

  constructor(app: Application, parent: Container = app.stage) {
    this.container = new Container();
    this.container.eventMode = 'none'; // the board underneath stays clickable
    this.g = new Graphics();
    this.emblem = new Graphics();
    this.portrait = new Sprite();
    this.portrait.visible = false;
    this.container.addChild(this.g);
    this.container.addChild(this.emblem);
    this.container.addChild(this.portrait);
    parent.addChild(this.container);
  }

  setPortraitSource(fn: PortraitSource): void {
    this.portraitSource = fn;
  }

  select(target: SheetTarget | null): void {
    this.selected = target;
  }

  selection(): SheetTarget | null {
    return this.selected;
  }

  /** The owned-unit row's target if (x, y) is on it — his *"you can either click on that"*. */
  ownedRowAt(x: number, y: number): SheetTarget | null {
    const h = this.ownedHit;
    const owned = this.view?.owned ?? null;
    if (h === null || owned === null) return null;
    if (x < h.x || x > h.x + h.w || y < h.y || y > h.y + h.h) return null;
    return owned.target;
  }

  /** True while the pointer is over the card, so a click on it does not also act on the board. */
  isOver(x: number, y: number): boolean {
    const r = this.view?.rect;
    if (r === undefined) return false;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  sync(world: World, seat: PlayerId): void {
    const view = this.selected === null ? null : characterSheetModel(world, seat, this.selected);
    /*
     * ⛔ THE ONE LINE THAT MAKES A DEAD SUBJECT'S CARD VANISH WITH NO DEATH LISTENER. `sync` runs
     * every frame; the model returns null the moment its subject leaves the world; the selection
     * clears itself here. Nothing has to remember to close this.
     */
    if (view === null) this.selected = null;
    this.view = view;
    this.reset();
    if (view === null) {
      this.container.visible = false;
      this.ownedHit = null;
      return;
    }
    this.container.visible = true;
    this.draw(view);
  }

  private draw(v: CharacterSheetView): void {
    const { x, y, w, h } = v.rect;
    this.g.roundRect(x, y, w, h, 8).fill({ color: PLATE, alpha: 0.94 }).stroke({ color: EDGE, width: 1 });

    // ── header: the name, largest thing on the card, and one identity line ────────────────────
    this.text(v.title, x + PAD, y + PAD - 2, 17, INK);
    this.text(v.subtitle, x + PAD, y + PAD + 18, 11, DIM);

    const top = y + PAD + 36;

    // ── portrait ──────────────────────────────────────────────────────────────────────────────
    this.g
      .roundRect(x + PAD, top, PORTRAIT, PORTRAIT, 6)
      .fill({ color: 0x101a26 })
      .stroke({ color: EDGE, width: 1 });
    this.drawPortrait(v.portrait, x + PAD, top);

    // ── health: the bar AND the number. Both, always — the bar is for peripheral vision and the
    //    number is for the decision. Every RTS since StarCraft shows both.
    const rx = x + PAD + PORTRAIT + 10;
    const rw = w - PAD * 2 - PORTRAIT - 10;
    const { cur, max, frozen } = v.health;
    const frac = max <= 0 ? 0 : Math.max(0, Math.min(1, cur / max));
    const by = top + 6;
    this.g.roundRect(rx, by, rw, BAR_H, 3).fill({ color: 0x1b2938 });
    if (frac > 0) {
      this.g.roundRect(rx, by, Math.max(2, rw * frac), BAR_H, 3).fill({ color: barColor(cur, max, frozen) });
    }
    this.text(`${cur} / ${max}`, rx, by + BAR_H + 4, 13, frozen ? DIM : INK);
    if (frozen) this.text('LAST SEEN', rx, by + BAR_H + 20, 10, DIM);

    // ── the four stats. `derived` prints on the row it comes FROM — his own correction. ────────
    let sy = top + PORTRAIT + 10;
    for (const row of v.stats) {
      this.text(row.label, x + PAD, sy, 11, DIM);
      this.text(String(row.points), x + PAD + 42, sy, 13, INK);
      if (row.derived !== null) this.textRight(row.derived, x + w - PAD, sy, 11, DIM);
      sy += ROW_H;
    }

    // ── the unit this building fields, if it fields one ───────────────────────────────────────
    if (v.owned !== null) {
      const oy = sy + 4;
      const oh = 40;
      this.g
        .roundRect(x + PAD, oy, w - PAD * 2, oh, 6)
        .fill({ color: 0x14212e })
        .stroke({ color: EDGE, width: 1 });
      this.text(v.owned.name, x + PAD + 46, oy + 6, 12, INK);
      const ow = w - PAD * 2 - 52;
      const of_ = v.owned.health.max <= 0 ? 0 : v.owned.health.cur / v.owned.health.max;
      this.g.roundRect(x + PAD + 46, oy + 24, ow, 8, 3).fill({ color: 0x1b2938 });
      if (of_ > 0) {
        this.g
          .roundRect(x + PAD + 46, oy + 24, Math.max(2, ow * of_), 8, 3)
          .fill({ color: barColor(v.owned.health.cur, v.owned.health.max, v.owned.health.frozen) });
      }
      this.g.roundRect(x + PAD + 4, oy + 4, 32, 32, 4).fill({ color: 0x101a26 }).stroke({ color: EDGE, width: 1 });
      this.ownedHit = { x: x + PAD, y: oy, w: w - PAD * 2, h: oh };
    } else {
      this.ownedHit = null;
    }
  }

  private drawPortrait(spec: PortraitSpec, px: number, py: number): void {
    const tex = this.portraitSource(spec);
    if (tex !== null) {
      this.portrait.texture = tex;
      const scale = Math.min((PORTRAIT - 8) / tex.width, (PORTRAIT - 8) / tex.height);
      this.portrait.scale.set(scale);
      this.portrait.position.set(
        px + (PORTRAIT - tex.width * scale) / 2,
        py + (PORTRAIT - tex.height * scale) / 2,
      );
      this.portrait.visible = true;
      return;
    }
    // ⭐ HIS FALLBACK, NOT A PLACEHOLDER: *"the ones that don't have a tower yet, you just use the
    // one that you used in the codex, like the shape connectors, how it looks."*
    if (spec.kind === 'emblem') {
      const em = codexCopyFor(spec.recipeId).emblem;
      if (em !== undefined) {
        this.emblem.position.set(px + PORTRAIT / 2, py + PORTRAIT / 2);
        this.emblem.scale.set(0.55);
        drawEmblem(this.emblem, em);
      }
    }
  }

  private text(s: string, x: number, y: number, size: number, fill: number): void {
    const t = this.take();
    t.text = s;
    t.style.fontSize = size;
    t.style.fill = fill;
    t.anchor.set(0, 0);
    t.position.set(x, y);
  }

  private textRight(s: string, x: number, y: number, size: number, fill: number): void {
    const t = this.take();
    t.text = s;
    t.style.fontSize = size;
    t.style.fill = fill;
    t.anchor.set(1, 0);
    t.position.set(x, y);
  }

  /** Pooled, like every other overlay here — a Text per frame would churn the GPU. */
  private take(): Text {
    let t = this.labels[this.used];
    if (t === undefined) {
      t = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: INK }) });
      this.labels.push(t);
      this.container.addChild(t);
    }
    this.used++;
    t.visible = true;
    return t;
  }

  private reset(): void {
    this.g.clear();
    this.emblem.clear();
    this.portrait.visible = false;
    for (const t of this.labels) t.visible = false;
    this.used = 0;
  }

  getUiPoints(): {
    selected: SheetTarget | null;
    title: string;
    subtitle: string;
    health: { cur: number; max: number; frozen: boolean } | null;
    stats: { label: string; points: number; derived: string | null }[];
    owned: string | null;
    hasActions: boolean;
  } {
    return {
      selected: this.selected,
      title: this.view?.title ?? '',
      subtitle: this.view?.subtitle ?? '',
      health: this.view === null ? null : { ...this.view.health },
      stats: (this.view?.stats ?? []).map((r) => ({ ...r })),
      owned: this.view?.owned?.name ?? null,
      hasActions: this.view?.actions != null,
    };
  }

  bringToFront(): void {
    this.container.parent?.addChild(this.container);
  }

  clear(): void {
    this.selected = null;
    this.view = null;
    this.reset();
    this.container.visible = false;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

export { SHEET_W };
