/**
 * SPARK — settings overlay (S19 P1).
 *
 * Lightweight HTML overlay providing per-channel mute toggles + volume
 * sliders for music and SFX. Mirrors the lobbyScreen.ts HTMLInputElement
 * pattern (position:fixed, z-index:1000, lazy-attached on construction).
 *
 * S165 - IT ALSO CARRIES THE TWO OWNER TOGGLES NOW, and this is deliberately the place for them
 * rather than the HUD. Three separate guards make a third top-right Pixi glyph a bad idea:
 * `ui.ts` registers the two audio glyphs as ONE 34 px band and `hudLayout.test.ts` asserts no
 * two registered rects overlap; `zones-visual.spec.ts`'s TITLE allowlist names the existing
 * glyphs literally, so a third is reported as a leaked gameplay instrument and turns the
 * DEPLOY-GATING e2e subset red; and `exitButton.ts` records that the energy gauge and progress
 * rail already own that edge from y=80 down. This HTML panel has no geometry contract at all,
 * which is exactly why it is the right home.
 *
 * Show/hide via .show()/.hide()/.toggle(). Closes on:
 *   - ✕ button click
 *   - ESC keydown (anywhere)
 *   - click outside the overlay panel
 *
 * Keydown events INSIDE the overlay stopPropagation so typing/sliding does
 * not bubble to the canvas-bound 'M' handler (PRIME-AUDIT #3).
 *
 * Re-reads + writes audioManager state on every interaction, so the panel
 * always reflects the canonical store.
 */

import {
  getAudioSettings,
  setMusicMuted,
  setMusicVolume,
  setRaceMusicEnabled,
  setSfxMuted,
  setSfxVolume,
} from './audioManager.ts';
import { GRAPHICS_TIERS, getGraphicsTier, isZoneBackgroundEnabled, setGraphicsTier, setZoneBackgroundEnabled, type GraphicsTier } from './displayPrefs.ts';

/**
 * ⭐ S189 fix round (audit NET-3) — the settings panel's Escape: close it. Used by BOTH of its Escape
 * listeners (the panel root and the document), which run before `main.ts`'s window-level double-Escape
 * "leave the match" handler — so the press must be marked consumed.
 */
export function closeSettingsOnEscape(
  e: { key: string; preventDefault?: () => void },
  hide: () => void,
): boolean {
  if (e.key !== 'Escape') return false;
  hide();
  if (typeof e.preventDefault === 'function') e.preventDefault(); // consumed: not a leave press
  return true;
}

export interface SettingsOverlayHandle {
  show(): void;
  hide(): void;
  toggle(): void;
  isVisible(): boolean;
  destroy(): void;
}

/**
 * ⭐ S194 T5 — the hover / press / focus states a DOM control needs (inline styles cannot express
 * them). Installed once; scoped to `.spark-settings`, so nothing else on the page is touched.
 */
function installSettingsSkinCss(): void {
  if (document.getElementById('spark-settings-skin') !== null) return;
  const css = document.createElement('style');
  css.id = 'spark-settings-skin';
  css.textContent = [
    '.spark-settings-close{border-radius:6px;transition:background .12s,transform .08s,color .12s}',
    '.spark-settings-close:hover{background:rgba(59,215,255,.18)!important;color:#3bd7ff!important}',
    '.spark-settings-close:active{transform:scale(.92)}',
    '.spark-settings input[type=checkbox]{transition:transform .08s,filter .12s}',
    '.spark-settings input[type=checkbox]:hover{filter:drop-shadow(0 0 4px #3bd7ff)}',
    '.spark-settings input[type=checkbox]:active{transform:scale(.9)}',
    '.spark-settings input[type=range]{accent-color:#3bd7ff;transition:filter .12s}',
    '.spark-settings input[type=range]:hover{filter:drop-shadow(0 0 4px rgba(59,215,255,.7))}',
    // Keyboard focus is visible on every control (the "focus states" the docblock promises).
    '.spark-settings button:focus-visible,.spark-settings input:focus-visible{outline:2px solid #3bd7ff;outline-offset:2px;box-shadow:0 0 6px rgba(59,215,255,.6)}',
  ].join(' ');
  document.head.appendChild(css);
}

