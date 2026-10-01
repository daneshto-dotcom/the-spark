/**
 * SPARK — S192 `s192/visuals` — **DEV-ONLY FX LAB: force a Vlad siphon, a tower aura, a blast, a horde.**
 *
 * Reached only through `__SPARK__.fx` (the DEV block in `main.ts`), which is stripped from the
 * production bundle, the same as `forceBomb` / `forceNonet`. It exists for two jobs the unit suite
 * cannot do: BEFORE/AFTER screenshots of the rebuilt effects, and a frame-time measurement at a
 * 120-creature wave-5 board.
 *
 * ⚠ It mutates the world directly (a debug lever, like `c5WaveFiveBoard.fixtures.ts`'s `topUpCreatures`,
 * whose shape the horde copies), so it is solo/host-only and never used by any shipped path.
 */

import type { Application } from 'pixi.js';
import { VLAD_SAP_FLASH_TICKS } from '../constants.ts';
import { blueprintBill } from '../state/blueprints.ts';
import { applyBuildBlueprint } from '../state/blueprintBuild.ts';
import { makeCastleBank } from '../state/castleBank.ts';
import { makeCreature, type CreatureType } from '../state/creatures/creature.ts';
import { CREATURE_CONFIGS } from '../state/creatures/voltkin-config.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { RACE_TOWER_IDS } from '../state/raceTowerIds.ts';
import { T9_BOSS_TYPE } from '../state/t9BossIds.ts';
import type { World } from '../state/world.ts';
import { asCreatureId, type CreatureId, type PlayerId } from '../types.ts';
import { fxStats, setFxHighQualityRuntime, setFxLegacy } from '../render/fx/fxRuntime.ts';
import { fxLegacy } from '../render/fx/fxState.ts';
import { setFxHighQuality } from '../render/displayPrefs.ts';

const HORDE_TYPES: readonly CreatureType[] = ['goblinMelee', 'goblinArcher', 'goblinShield', 'goblinHound', 'raceUnit'];

export function makeFxLab(getWorld: () => World, app: Application) {
  const spawn = (type: CreatureType, owner: PlayerId, x: number, y: number): number => {
    const w = getWorld();
    const id = asCreatureId(w.nextCreatureId++);
    const c = makeCreature(CREATURE_CONFIGS[type], {
      id, ownerPlayerId: owner, pos: { x, y }, targetPos: { x, y }, spawnedAtTick: w.tick, clock: w,
    });
    w.creatures.set(id, c);
    return id as number;
  };
  return {
    setLegacy(v: boolean): void { setFxLegacy(v); },
    get legacy(): boolean { return fxLegacy(); },
    // Writes the PREFERENCE too: main.ts polls it every frame and would otherwise flip it straight back.
    setHighQuality(v: boolean): void { setFxHighQuality(v); setFxHighQualityRuntime(v); },
    stats: () => fxStats(),
    /** A Vlad owned by the local seat at (x, y). Returns his creature id. */
    vlad(x: number, y: number): number {
      const w = getWorld();
      return spawn(T9_BOSS_TYPE.vampires as CreatureType, w.localPlayerId, x, y);
    },
    /** A zombie boss (the rot aura) at (x, y). */
    zombie(x: number, y: number): number {
      const w = getWorld();
      return spawn(T9_BOSS_TYPE.zombies as CreatureType, w.localPlayerId, x, y);
    },
    /** Stamp a sap flash as if the heal landed `ago` ticks ago (0 = this tick). */
    sap(id: number, ago = 0): void {
      const w = getWorld();
      const c = w.creatures.get(asCreatureId(id) as CreatureId);
      if (c !== undefined) c.sapFlashUntilTick = w.tick + VLAD_SAP_FLASH_TICKS - ago;
    },
    /** Build the local race's tower at (x, y), paying from a seeded bank. True if the reducer accepted it. */
    tower(x: number, y: number): boolean {
      const w = getWorld();
      const me = w.players.get(w.localPlayerId);
      if (me === undefined) return false;
      const id = RACE_TOWER_IDS[me.raceId];
      const bank = makeCastleBank();
      for (const [type, count] of blueprintBill(id)) bank[type as number] = (bank[type as number] ?? 0) + count;
      w.castleBanks.set(w.localPlayerId, bank);
      const before = w.primitives.size;
      applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: w.localPlayerId, blueprintId: id, centre: { x, y } });
      // The spawner itself registers on the host's next re-validation poll; the shapes land now.
      return w.primitives.size > before;
    },
    /** Push a BOMB_EXPLODE at (x, y) with `radius` (70 goblin · 110 drone · 240 hub · 380 zombie). */
    blast(x: number, y: number, radius: number): void {
      const w = getWorld();
      w.effects.push({ kind: 'BOMB_EXPLODE', tick: w.tick, pos: { x, y }, radius });
    },
    /** Top the board up to `n` live creatures spread over the seats, the c5 wave-5 lever's shape. */
    horde(n: number): number {
      const w = getWorld();
      const seats = [...w.players.keys()];
      let i = 0;
      while (w.creatures.size < n && seats.length > 0) {
        const seat = seats[i % seats.length]!;
        const type = HORDE_TYPES[Math.floor(i / seats.length) % HORDE_TYPES.length]!;
        const home = castleAnchor(seat as unknown as number, w.layout);
        spawn(type, seat, home.x + ((i * 7) % 60) - 30, home.y + ((i * 13) % 60) - 30);
        i++;
      }
      return w.creatures.size;
    },
    /**
     * Time `frames` full renders of the stage (the GPU submit included, via a pixel readback at the
     * end of each batch is NOT done — this is the CPU side: scene-graph update + batching + submit).
     * `step()` is called before each frame so the caller can advance the tick (effects animate).
     */
    benchRender(frames: number, step?: () => void): { avgMs: number; p95Ms: number; maxMs: number } {
      const ts: number[] = [];
      for (let i = 0; i < frames; i++) {
        step?.();
        const t0 = performance.now();
        app.renderer.render(app.stage);
        ts.push(performance.now() - t0);
      }
      const s = [...ts].sort((a, b) => a - b);
      return {
        avgMs: ts.reduce((p, c) => p + c, 0) / ts.length,
        p95Ms: s[Math.floor(s.length * 0.95)] ?? 0,
        maxMs: s[s.length - 1] ?? 0,
      };
    },
  };
}
