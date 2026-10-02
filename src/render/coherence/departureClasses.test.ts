/**
 * SPARK — S194 T9 audit (F1-F3, item 6) — **ONE REACH TEST PER PRODUCTION REMOVAL CLASS.**
 *
 * Every way a creature leaves `world.creatures` in production, driven through its REAL reducer, and the
 * classification the shared rule gives it — then the two consumers that act on it (`DamageNumbers`, the
 * killing-blow number; `UnitDeathRenderer`, the death beat) asserted on the cases the audit found wrong.
 *
 * | class | reducer | expected |
 * |---|---|---|
 * | damage kill | `damageCreature` | killed |
 * | age-out | `applyCreatureTick` past `despawnAtTick` (via DESPAWNING) | expired |
 * | kill DURING the fade | `damageCreature` while DESPAWNING, lifetime not yet run out | killed (F3) |
 * | wave-edge pants sweep | `removeEndgameMonsters` (→ DESPAWN_CREATURE) in BUILD | swept (F1) |
 * | pants killed mid-FIGHT | `damageCreature` | killed (F1 negative) |
 * | sapper / drone detonation | `SUICIDE_BLAST` / `DRONE_EXPLODE` | detonated (F2) |
 * | drone SHOT DOWN on the host | `damageCreature` (writes a kill record) | killed (F2 negative) |
 * | title clear | `RETURN_TO_TITLE` | dropped by the epoch latch; offstage if asked |
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class Container { children: unknown[] = []; addChild(c: unknown): void { this.children.push(c); } removeChild(): void {} }
  class TextStyle { constructor(public o?: unknown) {} }
  class Text {
    text = ''; style: unknown = null; visible = true; alpha = 1; x = 0; y = 0;
    anchor = { set: (): void => {} }; position = { set: (): void => {} }; scale = { set: (): void => {} };
    constructor(o?: { text?: string; style?: unknown }) { this.text = o?.text ?? ''; this.style = o?.style; }
    destroy(): void {}
  }
  return { Container, Text, TextStyle };
});

const { makeWorld, dispatch } = await import('../../state/world.ts');
const { asPlayerId } = await import('../../types.ts');
const { asCreatureId, makeCreature, CREATURE_DESPAWNING_TICKS } = await import('../../state/creatures/creature.ts');
const { getCreatureConfig } = await import('../../state/creatures/voltkin-config.ts');
const { damageCreature, applyCreatureTick } = await import('../../state/creatures/creatureLifecycle.ts');
const { removeEndgameMonsters } = await import('../../state/endgameMonsters.ts');
const { DamageNumbers } = await import('../damageNumbers.ts');
const { UnitDeathRenderer } = await import('./unitDeathRenderer.ts');
const { classifyCreatureDeparture, DEPARTURE_EXPIRY_SLACK_TICKS } = await import('./unitDeparture.ts');

const printed = (dn: unknown): string[] =>
  ((dn as { live: { text: { text: string } }[] }).live ?? []).map((f) => f.text.text);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function board(phase: 'FIGHT' | 'BUILD' = 'FIGHT'): any {
  const w = makeWorld(0xc1a5);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true } as never);
  w.gameState = 'PLAYING';
  w.matchPhase = phase;
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  w.creatureKillHits.length = 0;
  return w;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function spawn(w: any, type: string, x = 900, y = 600): any {
  const c = makeCreature(getCreatureConfig(type as never), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: asPlayerId(1), pos: { x, y }, targetPos: { x, y },
    spawnedAtTick: w.tick, sourceSpawnerId: null,
  });
  w.creatures.set(c.id, c);
  return c;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lastOf = (c: any) => ({ state: c.state, type: c.type, despawnAtTick: c.despawnAtTick, x: c.pos.x, y: c.pos.y, owner: c.ownerPlayerId });

/** Watch, run the removal, and report what the shared rule and both consumers made of it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function observe(w: any, c: any, remove: () => void): { kind: string; numbers: string[]; beats: number } {
  const dn = new DamageNumbers();
  const ud = new UnitDeathRenderer();
  dn.sync(w); ud.sync(w);
  const before = printed(dn).length;
  const last = lastOf(c);
  remove();
  expect(w.creatures.has(c.id), 'the reducer really removed it').toBe(false);
  const kind = classifyCreatureDeparture(w, last); // asked BEFORE the consumers wipe the kill records
  ud.sync(w); dn.sync(w);
  return { kind, numbers: printed(dn).slice(before), beats: ud.liveCount() };
}

describe('S194 T9 audit — each production removal class, through its real reducer', () => {
  it('damage kill → killed: a beat and the killing-blow number', () => {
    const w = board();
    const c = spawn(w, 'goblinMelee');
    const r = observe(w, c, () => { damageCreature(w, c.id, 10_000); });
    expect(r.kind).toBe('killed');
    expect(r.beats).toBe(1);
    expect(r.numbers.length).toBe(1);
  });

  it('age-out (DESPAWNING, then deleted at despawnAtTick) → expired: nothing', () => {
    const w = board();
    const c = spawn(w, 'voltkin');
    w.tick = c.despawnAtTick - CREATURE_DESPAWNING_TICKS;
    applyCreatureTick(w, { type: 'CREATURE_TICK', creatureId: c.id } as never);
    expect(c.state).toBe('DESPAWNING');
    const r = observe(w, c, () => {
      w.tick = c.despawnAtTick;
      applyCreatureTick(w, { type: 'CREATURE_TICK', creatureId: c.id } as never);
    });
    expect(r.kind).toBe('expired');
    expect(r.beats).toBe(0);
    expect(r.numbers).toEqual([]);
  });

  it('F3 — a KILL during the 60-tick fade, before the lifetime ran out → killed', () => {
    const w = board();
    const c = spawn(w, 'voltkin');
    w.tick = c.despawnAtTick - CREATURE_DESPAWNING_TICKS;
    applyCreatureTick(w, { type: 'CREATURE_TICK', creatureId: c.id } as never);
    w.tick = c.despawnAtTick - CREATURE_DESPAWNING_TICKS + 10; // mid-fade, far outside the slack
    expect(w.tick).toBeLessThan(c.despawnAtTick - DEPARTURE_EXPIRY_SLACK_TICKS);
    const r = observe(w, c, () => { damageCreature(w, c.id, 10_000); });
    expect(r.kind).toBe('killed');
    expect(r.beats).toBe(1);
    expect(r.numbers.length).toBe(1);
  });

  it.each(['endgameMonster', 'megaPants'])('F1 — %s swept at the wave edge (removeEndgameMonsters, BUILD) → swept: nothing', (type) => {
    const w = board('FIGHT');
    const c = spawn(w, type);
    const r = observe(w, c, () => {
      w.matchPhase = 'BUILD'; // hostTick flips the phase, THEN sweeps (hostTick.ts `if BUILD removeEndgameMonsters`)
      removeEndgameMonsters(w);
    });
    expect(r.kind).toBe('swept');
    expect(r.beats).toBe(0);
    expect(r.numbers).toEqual([]);
  });

  it('F1 negative — pants KILLED mid-FIGHT still get the beat and the number', () => {
    const w = board('FIGHT');
    const c = spawn(w, 'endgameMonster');
    const r = observe(w, c, () => { damageCreature(w, c.id, 1_000_000); });
    expect(r.kind).toBe('killed');
    expect(r.beats).toBe(1);
    expect(r.numbers.length).toBe(1);
  });

  it('F2 — the sapper goblin detonating itself (SUICIDE_BLAST) → detonated: no beat, no self-number', () => {
    const w = board();
    const c = spawn(w, 'goblinSuicide');
    const r = observe(w, c, () => { dispatch(w, { type: 'SUICIDE_BLAST', creatureId: c.id } as never); });
    expect(r.kind).toBe('detonated');
    expect(r.beats).toBe(0);
    expect(r.numbers).toEqual([]);
  });

  it('F2 — a lightning drone detonating (DRONE_EXPLODE) → detonated: no beat, no self-number', () => {
    const w = board();
    const c = spawn(w, 'lightningDrone');
    const r = observe(w, c, () => { dispatch(w, { type: 'DRONE_EXPLODE', creatureId: c.id } as never); });
    expect(r.kind).toBe('detonated');
    expect(r.beats).toBe(0);
    expect(r.numbers).toEqual([]);
  });

  it('F2 negative — a drone SHOT DOWN on the host (kill record present) is still a kill', () => {
    const w = board();
    const c = spawn(w, 'lightningDrone');
    const r = observe(w, c, () => { damageCreature(w, c.id, 10_000); });
    expect(w.creatureKillHits.length + r.numbers.length, 'anti-vacuity: the record existed and was spent').toBeGreaterThan(0);
    expect(r.kind).toBe('killed');
    expect(r.beats).toBe(1);
  });

  it('title clear (RETURN_TO_TITLE) → no beat, no number (epoch latch), and offstage if asked', () => {
    const w = board();
    const c = spawn(w, 'goblinMelee');
    const r = observe(w, c, () => { dispatch(w, { type: 'RETURN_TO_TITLE' } as never); });
    expect(r.kind).toBe('offstage');
    expect(r.beats).toBe(0);
    expect(r.numbers).toEqual([]);
  });
});
