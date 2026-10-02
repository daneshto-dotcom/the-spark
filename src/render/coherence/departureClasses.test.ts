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

const { applyEntropyTax, planEntropy } = await import('../../state/entropy.ts');
const { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } = await import('../../constants.ts');
const { asBondId, asPrimitiveId } = await import('../../types.ts');

/** One seat-0 lattice of `shapes` shapes and `connectors` nearest-first bonds (the entropy suite's fixture shape). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lattice(w: any, shapes: number, connectors: number, ox: number, oy: number): void {
  const cols = Math.ceil(Math.sqrt(shapes));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ps: any[] = [];
  for (let i = 0; i < shapes; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const x = ox + c * 40 + (r % 2) * 20, y = oy + r * 35;
    const id = asPrimitiveId(w.nextPrimitiveId++);
    const p = { id, type: i % 2 === 0 ? SparkType.Square : SparkType.Triangle, placerColor: PLAYER_COLORS[0], placedBy: asPlayerId(0),
      createdTick: w.tick, pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: PLAYER_COLORS[0],
      lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null };
    w.primitives.set(id, p);
    ps.push(p);
  }
  const pairs: Array<[number, number, number]> = [];
  for (let i = 0; i < shapes; i++) for (let j = i + 1; j < shapes; j++) {
    const dx = ps[i].pos.x - ps[j].pos.x, dy = ps[i].pos.y - ps[j].pos.y;
    pairs.push([dx * dx + dy * dy, i, j]);
  }
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const have = new Set<string>();
  let n = 0;
  const add = (i: number, j: number): void => {
    if (have.has(`${i},${j}`)) return;
    have.add(`${i},${j}`);
    const id = asBondId(w.nextBondId++);
    const a = ps[i], b = ps[j];
    w.bonds.set(id, { id, aId: a.id, bId: b.id, a, b, restLength: Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y), stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick });
    a.bonds.add(id); b.bonds.add(id);
    n++;
  };
  for (let i = 1; i < shapes; i++) add(i - 1, i);
  for (const [, i, j] of pairs) { if (n >= connectors) break; add(i, j); }
}

describe('S194 T9 (batch 2) — the ENTROPY TAX snaps bonds, never units', () => {
  it("an entropy snap that splits a structure removes no creature, so the classifier is never asked: no beat, no unit number", () => {
    const w = board('FIGHT');
    lattice(w, 65, 145, 260, 200);
    expect(planEntropy(w).length, 'anti-vacuity: the tax really snaps something').toBeGreaterThan(0);
    // units standing on and around the lattice, both seats
    const units = [spawn(w, 'goblinMelee', 300, 230), spawn(w, 't3Warband', 420, 300), spawn(w, 'chewer', 500, 260)];
    units[1].ownerPlayerId = asPlayerId(0);
    const dn = new DamageNumbers();
    const ud = new UnitDeathRenderer();
    dn.sync(w); ud.sync(w);
    const bondsBefore = w.bonds.size;
    expect(applyEntropyTax(w)).toBeGreaterThan(0);
    expect(w.bonds.size).toBeLessThan(bondsBefore);
    for (const u of units) expect(w.creatures.has(u.id), 'entropy removed a unit').toBe(true);
    ud.sync(w); dn.sync(w);
    expect(ud.liveCount()).toBe(0);
  });
});
