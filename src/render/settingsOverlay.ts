/**
 * SPARK — settings overlay (S19 P1).
 *
 * Lightweight HTML overlay providing per-channel mute toggles + volume
 * sliders for music and SFX. Mirrors the lobbyScreen.ts HTMLInputElement
 * pattern (position:fixed, z-index:1000, lazy-attached on construction).
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
  setSfxMuted,
  setSfxVolume,
} from './audioManager.ts';

export interface SettingsOverlayHandle {
  show(): void;
  hide(): void;
  toggle(): void;
  isVisible(): boolean;
  destroy(): void;
}

export function createSettingsOverlay(): SettingsOverlayHandle {
  const root = document.createElement('div');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Audio settings');
  root.style.position = 'fixed';
  root.style.top = '60px';
  root.style.right = '24px';
  root.style.zIndex = '1000';
  root.style.display = 'none';
  root.style.fontFamily = 'monospace';
  root.style.fontSize = '13px';
  root.style.color = '#ffffff';
  root.style.background = 'rgba(0, 0, 0, 0.85)';
  root.style.border = '1px solid #3bd7ff';
  root.style.borderRadius = '6px';
  root.style.padding = '12px 14px 10px 14px';
  root.style.minWidth = '220px';
  root.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.5)';

  // Header row: title + ✕ close
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '10px';
  header.style.borderBottom = '1px solid rgba(59, 215, 255, 0.3)';
  header.style.paddingBottom = '6px';

  const title = document.createElement('span');
  title.textContent = 'AUDIO';
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
  closeBtn.style.padding = '0 4px';
  closeBtn.style.fontFamily = 'monospace';

  header.appendChild(title);
  header.appendChild(closeBtn);
  root.appendChild(header);

  const musicRow = createChannelRow('Music', 'music');
  const sfxRow = createChannelRow('SFX', 'sfx');
  root.appendChild(musicRow.el);
  root.appendChild(sfxRow.el);

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

  // Stop keydown propagation inside the overlay (PRIME-AUDIT #3): typing
  // into a focused slider should not trigger the canvas 'M' mute handler.
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hide();
      return;
    }
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
      if (e.key === 'Escape') {
        hide();
      }
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
