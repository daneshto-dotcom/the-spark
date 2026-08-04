/**
 * SPARK — V6-0.3 (S131): the sever-attribution toast. "Tell the victim what happened, and by whom."
 *
 * WHY THIS EXISTS. A bond going away is the single most consequential thing that happens to a
 * player's structure, and until now it was silent and anonymous: the audio drain played a sound,
 * the primitives vanished, and nothing said who did it. That makes failure unattributable, which
 * is the one thing a learnability slot must fix.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE MOVING ANYTHING. `drainSeverToast` reads `world.effects`, so it MUST be called
 * BEFORE `effectsRenderer.sync(world)` — that call wipes the array (effectsRenderer.ts:73). V6-0.2
 * shipped a tier banner whose scan sat 29 lines on the wrong side of that wipe and therefore never
 * rendered once, through a fully green suite. `src/render/ui.drainOrder.test.ts` pins this call
 * site; the in-situ comment in main.ts is the other half of the guard.
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * DELIBERATELY NOT SPLIT into drain + animate halves, unlike `HUD.drainTierBanner` /
 * `animateTierBanner`. That split exists because `hud.sync` had to stay after the wipe for
 * unrelated ordering reasons, so the effects scan had to be lifted out of it. Here there is
 * exactly ONE method and ONE call site, both pre-wipe, so there is no half that can drift to the
 * wrong side. The pose update is order-independent (it reads only ticks), so folding it in costs
 * nothing and removes a failure mode rather than adding one.
 *
 * HOLD IS TICK-DRIVEN, NOT FRAME-DRIVEN — a deliberate divergence from the tier banner.
 * `TIER_BANNER_FRAMES` is a count of RENDERED FRAMES, and nothing caps the Pixi ticker (no `maxFPS`
 * anywhere; the sole registration is `app.ticker.add` at main.ts:1403), so that banner holds ~2 s
 * at 60 Hz but only ~1 s at 120 Hz and ~0.83 s at 144 Hz. A notification the player must READ
 * should not shrink on better hardware, so this window is measured in SIM TICKS like
 * `COMBO_TOAST_DURATION_TICKS` — identical wall-clock on every display.
 *
 * NETWORKED REACH IS ~1/6, AND THAT IS A KNOWN, RULED LIMITATION (S130 owner ruling F1: "accept
 * the narrow ship"). BOND_SEVERED *is* serialized, but `world.effects` is wiped every frame while
 * snapshots go out every 6th tick (SNAPSHOT_INTERVAL_TICKS=6, main.ts:204), so a one-frame effect
 * only reaches a remote peer if it happens to live on a snapshot frame. In solo and VS-BOTS — where
 * the victim IS the host — delivery is 100%, which is the mode this ships for. The durable fix is a
 * per-seat synced carrier (a 6-slot array, NOT a global scalar: a sever is high-frequency and
 * per-victim, so a scalar is clobbered within one frame's ≤3-tick drain) and is a logged
 * carry-forward. Do not read this file as though the feature works everywhere.
 */
import { Container, Graphics, Text, TextStyle, type Application } from 'pixi.js';
import { CANVAS_WIDTH } from '../constants.ts';
import type { GameEffect } from '../game/effects.ts';
import type { PlayerId } from '../types.ts';
import type { World } from '../state/world.ts';
import { avatarNameplateText } from './avatarRenderer.ts';
import { HUD_PLATE_FILL } from './ui.ts';

/**
 * Hold window, in SIM TICKS (see the header on why not frames). 150 ticks = 2.5 s at PHYSICS_HZ 60,
 * matching `COMBO_TOAST_DURATION_TICKS` so two toasts landing together read as one visual language.
 *
 * Local to the renderer rather than added to constants.ts, on the `TIER_BANNER_FRAMES` precedent:
 * it is a render-only timing with no sim or wire meaning.
 */
export const SEVER_TOAST_DURATION_TICKS = 150;