export function createSettingsOverlay(): SettingsOverlayHandle {
  const root = document.createElement('div');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Settings');
  root.style.position = 'fixed';
  root.style.top = '60px';
  root.style.right = '24px';
  root.style.zIndex = '1000';
  root.style.display = 'none';
  root.style.fontFamily = 'monospace';
  root.style.fontSize = '13px';
  root.style.color = '#ffffff';
  // ⭐ S194 T5 — the same "forged glass" as the canvas panels: a lit-from-above gradient, an inner
  // bevel, a soft cyan glow, and a blur of the board behind it. Attributes and roles are unchanged.
  root.className = 'spark-settings';
  root.style.background = 'linear-gradient(180deg, rgba(24, 34, 52, 0.94) 0%, rgba(9, 13, 22, 0.94) 55%, rgba(8, 26, 36, 0.94) 100%)';
  root.style.border = '1px solid #3bd7ff';
  root.style.borderRadius = '10px';
  root.style.padding = '12px 14px 10px 14px';
  root.style.minWidth = '240px';
  root.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.6), 0 0 18px rgba(59, 215, 255, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.14)';
  root.style.backdropFilter = 'blur(4px)';
  installSettingsSkinCss();

  // Header row: title + ✕ close
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '10px';
  header.style.borderBottom = '1px solid rgba(59, 215, 255, 0.3)';
  header.style.paddingBottom = '6px';

  const title = document.createElement('span');
  // S165 - no longer only audio: the panel now carries the race-background display toggle too.
  title.textContent = 'SETTINGS';
  title.style.letterSpacing = '0.2em';
  title.style.color = '#3bd7ff';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Close settings');
  closeBtn.style.background = 'transparent';
  closeBtn.style.border = 'none';
  closeBtn.style.color = '#ffffff';
  closeBtn.style.fontSize = '14px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.padding = '0 6px';
  closeBtn.className = 'spark-settings-close';
  closeBtn.style.fontFamily = 'monospace';

  header.appendChild(title);
  header.appendChild(closeBtn);
  root.appendChild(header);

  const musicRow = createChannelRow('Music', 'music');
  const sfxRow = createChannelRow('SFX', 'sfx');
  root.appendChild(musicRow.el);
  root.appendChild(sfxRow.el);

  /*
   * S165 - THE TWO OWNER TOGGLES.
   *
   * Checkbox-only rows rather than `createChannelRow`: neither of these has a magnitude, so a
   * slider would be a lie about what the control does.
   */
  const divider = document.createElement('div');
  divider.style.height = '1px';
  divider.style.margin = '10px 0 8px';
  divider.style.background = 'rgba(59, 215, 255, 0.25)';
  root.appendChild(divider);

  const raceMusicRow = createToggleRow('Race music', 'race-music');
  const zoneBgRow = createToggleRow('Race background', 'zone-bg');
  root.appendChild(raceMusicRow.el);
  root.appendChild(zoneBgRow.el);
  /*
   * ⭐⭐ S195 N17 (owner) — THE GRAPHICS TIER, replacing S192's "High-quality effects" box. *"when my brother
   * toggled it, it didn't really change anything … So he kept lagging"* — that box only removed two filter
   * passes. The three tiers are described in `render/graphicsTier.ts`; main.ts polls the store every frame,
   * so a click is on screen on the next frame (no reload), and the choice is remembered per viewer.
   */
  const tierRow = createTierRow();
  root.appendChild(tierRow.el);

  // Footer hint
  const hint = document.createElement('div');
  hint.textContent = "press 'M' for global pause";
  hint.style.marginTop = '8px';
  hint.style.fontSize = '10px';
  hint.style.color = 'rgba(255, 255, 255, 0.45)';
  hint.style.letterSpacing = '0.1em';
  root.appendChild(hint);

  document.body.appendChild(root);

  // Sync controls FROM audioManager state.
  function refresh(): void {
    const s = getAudioSettings();
    musicRow.muteCheckbox.checked = !s.musicMuted;
    musicRow.volumeSlider.value = String(Math.round(s.musicVolume * 100));
    sfxRow.muteCheckbox.checked = !s.sfxMuted;
    sfxRow.volumeSlider.value = String(Math.round(s.sfxVolume * 100));
    /*
     * S165 - READ ON EVERY SHOW, like the four above. Skipping this is the quiet failure the
     * scouting pass warned about: the panel would open showing a stale checkbox with nothing
     * failing anywhere. Both values are read from their own store, never from a local cache.
     */
    raceMusicRow.checkbox.checked = s.raceMusicEnabled;
    zoneBgRow.checkbox.checked = isZoneBackgroundEnabled();
    tierRow.set(getGraphicsTier());
  }

  // Wire interactions.
  musicRow.muteCheckbox.addEventListener('change', () => {
    setMusicMuted(!musicRow.muteCheckbox.checked);
  });
  musicRow.volumeSlider.addEventListener('input', () => {
    setMusicVolume(Number(musicRow.volumeSlider.value) / 100);
  });
  sfxRow.muteCheckbox.addEventListener('change', () => {
    setSfxMuted(!sfxRow.muteCheckbox.checked);
  });
  sfxRow.volumeSlider.addEventListener('input', () => {
    setSfxVolume(Number(sfxRow.volumeSlider.value) / 100);
  });
  raceMusicRow.checkbox.addEventListener('change', () => {
    /*
     * The SETTER only records the preference. Re-resolving it against the local player's race is
     * `main.ts`'s job, because `audioManager` must not read `world` - and main.ts applies it on
     * the very next frame, so the swap is audible immediately rather than at the next match.
     */
    setRaceMusicEnabled(raceMusicRow.checkbox.checked);
  });
  zoneBgRow.checkbox.addEventListener('change', () => {
    // Same shape: persist here, and main.ts's render loop hands it to the renderer next frame.
    setZoneBackgroundEnabled(zoneBgRow.checkbox.checked);
  });
  tierRow.onChange((tier) => {
    setGraphicsTier(tier);
    tierRow.set(tier);
  });

  // Stop keydown propagation inside the overlay (PRIME-AUDIT #3): typing
  // into a focused slider should not trigger the canvas 'M' mute handler.
  root.addEventListener('keydown', (e) => {
    if (closeSettingsOnEscape(e, hide)) return;
    e.stopPropagation();
  });

  // Close button click.
  closeBtn.addEventListener('click', hide);

  // Outside-click close. Bound at document level only while overlay is open;
  // we attach/detach in show()/hide() to avoid leaking handlers.
  let outsideClickHandler: ((e: MouseEvent) => void) | null = null;
  let escHandler: ((e: KeyboardEvent) => void) | null = null;

  let visible = false;

  function show(): void {
    if (visible) return;
    refresh();
    root.style.display = 'block';
    visible = true;

    outsideClickHandler = (e) => {
      if (e.target instanceof Node && !root.contains(e.target)) {
        hide();
      }
    };
    escHandler = (e) => {
      closeSettingsOnEscape(e, hide);
    };
    // mousedown not click — click can fire after the open-trigger's tap, and
    // would immediately re-close. mousedown is more reliable here.
    document.addEventListener('mousedown', outsideClickHandler);
    document.addEventListener('keydown', escHandler);
  }

  function hide(): void {
    if (!visible) return;
    root.style.display = 'none';
    visible = false;
    if (outsideClickHandler !== null) {
      document.removeEventListener('mousedown', outsideClickHandler);
      outsideClickHandler = null;
    }
    if (escHandler !== null) {
      document.removeEventListener('keydown', escHandler);
      escHandler = null;
    }
  }

  function toggle(): void {
    if (visible) hide();
    else show();
  }

  function isVisible(): boolean {
    return visible;
  }

  function destroy(): void {
    hide();
    if (root.parentNode !== null) root.parentNode.removeChild(root);
  }

  return { show, hide, toggle, isVisible, destroy };
}

