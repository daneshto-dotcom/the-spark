/**
 * SPARK — THE ONE SIM-WORKER FLAG PREDICATE (S143 P1).
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * The `?worker=` flag used to be parsed TWICE, independently, and the two readings did not
 * agree about what "the worker is active" means:
 *
 *   • `main.ts`         — `get('worker') === '1'`  ⇒ *should the driver be constructed?*
 *   • `probeHarness.ts` — `get('worker') === '1'`  ⇒ *must the probe refuse to arm?*
 *
 * Identical source text, and yet only the first one stays correct when the default flips.
 * With worker-on-by-default the param is **ABSENT**, so `=== '1'` is **false**, so the probe
 * harness ARMS WHILE THE WORKER IS ACTIVE — precisely the silent broken-instrument state that
 * guard was written to prevent. `SPAWN_SPARK` is absent from `CLIENT_INTENT_TYPES_RECORD`
 * while `PICKUP_SPARK` is present, so the probe's draw would be dropped by the worker and the
 * pickup would then reference a spark that does not exist in the authoritative world.
 *
 * That is not a bug in either call site. It is a bug in having two call sites: a guard phrased
 * against the *spelling of a URL parameter* silently stops tracking the *state it guards* the
 * moment the default moves. So both now ask the same question of the same function, and the
 * default lives in exactly one place.
 *
 * ⭐ THE FLIP IS NOW A ONE-CONSTANT CHANGE. Flipping `WORKER_DEFAULT_ON` to `true` moves every
 * consumer together, by construction. Do NOT reintroduce a literal `=== '1'` anywhere.
 *
 * ⚠ `?worker=0` DID NOT EXIST BEFORE THIS MODULE. Every read in the repo was `=== '1'`, so
 * while the worker is off-by-default the opt-out is merely unnecessary — but the instant the
 * default flips it becomes the ONLY escape hatch a player (or the owner mid-playtest) has.
 * Shipping the opt-out BEFORE the flip is deliberate: it means the flip cannot strand anyone.
 */

/** The URL parameter both call sites read. Never re-spell this literal at a call site. */
export const WORKER_FLAG_PARAM = 'worker';

/**
 * ⛔ THE FLIP LIVES HERE AND NOWHERE ELSE.
 *
 * `false` = the sim worker is opt-in via `?worker=1` (the shipped S122 posture).
 * `true`  = the sim worker is the default and `?worker=0` opts out.
 *
 * The default-on flip has been LOCKED since S129 and is gated on three measured items
 * (see BACKLOG "Sim-worker default-on"). Flipping this constant is the WHOLE change —
 * that is the point of routing every consumer through `isSimWorkerRequested`.
 */
export const WORKER_DEFAULT_ON = false;

/**
 * Does this URL want the sim worker?
 *
 * Explicit beats default in BOTH directions, so the flag is honest whichever way
 * `WORKER_DEFAULT_ON` is set:
 *   `?worker=1` ⇒ always ON   (opt IN  while the default is off)
 *   `?worker=0` ⇒ always OFF  (opt OUT while the default is on)
 *   absent, or any other value ⇒ `WORKER_DEFAULT_ON`
 *
 * An unrecognised value (`?worker=yes`, `?worker=`) deliberately falls through to the DEFAULT
 * rather than being treated as an opt-in. A typo must never silently hand a player a different
 * simulation than everyone else is running; the default is the well-defined, tested posture.
 *
 * @param search    a location search string, with or without the leading `?`
 * @param defaultOn the posture when the flag is absent or unrecognised. Production call sites
 *                  MUST omit this — it exists so the test suite can pin the behaviour of BOTH
 *                  regimes today, and therefore prove the flip is safe BEFORE it is taken. A
 *                  guard that is only ever exercised in the regime it already survives is how
 *                  the probe-harness inversion sat here undetected in the first place.
 */
export function isSimWorkerRequested(
  search: string,
  defaultOn: boolean = WORKER_DEFAULT_ON,
): boolean {
  const raw = new URLSearchParams(search).get(WORKER_FLAG_PARAM);
  if (raw === '1') return true;
  if (raw === '0') return false;
  return defaultOn;
}

/**
 * The browser-side convenience read. Returns `WORKER_DEFAULT_ON` outside a browser
 * (Node / SSR / vitest) rather than throwing on `window`, mirroring the guard idiom at
 * `constants.ts` `readTestSpawnRate` and `probeHarness.installProbeHarness`.
 */
export function isSimWorkerRequestedHere(): boolean {
  if (typeof window === 'undefined') return WORKER_DEFAULT_ON;
  return isSimWorkerRequested(window.location.search);
}