/**
 * Fourth toast slot. Verified clear of every other centre-column surface at 1920×1080:
 * `Combos N/14` (y 13–21) · the tier banner (y 34–59, bottom edge MEASURED at ~60 in the S131
 * playtest — the V6-0.3 PDR's "bottom ≈68" was a conservative estimate) · the combo toast
 * (y ≈ 302 = 1080 × 0.28) · and the top-left leaderboard column, which this clears horizontally by
 * being centre-anchored.
 */
const TOAST_Y = 240;
const PEAK_ALPHA = 0.95;

export interface SeverToastPose {
  readonly active: boolean;
  readonly alpha: number;
  readonly scale: number;
}

const INACTIVE_POSE: SeverToastPose = { active: false, alpha: 0, scale: 1 };

/**
 * Pure pose math — the same envelope as `comboToastPose` (fade in 12%, hold, fade out 22%, gentle
 * pop-in). Reusing the SHAPE deliberately; NOT reusing that renderer's world-field drive, whose own
 * docblock explains it reads `world.comboToastTick` precisely because a one-shot effects entry
 * "would miss the client ~5/6 of the time".
 *
 * `elapsed` outside [0, duration) ⇒ inactive, which covers a tick rewind after a snapshot adopts a
 * lower host tick (save.ts:830) — that must not render a ghost toast.
 */
export function severToastPose(elapsed: number, duration: number): SeverToastPose {
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= duration) return INACTIVE_POSE;
  const t = elapsed / duration;
  return {
    active: true,
    alpha: Math.min(PEAK_ALPHA, t / 0.12, (1 - t) / 0.22),
    scale: 0.7 + 0.3 * Math.min(1, t / 0.15),
  };
}

/** The BOND_SEVERED cause union, named once so the copy table and the reducer cannot drift apart. */
export type SeverCause = Extract<GameEffect, { kind: 'BOND_SEVERED' }>['cause'];

/** What one frame's drain decided. `text === null` ⇒ nothing to show; leave any in-flight toast alone. */
export interface SeverToastCapture {
  readonly text: string | null;
  /** How many of the victim's bonds were severed in this batch (≥1 when text !== null). */
  readonly count: number;
}

const NO_CAPTURE: SeverToastCapture = { text: null, count: 0 };

/** Seat label via the existing tested helper — NEVER colour names (the rainbow shuffle remaps colours mid-match). */
function seatLabel(seat: PlayerId, botSeats: ReadonlySet<PlayerId>): string {
  return avatarNameplateText(seat, botSeats.has(seat));
}

/**
 * Pure: the toast line for one coherent batch. Fixed `{AGENT} {VERB} {OBJECT}` grammar so the
 * player learns one sentence shape and only has to read the variable part.
 *
 * `agent === null` means "we will not name a seat" — either nothing attributable (physics), or a
 * MIXED batch. Mixed degrades to the actor-less form rather than picking the newest, because a
 * newest-wins rule can name the wrong player, and misattribution in a learnability feature teaches
 * an actively false causal model (S130 Council F5).
 *
 * The `cause` arm is a TOLERANT lookup with a default, never an exhaustive switch: `'godly'` is in
 * the BOND_SEVERED effect union but not the SEVER_BOND action union, so an exhaustive switch either
 * fails to compile or silently yields undefined. `'bomb'` never arrives here — it is suppressed
 * upstream — but is listed so the table stays readable against the union.
 *
 * `cause === null` means the batch mixed several mechanisms, so no single verb is truthful.
 */