interface ChannelRow {
  el: HTMLDivElement;
  muteCheckbox: HTMLInputElement;
  volumeSlider: HTMLInputElement;
}

/**
 * S165 - a LABEL + CHECKBOX row, for a preference that is on or off and has no magnitude.
 *
 * Same 60px label column as `createChannelRow` so the four rows line up, but the slider column is
 * dropped rather than disabled: an inert slider reads as a broken control.
 */
interface ToggleRow {
  el: HTMLDivElement;
  checkbox: HTMLInputElement;
}

function createToggleRow(label: string, idPrefix: string): ToggleRow {
  const el = document.createElement('div');
  el.style.display = 'grid';
  el.style.gridTemplateColumns = '1fr 28px';
  el.style.alignItems = 'center';
  el.style.gap = '8px';
  el.style.marginTop = '6px';

  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  labelEl.htmlFor = `${idPrefix}-toggle`;
  labelEl.style.fontSize = '11px';
  labelEl.style.letterSpacing = '0.08em';
  labelEl.style.color = 'rgba(255, 255, 255, 0.8)';
  labelEl.style.cursor = 'pointer';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = `${idPrefix}-toggle`;
  checkbox.style.cursor = 'pointer';
  checkbox.style.accentColor = '#3bd7ff';

  el.appendChild(labelEl);
  el.appendChild(checkbox);
  return { el, checkbox };
}

