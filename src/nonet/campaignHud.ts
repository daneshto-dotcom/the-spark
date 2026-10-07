/**
 * SPARK — S196 #16 Option B: **THE CAMPAIGN STRIP OVER A STAGE** — which stage, which puzzle of how
 * many, and the time LEFT on the stage clock (the arcade's own clock above it counts UP; this counts
 * what remains, and the star thresholds).
 *
 * Render-only, pointer-transparent, called every frame with `null` when no stage is being played (the
 * `arcadeRunOverlay` discipline: visibility is recomputed from state, there is no show/hide to forget).
 * Lives in the NONET home's lazy chunk; `NonetHome` owns the one instance.
 */
import { Container, Graphics, Text } from 'pixi.js';
import { CANVAS_WIDTH } from '../constants.ts';
import type { CampaignStage } from './campaign.ts';

/** PURE — `m:ss`, never negative. */
export function formatSeconds(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export interface CampaignHudInfo {
  readonly stage: CampaignStage;
  readonly puzzleIndex: number;
  readonly elapsedMs: number;
}

/** PURE — the two lines the strip prints, plus whether the clock is in its last 20 %. */
export function campaignHudLines(i: CampaignHudInfo): { top: string; bottom: string; urgent: boolean } {
  const clockMs = i.stage.clockS * 1000;
  const left = clockMs - i.elapsedMs;
  const nextStar = i.elapsedMs <= i.stage.threeStarS * 1000
    ? `★★★ under ${formatSeconds(i.stage.threeStarS * 1000)}`
    : i.elapsedMs <= i.stage.twoStarS * 1000
      ? `★★ under ${formatSeconds(i.stage.twoStarS * 1000)}`
      : '★ — beat the clock';
  return {
    top: `STAGE ${i.stage.id} · BAND ${i.stage.band} · PUZZLE ${Math.min(i.puzzleIndex + 1, i.stage.puzzles)}/${i.stage.puzzles}`,
    bottom: `TIME LEFT ${formatSeconds(left)} · ${nextStar}`,
    urgent: left <= clockMs * 0.2,
  };
}

const W = 560;
const H = 64;
const Y = 92;

export class CampaignHud {
  readonly container = new Container();
  private readonly plate = new Graphics();
  private readonly top: Text;
  private readonly bottom: Text;
  private lastTop = '';
  private lastBottom = '';

  constructor(parent: Container) {
    this.container.eventMode = 'none';
    this.container.visible = false;
    this.container.label = 'nonet-campaign-hud';
    this.container.addChild(this.plate);
    this.top = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 20, fontWeight: 'bold', fill: 0xc8b8ff } });
    this.top.anchor.set(0.5);
    this.top.position.set(CANVAS_WIDTH / 2, Y + 18);
    this.bottom = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 18, fill: 0xe4ecf7 } });
    this.bottom.anchor.set(0.5);
    this.bottom.position.set(CANVAS_WIDTH / 2, Y + 44);
    this.container.addChild(this.top, this.bottom);
    parent.addChild(this.container);
  }

  /** Every frame. `null` hides it. */
  render(info: CampaignHudInfo | null): void {
    if (info === null) {
      this.container.visible = false;
      return;
    }
    const l = campaignHudLines(info);
    this.plate.clear();
    const x = (CANVAS_WIDTH - W) / 2;
    this.plate.roundRect(x, Y, W, H, 10).fill({ color: 0x05070c, alpha: 0.88 });
    this.plate.roundRect(x, Y, W, H, 10).stroke({ width: 2, color: l.urgent ? 0xff6b6b : 0x9b7bff, alpha: 0.85 });
    if (l.top !== this.lastTop) this.top.text = this.lastTop = l.top;
    if (l.bottom !== this.lastBottom) this.bottom.text = this.lastBottom = l.bottom;
    this.bottom.style.fill = l.urgent ? 0xff9a9a : 0xe4ecf7;
    this.container.visible = true;
    const p = this.container.parent;
    if (p !== null && p.children[p.children.length - 1] !== this.container) p.addChild(this.container);
  }

  /** For e2e / tests: what is on screen. */
  getUiPoints(): { visible: boolean; top: string; bottom: string } {
    return { visible: this.container.visible, top: this.lastTop, bottom: this.lastBottom };
  }
}
