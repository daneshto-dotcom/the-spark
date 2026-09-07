/**
 * SPARK — S165: DISPLAY PREFERENCES, the ones that are nobody else's business.
 *
 * > Owner, 2026-09-07: *"on the top right on the settings button i want to add race
 * > background/cosmos black background toggle so players can turn on the original black background
 * > instead of their races if they wish."*
 *
 * ⛔ WHY A MODULE AND NOT A CONSTRUCTOR ARGUMENT. `settingsOverlay` is built at `main.ts:354` and
 * `zoneBackgroundRenderer` at `main.ts:566` — 212 lines apart in one `bootstrap()` scope. Handing
 * the renderer to the overlay would mean reordering two unrelated constructions, and handing a
 * callback the other way would mean a late-bound setter nobody can find. A tiny store both sides
 * read is the shape this project already uses three times over — `codexStore.ts`,
 * `comboCodexStore.ts`, `arcadeScores.ts`.
 *
 * ⛔ AND IT MUST NEVER REACH THE WIRE OR THE HASH. `zoneBackgroundRenderer`'s own docblock already
 * settles the principle: *"this is a display preference, it must never reach the wire or the hash,
 * and two peers may legitimately disagree about it."* Nothing here is serialized, nothing here is in
 * `FIELD_COVERAGE`, and there is no protocol bump — one player choosing a black board must not
 * change what anybody else sees.
 *
 * ⚠ EVERY ACCESS IS TRY/CAUGHT, and that is not defensive padding — `localStorage` THROWS on access
 * in a Safari private window and in a browser set to block site data, and the accessor itself can
 * throw during thumbnail capture. `audioManager`'s `readBool`/`writeKey` wrap for the same reason.
 * A store that cannot read its own value must still return a usable default.
 */

const STORAGE_KEY_ZONE_BG = 'display.zoneBackgroundEnabled';

/**
 * Race backdrops ON by default — the owner asked for a way back to the black board, which means the
 * art is the normal state and cosmos black is the opt-out.
 */
const DEFAULT_ZONE_BG = true;

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === 'true';
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /*
     * Deliberately silent, and the failure mode is benign by design: the toggle still works for
     * this session (the caller applies the value immediately), it simply will not be remembered.
     * Refusing to honour a click because we cannot persist it would be the worse outcome.
     */
  }
}

/** Should each seat's quarter show its race's world, or the original black board? */
export function isZoneBackgroundEnabled(): boolean {
  return readBool(STORAGE_KEY_ZONE_BG, DEFAULT_ZONE_BG);
}

export function setZoneBackgroundEnabled(value: boolean): void {
  writeBool(STORAGE_KEY_ZONE_BG, value);
}
