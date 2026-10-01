/**
 * SPARK — S192 T15: THE SEAMLESS MUSIC LOOP, as pure math.
 *
 * > Owner, S192 playtest (T15): *"At wave eight, the music and sound stopped for a few seconds."*
 *
 * ⛔ EVERY SHIPPED MUSIC TRACK LOOPS STRAIGHT THROUGH DEAD AIR. `playMusic` looped the WHOLE decoded
 * buffer, and every cover ends (or starts) in silence. Measured with ffmpeg `silencedetect`
 * (-35 dB, 0.3 s) on the shipped files, S192:
 *
 *   default `blue-steppe-orbit.ogg`  384.97 s   2.62 s at the end
 *   demons                           261.69 s   3.74 s at the end
 *   vampires                         279.81 s   1.74 s end + 1.33 s start = 3.07 s across the seam
 *   orcs                             159.96 s   2.03 s at the end
 *   zombies                          208.77 s   1.54 s at the end
 *   nagas                            314.84 s   1.50 s at the start
 *   nonet-theme                      136.93 s   0.74 s at the end
 *   mummies                          307.37 s   none at the seam; 2.96 s INSIDE the track (39.4–42.4 s)
 *
 * A wave is 150 s, so the default track's third seam lands ~12 s into wave 8's FIGHT. The full table
 * (and the in-browser re-measurement) is in `.claude/plans/S192_PROGRESS_audio.md`.
 *
 * ⭐ THE FIX LEAVES THE ASSETS ALONE. Instead of re-encoding trimmed files, the loop REGION is derived
 * from the decoded PCM at runtime — `AudioBufferSourceNode.loopStart` / `loopEnd` set to the first and
 * last sample louder than {@link MUSIC_LOOP_SILENCE_DB}. Deriving it (rather than keeping a table of
 * seconds beside the URLs) means a replaced track can never ship with a stale loop point: there is
 * no number to forget to update.
 *
 * ⚠ The mummies mid-track gap is INSIDE the composition, so a loop region cannot touch it and this
 * module deliberately does not try. Whether it is intentional is the owner's ear, not ours.
 *
 * Pure, DOM-free, AudioContext-free — `musicLoop.test.ts` drives it with synthetic PCM.
 */

/**
 * ⚠ MINE (S192). Amplitude, in dBFS, below which a sample counts as silence when trimming the loop.
 * −40 dBFS = 0.01 full-scale. Chosen between the research's −35 dB detection threshold (which would
 * clip the start of a musical fade) and −50 dB (which leaves most of the dead air in): under the
 * default 0.25 music volume, −40 dBFS content is ~−52 dBFS at the speaker — inaudible under SFX —
 * and a jump from a ≤ 0.01 sample back to the head of the track is too small to click.
 */
export const MUSIC_LOOP_SILENCE_DB = -40;

/**
 * ⚠ MINE (S192). Edge silence shorter than this is left alone: a sub-100 ms tail is a natural decay,
 * not a gap anyone hears, and leaving it keeps a clean track's loop byte-identical to before.
 */
export const MUSIC_LOOP_MIN_TRIM_S = 0.1;

/**
 * ⚠ MINE (S192). Sanity floor. If trimming would leave less than this fraction of the track (or
 * under 1 s), the "silence" is the track (a near-silent or broken asset) and we loop it whole rather
 * than loop a sliver of it.
 */
export const MUSIC_LOOP_MIN_KEEP_FRACTION = 0.5;

/** The structural slice of an `AudioBuffer` the trimmer reads. A real `AudioBuffer` satisfies it. */
export interface PcmSource {
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  readonly length: number;
  getChannelData(channel: number): Float32Array;
}

/** A loop region in seconds, ready for `loopStart` / `loopEnd` and the `start(0, offset)` offset. */
export interface LoopRegion {
  readonly loopStart: number;
  readonly loopEnd: number;
}

