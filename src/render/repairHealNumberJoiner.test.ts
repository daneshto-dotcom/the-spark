/**
 * ⭐⭐ S193 (owner T11, joiner half) — **A JOINER SEES THE SAME ONE GREEN REPAIR NUMBER THE HOST DOES.**
 *
 * > *"every healing should show … just like damage is shown on every hit."* — owner, S192
 *
 * `structureHealHits` is host-local, so until S193 a peer saw only the shape refills (one green each)
 * and never the connector half. The joiner now DERIVES the number from synced state: shape `hp` that
 * rose plus `Bond.damageFifths` that fell, per structure, unless a connector of that structure vanished
 * the same frame (a break's drain). No wire field.
 *
 * DRIVEN FOR REAL: a real build, real `damageConnector`, the real `REPAIR_STRUCTURE` through `dispatch`
 * on the host; the host world crosses `HostSync.buildSnapshotMessage → ClientSync.receive →
 * interpolateInto` (which runs `applyNetSnapshot`) into a client world, watched by a second
 * `DamageNumbers`. Only Pixi's `Text` is faked.
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

const { NET_RENDER_DELAY_MS, PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } = await import('../constants.ts');
const { makeIdlePlayer } = await import('../game/player.ts');
const { asPlayerId } = await import('../types.ts');
const { makeWorld, dispatch } = await import('../state/world.ts');
const { blueprintBill } = await import('../state/blueprints.ts');
const { applyBuildBlueprint } = await import('../state/blueprintBuild.ts');
const { makeCastleBank } = await import('../state/castleBank.ts');
const { damageConnector } = await import('../state/damage.ts');
const { runGodlyMatcherCore } = await import('../state/godlyMatcherCore.ts');
const { HostSync, ClientSync } = await import('../net/sync.ts');
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
  for (const t of [SparkType.Spiral, SparkType.Square, SparkType.Circle, SparkType.Triangle]) {
    bank[t as number] = (bank[t as number] ?? 0) + 3; // the repair fee
  }
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

/** The joiner seat: snapshot before, `act` on the host, snapshot after — what the client's watcher printed. */
function joiner(w: any, act: () => void): { placed: Placed[]; cw: any } {
  const host = new HostSync();
  const client = new ClientSync();
  const cw: any = makeWorld(0);
  cw.isHost = false;
  cw.gameMode = '1v1';
  cw.gameState = 'LOBBY';
  const send = (now: number): void => {
    client.receive(host.buildSnapshotMessage(w), now);
    client.interpolateInto(cw, now, NET_RENDER_DELAY_MS);
  };
  const dn: any = new DamageNumbers();
  send(1000);
  expect(cw.bonds.size, 'fixture: the bonds crossed the wire').toBe(w.bonds.size);
  dn.sync(cw);
  const placed = recorder(dn);
  act();
  w.structureHealHits.length = 0; // the HOST's renderer consumes its own record; none reaches a peer
  w.tick += 6;
  send(1100);
  dn.sync(cw);
  return { placed, cw };
}

describe('⭐⭐ S193 T11 — JOINER: a repair prints ONE total green number, derived off the wire', () => {
  it('two chewed connectors: one green equal to the banks the repair cleared (the host prints the same 12)', () => {
    const w = tower();
    const [b1, b2] = [...w.bonds.keys()];
    expect(damageConnector(w, b1, 7, null, 'physical')).toBe(false);
    expect(damageConnector(w, b2, 5, null, 'physical')).toBe(false);
    const { placed, cw } = joiner(w, () => dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: seed(w) }));
    for (const b of cw.bonds.values()) expect(b.damageFifths, 'fixture: the repair crossed the wire').toBe(0);
    expect(placed).toEqual([{ amount: 12, kind: 'heal' }]);
  });

  it('a chipped shape AND a chewed connector: ONE number, the sum — no per-shape green on top', () => {
    const w = tower();
    damageConnector(w, [...w.bonds.keys()][0], 9, null, 'physical');
    [...w.primitives.values()][1].hp = PRIMITIVE_MAX_HP - 20;
    const { placed } = joiner(w, () => dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: seed(w) }));
    expect(placed).toEqual([{ amount: 29, kind: 'heal' }]);
  });

  it('negative: a BREAK drains every surviving bank on the same tick — the joiner prints no green', () => {
    const w = tower();
    const ids = [...w.bonds.keys()];
    for (const id of ids) damageConnector(w, id, 3, null, 'physical');
    const { placed } = joiner(w, () => {
      dispatch(w, { type: 'SEVER_BOND', bondId: ids[0], playerId: P0, cause: 'unit' } as never);
      for (const b of w.bonds.values()) b.damageFifths = 0; // the drain that paid the pool
    });
    expect(placed.filter((p) => p.kind === 'heal')).toEqual([]);
  });

  it('negative: nothing healed, nothing printed (a fresh snapshot is not a heal)', () => {
    const w = tower();
    const { placed } = joiner(w, () => {});
    expect(placed).toEqual([]);
  });
});

describe('S193 T11 — HOST: the record still wins, so the derivation never doubles it', () => {
  it('host seat: exactly one green 12, not 12 + a derived 12', () => {
    const w = tower();
    const [b1, b2] = [...w.bonds.keys()];
    damageConnector(w, b1, 7, null, 'physical');
    damageConnector(w, b2, 5, null, 'physical');
    const dn: any = new DamageNumbers();
    dn.sync(w);
    const placed = recorder(dn);
    dispatch(w, { type: 'REPAIR_STRUCTURE', playerId: P0, primitiveId: seed(w) });
    dn.sync(w);
    expect(placed).toEqual([{ amount: 12, kind: 'heal' }]);
  });
});
