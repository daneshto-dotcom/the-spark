/**
 * ⭐⭐ S192 (owner T11) — **A REPAIRED STRUCTURE SHOWS ONE GREEN NUMBER: WHAT THE REPAIR RESTORED.**
 *
 * > *"when vampires attack, they have … life steal or … when a tower heals or anything … every healing
 * > should show … just like damage is shown on every hit."* — owner, S192
 *
 * Before S192 a repaired CONNECTOR printed nothing: a connector is a rising pool (`Bond.damageFifths`)
 * and `poolDelta` deliberately never reads a fall in one as a heal (a sever lowers banks too). Driven
 * for real: a real build, real connector damage, the real repair, into the real `DamageNumbers` (only
 * Pixi's `Text` is faked).
 *
 * ⭐ S193 R191-B — RE-PINNED: `REPAIR_STRUCTURE` now QUEUES a gatherer job (the restore runs when the
 * shapes arrive), so the instant-restore cases call `applyRepairStructure` — the restore they test —
 * and a REACH case below finishes a real JOB through the host tick and reads the same green number.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class Container { children: unknown[] = []; addChild(c: unknown): void { this.children.push(c); } removeChild(): void {} }
  class TextStyle { constructor(public o?: { fill?: number }) {} }
  class Text {
    text = ''; style: unknown = null; visible = true; alpha = 1;
    anchor = { set: (): void => {} }; position = { set: (): void => {} }; scale = { set: (): void => {} };
    constructor(o?: { text?: string; style?: unknown }) { this.text = o?.text ?? ''; this.style = o?.style; }
    destroy(): void {}
  }
  return { Container, Text, TextStyle };
});

const { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } = await import('../constants.ts');
const { makeIdlePlayer } = await import('../game/player.ts');
const { asPlayerId } = await import('../types.ts');
const { makeWorld, dispatch } = await import('../state/world.ts');
const { blueprintBill } = await import('../state/blueprints.ts');
const { applyBuildBlueprint } = await import('../state/blueprintBuild.ts');
const { makeCastleBank } = await import('../state/castleBank.ts');
const { damageConnector } = await import('../state/damage.ts');
const { runGodlyMatcherCore } = await import('../state/godlyMatcherCore.ts');
const { applyRepairStructure } = await import('../state/structureRepair.ts');
const { makeHostTickState, runHostTick } = await import('../state/hostTick.ts');
const { makeGameStateExtras } = await import('../state/gameState.ts');
const { castleAnchor, makeGatherer } = await import('../state/gatherers/gatherer.ts');
const { asGathererId } = await import('../types.ts');
const { GATHERER_DEPOSIT_OFFSET_Y } = await import('../constants.ts');
const { DamageNumbers } = await import('./damageNumbers.ts');
await import('../state/godlyRecipes/stinkTower.ts');
await import('../state/godlyRecipes/laserTurret.ts');

/* eslint-disable @typescript-eslint/no-explicit-any */
const P0 = asPlayerId(0);

function tower(): any {
  const w: any = makeWorld(0);
  w.isHost = true;
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  const bank = makeCastleBank();
  for (const [type, count] of blueprintBill('laserTurret')) bank[type as number] = (bank[type as number] ?? 0) + count;
  bank[SparkType.Spiral as number] = (bank[SparkType.Spiral as number] ?? 0) + 3; // the repair fee
  bank[SparkType.Square as number] = (bank[SparkType.Square as number] ?? 0) + 3;
  bank[SparkType.Circle as number] = (bank[SparkType.Circle as number] ?? 0) + 3;
  bank[SparkType.Triangle as number] = (bank[SparkType.Triangle as number] ?? 0) + 3;
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: 'laserTurret', centre: { x: 300, y: 300 } });
  runGodlyMatcherCore(w, { lastMatcherTick: 0 });
  expect(w.bonds.size, 'fixture: a built tower').toBeGreaterThan(1);
  return w;
}

type Placed = { amount: number; kind: 'damage' | 'heal' };
function recorder(dn: any): Placed[] {
  const out: Placed[] = [];
  const orig = dn.place.bind(dn);
  dn.place = (at: unknown, amount: number, kind: 'damage' | 'heal'): void => { orig(at, amount, kind); out.push({ amount, kind }); };
  return out;
}

const seed = (w: any): any => [...w.primitives.values()][0].id;