/** dBFS → linear amplitude. */
export function dbToAmplitude(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * First and last sample index (inclusive) whose |amplitude| on ANY channel exceeds `threshold`, or
 * null when no sample does. Scans INWARD from each edge and stops at the first loud sample, so the
 * cost is the length of the silent edges, not of the track (~3.7 s worst case → ~360 k reads).
 */
export function findAudibleBounds(
  channels: ReadonlyArray<ArrayLike<number>>,
  threshold: number,
): { first: number; last: number } | null {
  if (channels.length === 0) return null;
  const len = channels[0]!.length;
  const loud = (i: number): boolean => {
    for (const ch of channels) {
      const v = ch[i]!;
      if (v > threshold || v < -threshold) return true;
    }
    return false;
  };
  let first = -1;
  for (let i = 0; i < len; i++) {
    if (loud(i)) { first = i; break; }
  }
  if (first < 0) return null;
  let last = first;
  for (let i = len - 1; i > first; i--) {
    if (loud(i)) { last = i; break; }
  }
  return { first, last };
}

/**
 * The loop region for a decoded music buffer, or null for "loop the whole buffer" (the pre-S192
 * behaviour). Null when: the buffer exposes no PCM (a test fake), it is empty, it is all silence,
 * neither edge carries at least {@link MUSIC_LOOP_MIN_TRIM_S} of silence, or the audible part is too
 * small to trust (see {@link MUSIC_LOOP_MIN_KEEP_FRACTION}).
 *
 * An edge with less than the minimum trim is left at its natural bound (0 or the buffer's end), so a
 * track that is only silent at one end is only trimmed at that end.
 */
export function computeLoopRegion(
  buffer: Partial<PcmSource> | null | undefined,
  silenceDb: number = MUSIC_LOOP_SILENCE_DB,
): LoopRegion | null {
  if (buffer === null || buffer === undefined) return null;
  const { numberOfChannels, sampleRate, length } = buffer;
  if (typeof buffer.getChannelData !== 'function') return null;
  if (typeof numberOfChannels !== 'number' || numberOfChannels < 1) return null;
  if (typeof sampleRate !== 'number' || !(sampleRate > 0)) return null;
  if (typeof length !== 'number' || length < 2) return null;

  const channels: Float32Array[] = [];
  for (let c = 0; c < numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  const bounds = findAudibleBounds(channels, dbToAmplitude(silenceDb));
  if (bounds === null) return null;

  const duration = length / sampleRate;
  const headSilence = bounds.first / sampleRate;
  // `last` is the last loud sample; the region ends AFTER it.
  const tailSilence = (length - 1 - bounds.last) / sampleRate;
  const trimHead = headSilence >= MUSIC_LOOP_MIN_TRIM_S;
  const trimTail = tailSilence >= MUSIC_LOOP_MIN_TRIM_S;
  if (!trimHead && !trimTail) return null;

  const loopStart = trimHead ? bounds.first / sampleRate : 0;
  const loopEnd = trimTail ? (bounds.last + 1) / sampleRate : duration;
  const kept = loopEnd - loopStart;
  if (kept < 1 || kept < duration * MUSIC_LOOP_MIN_KEEP_FRACTION) return null;
  return { loopStart, loopEnd };
}

/** Seconds of silence the loop plays through per lap: before (whole buffer) vs after (the region). */
export function seamSilenceSeconds(
  buffer: PcmSource,
  region: LoopRegion | null,
  silenceDb: number = MUSIC_LOOP_SILENCE_DB,
): number {
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  const startSample = region === null ? 0 : Math.round(region.loopStart * buffer.sampleRate);
  const endSample = region === null ? buffer.length : Math.round(region.loopEnd * buffer.sampleRate);
  const sliced = channels.map((ch) => ch.subarray(startSample, endSample));
  const bounds = findAudibleBounds(sliced, dbToAmplitude(silenceDb));
  const n = endSample - startSample;
  if (bounds === null) return n / buffer.sampleRate;
  return (bounds.first + (n - 1 - bounds.last)) / buffer.sampleRate;
}
