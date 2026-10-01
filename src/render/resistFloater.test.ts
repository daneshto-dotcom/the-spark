/**
 * SPARK — S192 (owner) — ⭐ THE RESIST CUE: a magic DoT beat swallowed by MRES prints a grey "RESIST".
 *
 * *"we need to predefine … how it would look like."* Two halves:
 *   · `magicBeatResistedAt` (state, pure) says yes on EXACTLY the ticks the sim's beat landed 0 — checked
 *     against the victim's pool through the real host tick (SCORCHED GROUND, the cleanest source: nothing
 *     else touches a held unit standing in a demon's zone);
 *   · `DamageNumbers` prints one RESIST per unit per second at most, never for a unit whose MRES = DEF.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class Container { children: unknown[] = []; addChild(c: unknown): void { this.children.push(c); } removeChild(): void {} }
  class TextStyle { constructor(public o?: { fill?: number }) {} }
  class Text {
    text = ''; style: unknown = null; visible = true; alpha = 1; x = 0; y = 0;
    anchor = { set: (): void => {} }; position = { set: (): void => {} }; scale = { set: (): void => {} };
    constructor(o?: { text?: string; style?: unknown }) { this.text = o?.text ?? ''; this.style = o?.style; }
    destroy(): void {}
  }
  return { Container, Text, TextStyle };
});

const { PLAYER_COLORS, phaseDurationTicks } = await import('../constants.ts');
const { dispatch, makeWorld } = await import('../state/world.ts');
const { asCreatureId, makeCreature } = await import('../state/creatures/creature.ts');
const { getCreatureConfig } = await import('../state/creatures/voltkin-config.ts');
const { makeHostTickState, runHostTick } = await import('../state/hostTick.ts');
const { Spawner, DEFAULT_SPAWNER_CONFIG } = await import('../game/spawner.ts');
const { mulberry32 } = await import('../state/rng.ts');
const { makeGameStateExtras } = await import('../state/gameState.ts');
const { asPlayerId, asSpawnerId } = await import('../types.ts');
const { magicBeatResistedAt } = await import('../state/magicResistCue.ts');
const { dotDueThisTick } = await import('../state/damageOverTime.ts');
const { SCORCHED_EARTH_CAST_PER_MILLE, SCORCHED_GROUND_PER_MILLE, scorchedEarthZones, scorchedZones } = await import('../state/racial/scorchedGround.ts');
const { zoneOf } = await import('../state/zones.ts');
const { DamageNumbers, RESIST_TEXT, RESIST_MIN_GAP_TICKS } = await import('./damageNumbers.ts');

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const DEEP = 100_000;

function scorchedWorld(archAt: { x: number; y: number } = { x: 600, y: 200 }) {
  const w = makeWorld(0x192f);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0], raceId: 'demons' }, { seat: 1, color: PLAYER_COLORS[1], raceId: 'orcs' }],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT') * 100;
  w.creatures.clear();
  w.draft = null;
  w.players.get(P0)!.draftPicks = ['racial']; // SCORCHED GROUND
  const held = (type: string, x: number, y: number) => {
    const c = makeCreature(getCreatureConfig(type as never), {
      id: asCreatureId(w.nextCreatureId++), ownerPlayerId: P1, pos: { x, y }, targetPos: { x, y },
      spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(950 + w.creatures.size), clock: w,
    });
    c.ehp = DEEP; c.maxEhp = DEEP; c.stunnedUntilTick = w.tick + 1_000_000;
    w.creatures.set(c.id, c);
    return c;
  };
  const arch = held('t9BossDemons', archAt.x, archAt.y); // DEF 8, MRES 14 — some beats land 0
  const ctl = held('voltkin', 600, 420); // global: MRES = DEF — never swallowed
  const deps = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: { state: { kind: 'Idle' }, applyPerSubstep() {} },
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as never;
  return { w, arch, ctl, deps, st: makeHostTickState(w) };
}

describe('S192 RESIST — the cue is TRUE on exactly the ticks the sim swallowed a beat', () => {
  it('SCORCHED GROUND on the Archdemon: resisted ticks = due beats − fifths lost; never on MRES = DEF', () => {
    const { w, arch, ctl, deps, st } = scorchedWorld();
    let due = 0;
    let resisted = 0;
    let swallowedSeen = 0;
    let ctlResisted = 0;
    for (let i = 0; i < 1200; i++) {
      const before = arch.ehp;
      runHostTick(w, deps, st);
      const t = w.tick;
      const isDue = dotDueThisTick(t, arch.id as unknown as number, arch.type, SCORCHED_GROUND_PER_MILLE);
      if (isDue) due++;
      const cue = magicBeatResistedAt(w, arch, t);
      if (cue) resisted++;
      if (isDue && arch.ehp === before) swallowedSeen++;
      expect(cue && !(isDue && arch.ehp === before), `tick ${t}: cue without a swallowed beat`).toBe(false);
      if (magicBeatResistedAt(w, ctl, t)) ctlResisted++;
    }
    expect(due).toBeGreaterThan(20);
    expect(resisted).toBe(swallowedSeen);
    expect(resisted).toBe(due - (DEEP - arch.ehp));
    expect(resisted, 'MRES 14 > DEF 8 swallows some beats').toBeGreaterThan(0);
    expect(ctlResisted).toBe(0);
  });
});

/*
 * ⭐ S193 (audit MED) — SCORCHED EARTH, the aimed CAST. The demon seat (P0) casts on the ORC seat's land
 * (P1), and the Archdemon (owned by P1) stands there: the passive (P0's own land only) never reaches him,
 * so every beat he takes is a CAST beat. Before S193 the cue mirrored only the passive and this was 0.
 */