describe('S192 T11 — a repair prints ONE total green number (host)', () => {
  it('⭐⭐ two chewed connectors: one green number equal to the banks the repair cleared', () => {
    const w = tower();
    const [b1, b2] = [...w.bonds.keys()];
    expect(damageConnector(w, b1, 7, null)).toBe(false);
    expect(damageConnector(w, b2, 5, null)).toBe(false);
    const dn: any = new DamageNumbers();
    dn.sync(w); // seed every watch
    const placed = recorder(dn);
    applyRepairStructure(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: seed(w) });
    for (const b of w.bonds.values()) expect(b.damageFifths, 'fixture: the repair landed').toBe(0);
    dn.sync(w);
    expect(placed.filter((p) => p.kind === 'heal')).toEqual([{ amount: 12, kind: 'heal' }]);
    expect(placed.filter((p) => p.kind === 'damage')).toEqual([]);
    expect(w.structureHealHits, 'wiped by the consumer').toEqual([]);
  });

  it('⭐ a chipped shape AND a chewed connector: still ONE number, the sum — the shape does not print twice', () => {
    const w = tower();
    const b1 = [...w.bonds.keys()][0];
    damageConnector(w, b1, 9, null);
    const shape = [...w.primitives.values()][1];
    shape.hp = PRIMITIVE_MAX_HP - 20;
    const dn: any = new DamageNumbers();
    dn.sync(w);
    const placed = recorder(dn);
    applyRepairStructure(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: seed(w) });
    dn.sync(w);
    expect(placed).toEqual([{ amount: 29, kind: 'heal' }]);
  });

  it('negative: a SEVER lowers banks and prints no green (poolDelta still never reads a rising fall)', () => {
    const w = tower();
    const ids = [...w.bonds.keys()];
    for (const id of ids) damageConnector(w, id, 3, null);
    const dn: any = new DamageNumbers();
    dn.sync(w);
    const placed = recorder(dn);
    dispatch(w, { type: 'SEVER_BOND', bondId: ids[0], playerId: P0, cause: 'unit' } as never);
    for (const b of w.bonds.values()) b.damageFifths = 0; // a re-form / carry resetting banks
    dn.sync(w);
    expect(placed.filter((p) => p.kind === 'heal')).toEqual([]);
  });

  it('negative: a repair that restored nothing pushes no record', () => {
    const w = tower();
    applyRepairStructure(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: seed(w) });
    expect(w.structureHealHits).toEqual([]);
  });
});

describe('⭐⭐ S193 R191-B × T11 — a repair JOB finished by a gatherer prints the same ONE green number', () => {
  it('REACH (host tick): chew two connectors, FIX queues, the gatherer brings the fee Spiral, the turret heals — one green 12', () => {
    const w: any = makeWorld(0x193f);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    w.gameState = 'PLAYING';
    w.matchPhase = 'BUILD';
    w.phaseEndsAtTick = w.tick + 1_000_000;
    w.creatures.clear();
    w.freeSparks.clear();
    w.gatherers.clear();
    const bank = makeCastleBank();
    for (const [type, count] of blueprintBill('laserTurret')) bank[type as number] = (bank[type as number] ?? 0) + count;
    w.castleBanks.set(P0, bank);
    applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: 'laserTurret', centre: { x: 500, y: 300 } });
    const deps: any = {
      spawner: { tick() {} }, controls: { state: { kind: 'Idle' }, applyPerSubstep() {} }, botManager: null,
      gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
    };
    const st = makeHostTickState(w);
    const cursor = { lastMatcherTick: -1 };
    const step = (): void => { runHostTick(w, deps, st); runGodlyMatcherCore(w, cursor); w.effects.length = 0; w.creatures.clear(); };
    for (let i = 0; i < 3; i++) step();
    expect(w.defenders.size, 'fixture: the turret stands').toBe(1);
    const [b1, b2] = [...w.bonds.keys()];
    expect(damageConnector(w, b1, 7, null)).toBe(false);
    expect(damageConnector(w, b2, 5, null)).toBe(false);
    w.castleBanks.set(P0, makeCastleBank());
    w.castleBanks.get(P0)[SparkType.Spiral as number] = 1; // R182-E: a dent costs one shape — the turret's Spiral
    const c = castleAnchor(0, w.layout);
    const gid = asGathererId(w.nextGathererId++);
    w.gatherers.set(gid, makeGatherer({ id: gid, ownerPlayerId: P0, pos: { x: c.x, y: c.y + GATHERER_DEPOSIT_OFFSET_Y }, spawnedAtTick: 0 }));
    const dn: any = new DamageNumbers();
    dn.sync(w);
    const placed = recorder(dn);
    dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: seed(w) });
    expect(w.repairJobs, 'the FIX queued a job').toHaveLength(1);
    dn.sync(w);
    expect(placed, 'nothing heals at the click').toEqual([]);
    let ticks = 0;
    while (w.repairJobs.length > 0 && ticks < 4000) { step(); dn.sync(w); ticks++; }
    expect(w.repairJobs, 'the gatherer finished the job').toHaveLength(0);
    expect(ticks, 'it took a walk, not a click').toBeGreaterThan(1);
    for (const b of w.bonds.values()) expect(b.damageFifths).toBe(0);
    expect(placed.filter((p) => p.kind === 'heal')).toEqual([{ amount: 12, kind: 'heal' }]);
  });
});
