/**
 * SPARK — S192 T15 (H2): THE SFX VOICE CAP, as a pure ledger.
 *
 * > Owner, S192 playtest (T15): *"At wave eight, the music and sound stopped for a few seconds."*
 *
 * ⛔ THERE WAS NO GLOBAL VOICE CAP. Every `BOND_FORMED` effect built its own clave graph (a blueprint
 * stamp forms many bonds in ONE tick), every Voltkin chain link a crackle, every boom / charge /
 * splat / zap / laser its own oscillator + filter + gain + panner. The only cap anywhere was
 * `MAX_GNAW_VOICES = 3` in `chewerRenderer.ts`. A burst of identical voices on one frame adds no
 * information the player can hear — and audio-thread overload is the one hypothesis in the research
 * that silences music AND sound together, which is what he reported.
 *
 * A VOICE is one SFX event's whole graph (one clave = 2 oscillators + gain + panner = 1 voice). The
 * ledger remembers when each admitted voice ends, in `AudioContext.currentTime` seconds, and refuses a
 * new one when either the global or that kind's concurrency is full. Refusing is SKIPPING the sound,
 * never queueing it: a late clave is worse than none.
 *
 * ⭐ DETERMINISM: CLIENT-ONLY PRESENTATION. Nothing here reads or writes the world; the clock is the
 * audio context's, not `world.tick`. `audioSimBoundary.test.ts` walks the sim's import graph and fails
 * if this module (or `audioManager.ts`) is ever reachable from it.
 *
 * Pure: no AudioContext, no DOM. `sfxVoices.test.ts` drives it with plain numbers.
 */

/** Every SFX voice kind `audioManager` admits. A new SFX function picks one (or adds one here). */
export type SfxKind =
  | 'clave' | 'fart' | 'charge' | 'boom'
  | 'gnaw' | 'splat' | 'zap' | 'laser'
  | 'oneShot' | 'crackle' | 'ui' | 'latchedVoice';

/*
 * ⭐ S192 audit A1/A2 — TWO KINDS THE CAP NEVER REFUSES.
 *
 * `latchedVoice`: a once-per-match recorded voice (the rainbow yell, the Voltkin cutscene voice). Its
 * caller latches BEFORE it plays, so a refusal is not "a late sound skipped" — it is the line never
 * heard that match. The audit reproduced it: six Voltkin crackles in one tick filled the shared
 * `oneShot` pool and the yell was refused for good while its 2.7 s music duck still fired.
 * `ui`: a click's accept/refuse sound is the player's only "did that register" signal (S152 A5).
 *
 * Both are admitted unconditionally and are NOT booked into the global pool, so they neither get
 * refused by it nor take a slot from anything else. They are rare by construction (once per match /
 * once per click), which is what makes that safe.
 */
export const SFX_UNCAPPED_KINDS: ReadonlySet<SfxKind> = new Set<SfxKind>(['ui', 'latchedVoice']);

/**
 * ⚠ MINE (S192). Concurrent SFX voices across every kind. Each voice is 3–6 Web Audio nodes, so 32
 * voices is ≤ ~190 live nodes — comfortably inside what a phone renders — while a wave-8 burst that
 * used to build hundreds of graphs in one frame can no longer starve the render quantum.
 */
export const SFX_MAX_VOICES = 32;

/**
 * ⚠ MINE (S192). Per-kind concurrency. Small on purpose: the fourth simultaneous clave is not audible
 * as a fourth clave, only as louder. `gnaw` matches `chewerRenderer`'s existing MAX_GNAW_VOICES = 3.
 * `oneShot` (recorded samples other than the crackle and the latched voices — today Helga's slap) gets
 * the most room because those are the authored, owner-auditioned sounds.
 *
 * ⛔ A `Record`, never a partial map — a new `SfxKind` must fail `tsc` here, not fall through uncapped.
 */