/** S195 N17 — what each tier tells the player, in one line (the help text under the choice). */
export const GRAPHICS_TIER_HINT: Readonly<Record<GraphicsTier, string>> = {
  HIGH: 'Full effects: glow, ripples, animated connectors.',
  LOW: 'No glow or ripples; connectors redrawn only when they change.',
  MINIMAL: 'For slow computers: classic effects, still connectors.',
};

interface TierRow {
  el: HTMLDivElement;
  set(tier: GraphicsTier): void;
  onChange(cb: (tier: GraphicsTier) => void): void;
}

/**
 * S195 N17 — a LABELLED THREE-WAY CHOICE, not a checkbox: the owner asked for tiers *"for different tiers of
 * machines"*, and a box that says "on" cannot say which. Radio inputs (`#gfx-high`, `#gfx-low`,
 * `#gfx-minimal`, one `name`) so the keyboard and screen readers get the standard behaviour for free.
 */
function createTierRow(): TierRow {
  const el = document.createElement('div');
  el.style.marginTop = '6px';
  const title = document.createElement('div');
  title.textContent = 'Graphics';
  title.style.fontSize = '11px';
  title.style.letterSpacing = '0.08em';
  title.style.color = 'rgba(255, 255, 255, 0.8)';
  el.appendChild(title);
  const choices = document.createElement('div');
  choices.setAttribute('role', 'radiogroup');
  choices.setAttribute('aria-label', 'Graphics quality');
  choices.style.display = 'flex';
  choices.style.gap = '10px';
  choices.style.marginTop = '4px';
  el.appendChild(choices);
  const inputs = new Map<GraphicsTier, HTMLInputElement>();
  for (const tier of GRAPHICS_TIERS) {
    const id = `gfx-${tier.toLowerCase()}`;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'graphics-tier';
    input.id = id;
    input.value = tier;
    input.style.cursor = 'pointer';
    input.style.accentColor = '#3bd7ff';
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = tier;
    label.style.fontSize = '11px';
    label.style.letterSpacing = '0.06em';
    label.style.color = 'rgba(255, 255, 255, 0.85)';
    label.style.cursor = 'pointer';
    label.style.marginLeft = '3px';
    const wrap = document.createElement('span');
    wrap.appendChild(input);
    wrap.appendChild(label);
    choices.appendChild(wrap);
    inputs.set(tier, input);
  }
  const hint = document.createElement('div');
  hint.id = 'gfx-hint';
  hint.style.fontSize = '10px';
  hint.style.marginTop = '3px';
  hint.style.color = 'rgba(255, 255, 255, 0.5)';
  el.appendChild(hint);
  return {
    el,
    set(tier) {
      for (const [t, input] of inputs) input.checked = t === tier;
      hint.textContent = GRAPHICS_TIER_HINT[tier];
    },
    onChange(cb) {
      for (const [t, input] of inputs) input.addEventListener('change', () => { if (input.checked) cb(t); });
    },
  };
}

function createChannelRow(label: string, idPrefix: string): ChannelRow {
  const row = document.createElement('div');
  row.style.display = 'grid';
  row.style.gridTemplateColumns = '60px 28px 1fr';
  row.style.alignItems = 'center';
  row.style.gap = '8px';
  row.style.marginBottom = '6px';

  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  labelEl.htmlFor = `${idPrefix}-mute`;
  labelEl.style.letterSpacing = '0.05em';

  // Mute checkbox: CHECKED means "on" (un-muted). Inverse of internal state,
  // because UX expects "on" toggles.
  const mute = document.createElement('input');
  mute.type = 'checkbox';
  mute.id = `${idPrefix}-mute`;
  mute.setAttribute('aria-label', `${label} on/off`);
  mute.style.accentColor = '#3bd7ff';
  mute.style.width = '16px';
  mute.style.height = '16px';
  mute.style.cursor = 'pointer';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.step = '1';
  slider.id = `${idPrefix}-volume`;
  slider.setAttribute('aria-label', `${label} volume`);
  slider.style.width = '100%';
  slider.style.accentColor = '#3bd7ff';
  slider.style.cursor = 'pointer';

  row.appendChild(labelEl);
  row.appendChild(mute);
  row.appendChild(slider);

  return { el: row, muteCheckbox: mute, volumeSlider: slider };
}