export function severToastCopy(
  cause: SeverCause | null,
  agent: string | null,
  count: number,
): string {
  const burst = count > 1 ? ` ×${count}` : '';
  // Nothing to name: physics overstretch, or a mixed batch. State the outcome, claim no culprit.
  if (agent === null) {
    const line =
      cause === 'physics' ? 'YOUR BOND SNAPPED — OVERSTRETCHED' : 'YOUR BOND WAS SEVERED';
    return `${line}${burst}`;
  }
  switch (cause) {
    case 'player':
      return `${agent} SEVERED YOUR BOND${burst}`;
    case 'creature':
      return `${agent}'S CREATURE CUT YOUR BOND${burst}`;
    case 'chewer':
      return `${agent}'S CHEWER GNAWED YOUR BOND${burst}`;
    case 'drone':
      return `${agent}'S DRONE CUT YOUR BOND${burst}`;
    // 'bomb' is suppressed upstream and 'godly' is unreachable; both fall through to the tolerant
    // default, which names the agent without asserting a mechanism it cannot vouch for.
    default:
      return `${agent} SEVERED YOUR BOND${burst}`;
  }
}

/**
 * THE reducer. Pure, so the whole decision is testable without a Pixi `Application` — the lesson
 * from V6-0.2, where every pure helper AROUND the defect was pinned and the defect itself was a
 * call-site fact.
 *
 * VICTIM GATE. Only the local player's own losses produce a toast. `victim === undefined` cannot be
 * claimed as mine, so it is skipped rather than assumed. Evaluate on the MAIN THREAD ONLY:
 * `world.localPlayerId` has three writers, one of them `workerSim.ts:201`, so the worker's copy is
 * not authoritative for "who is looking at this screen". This function is only ever reached from a
 * renderer, which is main-thread by construction.
 *
 * SUPPRESSION IS TWO CLAUSES, AND THE SECOND IS NOT REDUNDANT:
 *   (a) `actor === victim` — you cut your own bond on purpose; narrating it is noise.
 *   (b) `cause === 'bomb'` unconditionally. It looks like a special case of (a) and is not:
 *       `bombLifecycle.ts:110` selects its kill set on the MUTABLE `placerColor`, while (a)
 *       compares the READONLY `placedBy`. After a rainbow shuffle those two disagree, so a bomb
 *       can destroy a bond whose `placedBy` is someone else and (a) would fire a toast blaming the
 *       bomb's picker for collateral they did not aim at. Owner ruled SUPPRESS (S130 F3-C); the
 *       show-it variant is a one-line flip here if a playtest wants it.
 */
export function captureSeverToast(
  effects: readonly GameEffect[],
  localPlayerId: PlayerId,
  botSeats: ReadonlySet<PlayerId>,
): SeverToastCapture {
  let count = 0;
  let cause: SeverCause | null = null;
  let mixedCause = false;
  let actor: PlayerId | undefined;
  let mixedActor = false;

  for (const e of effects) {
    if (e.kind !== 'BOND_SEVERED') continue;
    if (e.victim === undefined || e.victim !== localPlayerId) continue; // victim gate
    if (e.cause === 'bomb') continue; // suppression (b)
    if (e.actor !== undefined && e.actor === e.victim) continue; // suppression (a)

    if (count === 0) {
      cause = e.cause;
      actor = e.actor;
    } else {
      if (e.cause !== cause) mixedCause = true;
      if (e.actor !== actor) mixedActor = true;
    }
    count++;
  }

  if (count === 0 || cause === null) return NO_CAPTURE;

  // A mixed batch names nobody. An unattributed single (physics) also names nobody, but keeps its
  // own cause so the copy can still say WHY. Written as a statement rather than a ternary so the
  // non-undefined narrowing of `actor` is obvious to a reader as well as to the compiler.
  let agent: string | null = null;
  if (!mixedActor && actor !== undefined) agent = seatLabel(actor, botSeats);

  return { text: severToastCopy(mixedCause ? null : cause, agent, count), count };
}

/** P3 (S131) — toast plate padding. Larger than the banner's because the font is 30px bold. */
const TOAST_PLATE_PAD_X = 16;
const TOAST_PLATE_PAD_Y = 7;