export const SFX_KIND_MAX_VOICES: Readonly<Record<SfxKind, number>> = {
  clave: 4,
  fart: 4,
  charge: 4,
  boom: 4,
  gnaw: 3,
  splat: 4,
  zap: 4,
  laser: 4,
  oneShot: 6,
  // S192 audit A1 — the Voltkin lightning crackle, split out of `oneShot` so a chain severing six
  // bonds cannot occupy the pool every other recorded sample (Helga's slap) shares. ⚠ MINE.
  crackle: 4,
  // Uncapped (see SFX_UNCAPPED_KINDS) — never consulted, Infinity so it can never be the reason.
  ui: Number.POSITIVE_INFINITY,
  latchedVoice: Number.POSITIVE_INFINITY,
};

export interface SfxVoiceStats {
  /** Voices still sounding at the last `admit` / `liveAt` call. */
  readonly live: number;
  /** Highest `live` ever observed after an admit — the "how bad did the burst get" reading. */
  readonly peakLive: number;
  readonly admitted: number;
  /** Refused because the GLOBAL cap was full. */
  readonly droppedGlobal: number;
  /** Refused because THAT KIND's cap was full, keyed by kind. */
  readonly droppedByKind: Readonly<Partial<Record<SfxKind, number>>>;
}

/** The ledger. One instance per audio module; reset with the module's test reset. */
export class SfxVoiceLedger {
  private readonly ends: Array<{ kind: SfxKind; end: number }> = [];
  private peak = 0;
  private admittedCount = 0;
  private droppedGlobalCount = 0;
  private readonly droppedKind: Partial<Record<SfxKind, number>> = {};

  constructor(
    private readonly maxVoices: number = SFX_MAX_VOICES,
    private readonly kindMax: Readonly<Record<SfxKind, number>> = SFX_KIND_MAX_VOICES,
  ) {}

  /** Forget every voice that has finished by `now`. */
  private prune(now: number): void {
    let w = 0;
    for (let r = 0; r < this.ends.length; r++) {
      const v = this.ends[r]!;
      if (v.end > now) this.ends[w++] = v;
    }
    this.ends.length = w;
  }

  /**
   * May a `kind` voice lasting `durationS` start at context time `now`? True = admitted and booked;
   * false = the caller must NOT build the graph. A non-finite or negative duration books zero length.
   */
  admit(kind: SfxKind, now: number, durationS: number): boolean {
    this.prune(now);
    if (SFX_UNCAPPED_KINDS.has(kind)) {
      this.admittedCount += 1;
      return true; // never refused, never booked (see SFX_UNCAPPED_KINDS)
    }
    if (this.ends.length >= this.maxVoices) {
      this.droppedGlobalCount += 1;
      return false;
    }
    let ofKind = 0;
    for (const v of this.ends) if (v.kind === kind) ofKind += 1;
    if (ofKind >= this.kindMax[kind]) {
      this.droppedKind[kind] = (this.droppedKind[kind] ?? 0) + 1;
      return false;
    }
    const d = Number.isFinite(durationS) && durationS > 0 ? durationS : 0;
    this.ends.push({ kind, end: now + d });
    this.admittedCount += 1;
    if (this.ends.length > this.peak) this.peak = this.ends.length;
    return true;
  }

  /** Voices still sounding at `now`. */
  liveAt(now: number): number {
    this.prune(now);
    return this.ends.length;
  }

  stats(): SfxVoiceStats {
    return {
      live: this.ends.length,
      peakLive: this.peak,
      admitted: this.admittedCount,
      droppedGlobal: this.droppedGlobalCount,
      droppedByKind: { ...this.droppedKind },
    };
  }

  reset(): void {
    this.ends.length = 0;
    this.peak = 0;
    this.admittedCount = 0;
    this.droppedGlobalCount = 0;
    for (const k of Object.keys(this.droppedKind) as SfxKind[]) delete this.droppedKind[k];
  }
}
