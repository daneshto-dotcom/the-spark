/**
 * SPARK — S192 T15: a TEST-ONLY fake Web Audio bus rich enough to run every SFX function and every
 * music path in `audioManager.ts` under plain node.
 *
 * ⚠ A BUS, NOT A SYNTHESISER (same stance as the NONET block in `audioManager.test.ts`): it records
 * which scheduled-source nodes were built and started, with their loop settings, because node count
 * and loop region are the two properties T15 is about. ⛔ Never imported by production code.
 */

/** One AudioScheduledSourceNode the module built. */
export interface FakeSourceRecord {
  readonly kind: 'osc' | 'buffer';
  /** The `__url` of a music/sample buffer, or '<noise>' for an in-memory buffer. */
  url: string;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  /** `start(when, offset)` arguments, or null if never started. */
  startArgs: number[] | null;
}

export interface FakeAudioEnv {
  readonly sources: FakeSourceRecord[];
  /** Advance the fake context clock. */
  setTime(t: number): void;
  restore(): void;
}

/** A decodable fake buffer. With `pcm`, it also exposes real channel data for the loop trimmer. */
export interface FakeBufferSpec {
  readonly url: string;
  readonly pcm?: { readonly sampleRate: number; readonly channels: Float32Array[] };
}

export function installFakeAudio(
  buffers: (url: string) => FakeBufferSpec = (url) => ({ url }),
): FakeAudioEnv {
  const sources: FakeSourceRecord[] = [];
  const param = (): unknown => ({
    value: 0,
    setValueAtTime: (): void => {},
    exponentialRampToValueAtTime: (): void => {},
    linearRampToValueAtTime: (): void => {},
    setTargetAtTime: (): void => {},
    cancelScheduledValues: (): void => {},
  });
  const node = (): Record<string, unknown> => ({
    connect: (): void => {},
    disconnect: (): void => {},
    numberOfInputs: 1,
    numberOfOutputs: 1,
  });
  const ctx = {
    state: 'running',
    currentTime: 0,
    sampleRate: 48000,
    destination: {},
    resume: async (): Promise<void> => {},
    close: async (): Promise<void> => {},
    createGain: (): unknown => ({ ...node(), gain: param() }),
    createBiquadFilter: (): unknown => ({ ...node(), type: 'lowpass', frequency: param(), Q: param() }),
    createPanner: (): unknown => ({
      ...node(), positionX: param(), positionY: param(), positionZ: param(),
    }),
    createBuffer: (_ch: number, len: number, sr: number): unknown => {
      const data = new Float32Array(len);
      return { __url: '<noise>', length: len, sampleRate: sr, numberOfChannels: 1, duration: len / sr, getChannelData: () => data };
    },
    createOscillator: (): unknown => {
      const rec: FakeSourceRecord = { kind: 'osc', url: '<osc>', loop: false, loopStart: 0, loopEnd: 0, startArgs: null };
      sources.push(rec);
      return { ...node(), type: 'sine', frequency: param(), start: (...a: number[]): void => { rec.startArgs = a; }, stop: (): void => {} };
    },
    createBufferSource: (): unknown => {
      const rec: FakeSourceRecord = { kind: 'buffer', url: '<no-buffer>', loop: false, loopStart: 0, loopEnd: 0, startArgs: null };
      sources.push(rec);
      const n: Record<string, unknown> = {
        ...node(),
        start: (...a: number[]): void => {
          rec.startArgs = a;
          const b = n.buffer as { __url?: string } | null;
          rec.url = b?.__url ?? '<no-buffer>';
          rec.loop = n.loop as boolean;
          rec.loopStart = n.loopStart as number;
          rec.loopEnd = n.loopEnd as number;
        },
        stop: (): void => {},
      };
      n.buffer = null;
      n.loop = false;
      n.loopStart = 0;
      n.loopEnd = 0;
      return n;
    },
    decodeAudioData: async (ab: unknown): Promise<unknown> => {
      const url = (ab as { __url: string }).__url;
      const spec = buffers(url);
      if (spec.pcm === undefined) return { __url: url };
      const { sampleRate, channels } = spec.pcm;
      const length = channels[0]!.length;
      return {
        __url: url, sampleRate, length, numberOfChannels: channels.length, duration: length / sampleRate,
        getChannelData: (c: number) => channels[c]!,
      };
    },
  };

  const g = globalThis as { window?: unknown; fetch?: unknown };
  const realWindow = g.window;
  const realFetch = g.fetch;
  g.window = {
    AudioContext: function FakeAudioContext(): unknown { return ctx; },
    localStorage: { getItem: (): string | null => null, setItem: (): void => {} },
  };
  g.fetch = async (input: unknown): Promise<unknown> => {
    const url = String(input);
    return { ok: true, status: 200, arrayBuffer: async () => ({ __url: url }) };
  };
  return {
    sources,
    setTime: (t: number) => { ctx.currentTime = t; },
    restore: () => { g.window = realWindow; g.fetch = realFetch; },
  };
}

/** Let fetch → arrayBuffer → decode (and any `void`-ed follow-up) settle. */
export async function flushAudio(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await new Promise((r) => { setTimeout(r, 0); });
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

/** A stereo track: `head` s silence, `body` s of a 0.5 square wave, `tail` s silence. */
export function silentEdgedPcm(sampleRate: number, head: number, body: number, tail: number): Float32Array[] {
  const n = Math.round((head + body + tail) * sampleRate);
  const ch = new Float32Array(n);
  const h = Math.round(head * sampleRate);
  const b = Math.round(body * sampleRate);
  for (let i = h; i < h + b; i++) ch[i] = i % 2 === 0 ? 0.5 : -0.5;
  return [ch, ch];
}