export class SeverToastRenderer {
  private readonly container: Container;
  /**
   * P3 (S131) — inner group holding plate + text, positioned at the toast's centre with BOTH
   * children centred on its local origin.
   *
   * WHY THE EXTRA CONTAINER. The pop-in animates `scale`. Scaling the text alone would leave the
   * plate at full size behind a growing label; scaling the OUTER container would scale about (0,0),
   * i.e. the top-left of the screen, dragging the toast diagonally in from the corner. Scaling this
   * group scales both about the toast's own centre, which is the only one of the three that looks
   * like one object growing in place.
   */
  private readonly group: Container;
  private readonly plate: Graphics;
  private readonly text: Text;
  /** Sim tick the current window started on; undefined ⇒ no window in flight. */
  private shownTick: number | undefined = undefined;

  constructor(app: Application) {
    this.container = new Container();
    this.container.eventMode = 'none';
    this.container.visible = false;
    this.group = new Container();
    this.group.position.set(CANVAS_WIDTH / 2, TOAST_Y);
    this.container.addChild(this.group);
    // Plate first: child-add order puts it behind the text (the betaBadgePlate idiom).
    this.plate = new Graphics();
    this.group.addChild(this.plate);
    this.text = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 30,
        fontWeight: 'bold',
        // Warm red-orange: this is the one HUD line that reports damage TO the reader. Distinct
        // from the combo toast's gold (0xffe066) so the two never read as the same event.
        fill: 0xff6b4a,
        stroke: { color: 0x000000, width: 4 },
        align: 'center',
      }),
    });
    // Centred on the GROUP's local origin, not on screen coords — the group carries the position,
    // so plate and text share one transform and cannot drift apart.
    this.text.anchor.set(0.5);
    this.text.position.set(0, 0);
    this.group.addChild(this.text);
    app.stage.addChild(this.container);
  }

  /** True while a window is rendering (DEV/e2e probe, `ComboToastRenderer.isActive` precedent). */
  isActive(): boolean {
    return this.container.visible;
  }

  /**
   * PRE-WIPE. Must be called before `effectsRenderer.sync(world)` — see the file header.
   *
   * Capture first, then pose. A fresh capture RESTARTS the window (overwrite = restart, the
   * combo-toast rule): the newest loss is the one worth reading, and a batch already coalesces
   * everything that landed in the same frame into one line with a count.
   */
  drainSeverToast(world: World): void {
    if (world.gameState !== 'PLAYING') {
      // Every match transition passes through a non-PLAYING state, so this is also the
      // between-matches reset — without it a window in flight at match end would resume over the
      // next match's board (the stale-watermark bug the tier banner had to fix in S129 CHECK).
      this.shownTick = undefined;
      this.container.visible = false;
      return;
    }

    const cap = captureSeverToast(world.effects, world.localPlayerId, world.botSeats);
    if (cap.text !== null) {
      this.text.text = cap.text;
      this.shownTick = world.tick;
      // P3 (S131) — resize the plate to the new label. Only here can the text change, and Pixi v8
      // Text measures synchronously so .width/.height are already correct for the string just set.
      // Both are centred on the group origin, hence the -w/2, -h/2 offsets.
      const w = this.text.width + TOAST_PLATE_PAD_X * 2;
      const h = this.text.height + TOAST_PLATE_PAD_Y * 2;
      this.plate.clear().roundRect(-w / 2, -h / 2, w, h, 9).fill(HUD_PLATE_FILL);
    }

    const pose =
      this.shownTick === undefined
        ? INACTIVE_POSE
        : severToastPose(world.tick - this.shownTick, SEVER_TOAST_DURATION_TICKS);

    if (!pose.active) {
      if (this.shownTick !== undefined) this.shownTick = undefined;
      this.container.visible = false;
      return;
    }
    this.container.visible = true;
    this.container.alpha = pose.alpha;
    // Scale the GROUP, not the text: plate and label grow together about the toast's own centre.
    this.group.scale.set(pose.scale);
  }
}