describe('S193 RESIST — SCORCHED EARTH cast beats swallowed by MRES are cued too', () => {
  it('a cast on P1 land: resisted ticks = cast due beats − fifths lost, > 0; the passive never reaches him', () => {
    const IN_P1_LAND = { x: 1320, y: 200 };
    const { w, arch, deps, st } = scorchedWorld(IN_P1_LAND);
    const keep = new Set([...w.creatures.keys()]);
    dispatch(w, { type: 'CAST_SCORCHED_EARTH', playerId: P0, zoneSeat: P1 } as never);
    const zone = zoneOf(arch.pos, w.layout);
    expect(scorchedEarthZones(w), 'fixture: the cast is live on his zone').toEqual([{ caster: P0, zone }]);
    expect(scorchedZones(w).some((z) => z.zone === zone), 'fixture: no passive on his zone').toBe(false);
    let due = 0;
    let resisted = 0;
    for (let i = 0; i < 1200; i++) {
      const before = arch.ehp;
      runHostTick(w, deps, st);
      for (const id of [...w.creatures.keys()]) if (!keep.has(id)) w.creatures.delete(id); // only the scorch touches him
      const t = w.tick;
      const isDue = scorchedEarthZones(w).length > 0
        && dotDueThisTick(t, arch.id as unknown as number, arch.type, SCORCHED_EARTH_CAST_PER_MILLE);
      if (isDue) due++;
      const cue = magicBeatResistedAt(w, arch, t);
      if (cue) resisted++;
      expect(cue && !(isDue && arch.ehp === before), `tick ${t}: cue without a swallowed cast beat`).toBe(false);
    }
    expect(due, 'the cast ran').toBeGreaterThan(20);
    expect(DEEP - arch.ehp, 'the cast burned him').toBeGreaterThan(0);
    expect(resisted, 'every swallowed cast beat is cued, and only those').toBe(due - (DEEP - arch.ehp));
    expect(resisted, 'MRES 14 > DEF 8 swallows some cast beats').toBeGreaterThan(0);
  });
});

describe('S192 RESIST — the floater (⚠ MINE: word, grey, once a second)', () => {
  it('prints RESIST over the resisting unit, at most once per unit per second, and never over the control', () => {
    const { w, arch, deps, st } = scorchedWorld();
    const dn = new DamageNumbers();
    const shownAt: number[] = [];
    let seenCount = 0;
    for (let i = 0; i < 1200; i++) {
      runHostTick(w, deps, st);
      dn.sync(w);
      const live = (dn as unknown as { live: Array<{ text: { text: string }; y: number; x: number; age: number }> }).live;
      const fresh = live.filter((f) => f.text.text === RESIST_TEXT && f.age === 1);
      for (const f of fresh) {
        seenCount++;
        shownAt.push(w.tick);
        expect(Math.abs(f.x - arch.pos.x), 'over the Archdemon, not the control').toBeLessThan(60);
      }
    }
    expect(seenCount, 'the cue reached the screen').toBeGreaterThan(0);
    for (let i = 1; i < shownAt.length; i++) {
      expect(shownAt[i]! - shownAt[i - 1]!, 'at most one a second').toBeGreaterThanOrEqual(RESIST_MIN_GAP_TICKS);
    }
  });
});
