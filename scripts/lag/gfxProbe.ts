/**
 * SPARK — S196 joiner-lag — a LOAD-INDEPENDENT work counter for the joiner's frame. NOT a gate.
 *
 * The S195 numbers and the first S196 matrix were taken on a machine at 100 % CPU (eight worktrees), where
 * fps swung 3× between identical runs. What does NOT swing is HOW MUCH WORK a frame asks for, so this counts
 * it directly, per owner:
 *   · Graphics REBUILDS — a GraphicsContext going clean→dirty (Pixi re-tessellates it at the next render),
 *     with the instructions it then holds. Owner = the first `src/render/*.ts` frame on the stack the first
 *     time that context was dirtied.
 *   · Text RE-RASTERS — a Text whose string changed (canvas draw + a texSubImage2D upload).
 * Installed into the page by `scripts/lag/joiner-replay.spec.ts` (SPARK_LAG_GFXPROBE=1).
 */
export function installGfxProbe(): void {
  type Ctx = { dirty: boolean; instructions: unknown[]; __owner?: string };
  type Node = { children?: Node[]; context?: Ctx; _didTextUpdate?: boolean };
  const g = window as unknown as { __SPARK__: { app: { stage: Node; ticker: { add(f: () => void): void } } }; __gfx?: unknown };
  const app = g.__SPARK__.app;
  const find = (n: Node, pred: (x: Node) => boolean): Node | null => {
    if (pred(n)) return n;
    for (const c of n.children ?? []) { const r = find(c, pred); if (r !== null) return r; }
    return null;
  };
  const ownerOf = (): string => {
    const st = new Error().stack ?? '';
    for (const line of st.split('\n').slice(2)) {
      const m = /\/src\/((?:render|main)[^?:]*\.ts)(?:\?[^:]*)?:(\d+)/.exec(line);
      if (m !== null) return `${m[1]}:${m[2]}`;
    }
    return '(pixi-internal)';
  };
  const state = { frames: 0, rebuilds: new Map<string, number>(), instr: new Map<string, number>(), texts: new Map<string, number>(), dirtyNow: new Set<Ctx>() };
  g.__gfx = state;
  const gr = find(app.stage, (x) => x.context !== undefined && Array.isArray(x.context.instructions));
  if (gr === null) throw new Error('gfxProbe: no Graphics on stage');
  const proto = Object.getPrototypeOf(gr.context) as { onUpdate(this: Ctx): void };
  const orig = proto.onUpdate;
  proto.onUpdate = function (this: Ctx): void {
    if (!this.dirty) {
      const o = (this.__owner ??= ownerOf());
      state.rebuilds.set(o, (state.rebuilds.get(o) ?? 0) + 1);
      state.dirtyNow.add(this);
    }
    orig.call(this);
  };
  const tx = find(app.stage, (x) => '_didTextUpdate' in x);
  if (tx !== null) {
    let p: object | null = Object.getPrototypeOf(tx);
    while (p !== null && Object.getOwnPropertyDescriptor(p, 'text') === undefined) p = Object.getPrototypeOf(p);
    if (p !== null) {
      const d = Object.getOwnPropertyDescriptor(p, 'text')!;
      Object.defineProperty(p, 'text', {
        configurable: true, get: d.get,
        set(this: { text: string }, v: string) {
          if (String(v) !== d.get!.call(this)) { const o = ownerOf(); state.texts.set(o, (state.texts.get(o) ?? 0) + 1); }
          d.set!.call(this, v);
        },
      });
    }
  }
  app.ticker.add(() => {
    state.frames++;
    for (const c of state.dirtyNow) { const o = c.__owner ?? '?'; state.instr.set(o, (state.instr.get(o) ?? 0) + c.instructions.length); }
    state.dirtyNow.clear();
  });
}

export function resetGfxProbe(): void {
  const s = (window as unknown as { __gfx: { frames: number; rebuilds: Map<string, number>; instr: Map<string, number>; texts: Map<string, number> } }).__gfx;
  s.frames = 0; s.rebuilds.clear(); s.instr.clear(); s.texts.clear();
}

export function readGfxProbe(): { frames: number; rebuilds: [string, number][]; instr: [string, number][]; texts: [string, number][] } {
  const s = (window as unknown as { __gfx: { frames: number; rebuilds: Map<string, number>; instr: Map<string, number>; texts: Map<string, number> } }).__gfx;
  return { frames: s.frames, rebuilds: [...s.rebuilds], instr: [...s.instr], texts: [...s.texts] };
}
