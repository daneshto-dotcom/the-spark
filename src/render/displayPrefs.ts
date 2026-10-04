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

/*
 * ⭐ S192 `s192/visuals` — HIGH-QUALITY EFFECTS (bloom + ground ripples). Owner: *"upgrade the effects …
 * to the best of our abilities"*; the brief asked for a high/low switch in case bloom proves costly.
 * HIGH by default, because the upgrade is the point; LOW keeps every new particle and drops only the
 * two filter passes. Same rules as the backdrop toggle above: local, try/caught, never on the wire.
 */
const STORAGE_KEY_FX_HQ = 'display.fxHighQuality';
const DEFAULT_FX_HQ = true;

/*
 * ⭐⭐ S195 N17 (owner) — THE GRAPHICS TIER REPLACES THE ON/OFF SWITCH, BECAUSE THE SWITCH DID NOTHING.
 *
 * > *"there should be a low-end visual version of the game for slow computers … that toggle on-off should
 * > actually do something. Because when my brother toggled it, it didn't really change anything on the
 * > visuals for him … So he kept lagging … For different tiers of machines."*
 *
 * The old boolean (above) removed the bloom and the ripple filters and nothing else — its own docblock says
 * *"LOW keeps every new particle and drops only the two filter passes."* Measured S195 (`s195/lag`): on a
 * built board the frame is the structure renderer re-stroking every connector every frame, so HIGH, LOW and
 * legacy cost the same (53 / 50 / 51 ms at wave 5, 4× CPU throttle). The tiers attack that cost:
 *   · HIGH    — today's game, byte for byte. The default (R195-P1: *"one point four MS is fine. For better systems"*).
 *   · LOW     — no bloom/ripples (the old LOW) AND connectors drawn from a cache, redrawn only when they change.
 *   · MINIMAL — the pre-S192 effects (`?fx=legacy`'s look), connectors cached with their animations frozen.
 * Render-only, like everything in this file: never on the wire, never in a hash, two peers may differ.
 */
export type GraphicsTier = 'HIGH' | 'LOW' | 'MINIMAL';
export const GRAPHICS_TIERS: readonly GraphicsTier[] = ['HIGH', 'LOW', 'MINIMAL'];
const STORAGE_KEY_TIER = 'display.graphicsTier';

/**
 * The viewer's tier. A viewer who never chose one but had switched the old box OFF arrives on LOW, which is
 * what that box meant; everybody else on HIGH.
 */
export function getGraphicsTier(): GraphicsTier {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_TIER);
    if (raw === 'HIGH' || raw === 'LOW' || raw === 'MINIMAL') return raw;
  } catch {
    return 'HIGH';
  }
  return readBool(STORAGE_KEY_FX_HQ, DEFAULT_FX_HQ) ? 'HIGH' : 'LOW';
}

export function setGraphicsTier(tier: GraphicsTier): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_TIER, tier);
  } catch {
    /* benign, as `writeBool`: the session still applies it, it just is not remembered */
  }
}

/** Bloom + ripples on? Only on the HIGH tier. Kept for the fx lab and the renderers that ask. */
export function isFxHighQuality(): boolean {
  return getGraphicsTier() === 'HIGH';
}

/** The fx lab's old switch, mapped onto the tiers: on = HIGH, off = LOW. */
export function setFxHighQuality(value: boolean): void {
  writeBool(STORAGE_KEY_FX_HQ, value);
  setGraphicsTier(value ? 'HIGH' : 'LOW');
}
