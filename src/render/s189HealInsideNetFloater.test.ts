/**
 * ⭐⭐ S189 (owner R190-I) — A HIT AND A HEAL ON THE SAME TICK PRINT AS TWO NUMBERS, IN THEIR OWN COLOURS.
 *
 * > *"It has to show -12 and +2 separately, in different colors … it shows every single hit or heal.
 * > They can stack on top of each other … however fast you take damage or heal, that's how fast it
 * > should show."* — owner, S189
 *
 * FLIPPED FROM THE PIN IT USED TO BE. Until R190-I this file pinned the gap: a BLOOD DEBT unit taking
 * 12 and healing 2 on one tick printed ONE red "10" — the true 12 and the green 2 both invisible —
 * because `damageNumbers.ts` diffed `ehp` alone. `Creature.healedFifths` (a monotonic heal counter,
 * written at every heal site, riding the wire) now lets `creaturePoolChange` split the two.
 *
 * DRIVEN FOR REAL: the strike funnel (`damageEntity`) and the lifesteal batch (`applyPendingLifesteal`,
 * the pair `runHostTick` runs) into the real `DamageNumbers`; and, for the JOINER, the real
 * `HostSync → ClientSync.receive → interpolateInto` path into a second `DamageNumbers` on the client
 * world. Only Pixi's `Text` is faked (Node has no canvas). Mutation-tested: dropping the counter from
 * `creaturePoolChange` turns the split cases back into the old net red number.
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

const { GOBLIN_MELEE_ATK, GOBLIN_MELEE_PEN, NET_RENDER_DELAY_MS, PLAYER_COLORS, phaseDurationTicks } = await import('../constants.ts');
const { dispatch, makeWorld } = await import('../state/world.ts');
const { damageEntity } = await import('../state/damage.ts');
const { applyPendingLifesteal, lifestealFifths, BLOOD_DEBT_LIFESTEAL_PCT, CRIMSON_TIDE_LIFESTEAL_PCT } =
  await import('../state/racial/lifesteal.ts');
const { asCreatureId, makeCreature } = await import('../state/creatures/creature.ts');
const { getCreatureConfig } = await import('../state/creatures/voltkin-config.ts');
const { attackFifths } = await import('../state/stats.ts');
const { HostSync, ClientSync } = await import('../net/sync.ts');
const { asPlayerId, asSpawnerId } = await import('../types.ts');
const { DamageNumbers, creaturePoolChange } = await import('./damageNumbers.ts');

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const SWING = attackFifths(GOBLIN_MELEE_ATK, GOBLIN_MELEE_PEN); // 12 — the one ladder
const GREEN = 0x2fbf3f;

type Floater = { text: string; color: 'red' | 'green' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fight(picks: Array<'racial' | 'hp'>): { w: any; mine: any; theirs: any } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = makeWorld(0x189a);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  const pl = w.players.get(P0);
  pl.raceId = 'vampires';
  pl.draftPicks = [...picks];
  const unit = (owner: ReturnType<typeof asPlayerId>, x: number) => {
    const c = makeCreature(getCreatureConfig('t3Warband'), {
      id: asCreatureId(w.nextCreatureId++), ownerPlayerId: owner, pos: { x, y: 500 }, targetPos: { x, y: 500 },
      spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(900 + w.creatures.size), clock: w,
    });
    w.creatures.set(c.id, c);
    return c;
  };
  // A warband, not a goblin: a goblin's pool is 7 fifths and one 12 kills it, so there is no heal to see.
  return { w, mine: unit(P0, 500), theirs: unit(P1, 520) };
}

/** One host tick's strike batch, exactly as `runHostTick` frames it: open, strike, land the heals. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function batch(w: any, strikes: () => void): void {
  w.pendingLifestealFifths = new Map();
  strikes();
  applyPendingLifesteal(w);
  w.pendingLifestealFifths = null;
}

/** The two units trade one swing each; mine heals from its own. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function trade(w: any, mine: any, theirs: any): void {
  batch(w, () => {
    damageEntity(w, { kind: 'creature', id: mine.id }, SWING, 'creature', { kind: 'creature', id: theirs.id });
    damageEntity(w, { kind: 'creature', id: theirs.id }, SWING, 'creature', { kind: 'creature', id: mine.id });
  });
}

function read(dn: unknown): Floater[] {
  const live = (dn as { live: Array<{ text: { text: string; style: { o?: { fill?: number } } } }> }).live;
  return live.map((f) => ({ text: f.text.text, color: f.text.style.o?.fill === GREEN ? 'green' : 'red' }));
}

/** HOST seat: sync to seed the watch, act, sync again — the floaters the act produced. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hostFloaters(w: any, act: () => void): Floater[] {
  const dn = new DamageNumbers();
  dn.sync(w);
  act();
  dn.sync(w);
  return read(dn);
}

/**
 * JOINER seat: the host world crosses the real sync path at snapshot 1 (before) and 2 (after), and a
 * second `DamageNumbers` watches the CLIENT world. `strip` removes the counter from the wire — a host
 * build that never wrote it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function joinerFloaters(w: any, act: () => void, strip = false): Floater[] {
  const host = new HostSync();
  const client = new ClientSync();
  const cw = makeWorld(0);
  cw.isHost = false;
  cw.gameMode = '1v1';
  cw.gameState = 'LOBBY';
  const send = (now: number): void => {
    const msg = host.buildSnapshotMessage(w);
    if (strip) for (const c of msg.snapshot.creatures ?? []) delete (c as { healedFifths?: number }).healedFifths;
    client.receive(msg, now);
    client.interpolateInto(cw, now, NET_RENDER_DELAY_MS);
  };
  const dn = new DamageNumbers();
  send(1000);
  dn.sync(cw);
  act();
  w.tick += 6;
  send(1100);
  dn.sync(cw);
  return read(dn);
}

describe('⭐⭐ S189 R190-I — HOST: the trade prints the hit AND the heal, each in its colour', () => {
  it('BLOOD DEBT: red 12 and green 2 over my unit, red 12 over theirs — three numbers, not one', () => {
    const { w, mine, theirs } = fight(['racial']);
    const heal = lifestealFifths(SWING, BLOOD_DEBT_LIFESTEAL_PCT);
    expect(heal).toBe(2);
    const out = hostFloaters(w, () => trade(w, mine, theirs));
    expect(out.filter((f) => f.color === 'red').map((f) => f.text).sort()).toEqual([String(SWING), String(SWING)]);
    expect(out.filter((f) => f.color === 'green')).toEqual([{ text: String(heal), color: 'green' }]);
    expect(out.map((f) => f.text)).not.toContain(String(SWING - heal)); // the old net "10" is gone
  });

  it('CRIMSON TIDE: red 12 and green 6 — no longer a red "6"', () => {
    // L5 is draft index 1; a seat with 'racial' there holds CRIMSON TIDE.
    const { w, mine, theirs } = fight(['hp', 'racial']);
    const heal = lifestealFifths(SWING, CRIMSON_TIDE_LIFESTEAL_PCT);
    expect(heal).toBe(6);
    const out = hostFloaters(w, () => trade(w, mine, theirs));
    expect(out).toContainEqual({ text: String(heal), color: 'green' });
    expect(out.filter((f) => f.color === 'red').map((f) => f.text)).toEqual([String(SWING), String(SWING)]);
  });
});

describe('⭐⭐ S189 R190-I — JOINER: the same two numbers, off the wire', () => {
  it('a joiner applying 10 Hz snapshots prints red 12 + green 2 for my unit, red 12 for theirs', () => {
    const { w, mine, theirs } = fight(['racial']);
    const out = joinerFloaters(w, () => trade(w, mine, theirs));
    expect(out.filter((f) => f.color === 'red').map((f) => f.text).sort()).toEqual([String(SWING), String(SWING)]);
    expect(out.filter((f) => f.color === 'green')).toEqual([{ text: '2', color: 'green' }]);
  });

  it('⚠ STALE PEER — a host that never writes the counter: the joiner falls back to the old net number, no error', () => {
    const { w, mine, theirs } = fight(['racial']);
    const out = joinerFloaters(w, () => trade(w, mine, theirs), true);
    expect(out).toContainEqual({ text: String(SWING - 2), color: 'red' });
    expect(out.filter((f) => f.color === 'green')).toEqual([]);
  });
});

describe('✅ the single cases stay exact', () => {
  it('damage alone prints the true swing, red', () => {
    const { w, mine, theirs } = fight(['hp']);
    const out = hostFloaters(w, () => batch(w, () => {
      damageEntity(w, { kind: 'creature', id: mine.id }, SWING, 'creature', { kind: 'creature', id: theirs.id });
    }));
    expect(out).toEqual([{ text: String(SWING), color: 'red' }]);
  });

  it('a heal alone prints the true heal, green (and the enemy its 12, red)', () => {
    const { w, mine, theirs } = fight(['racial']);
    damageEntity(w, { kind: 'creature', id: mine.id }, SWING, 'creature', { kind: 'creature', id: theirs.id });
    const out = hostFloaters(w, () => batch(w, () => {
      damageEntity(w, { kind: 'creature', id: theirs.id }, SWING, 'creature', { kind: 'creature', id: mine.id });
    }));
    expect(out).toContainEqual({ text: String(lifestealFifths(SWING, BLOOD_DEBT_LIFESTEAL_PCT)), color: 'green' });
    expect(out).toContainEqual({ text: String(SWING), color: 'red' });
    expect(out).toHaveLength(2);
  });
});

describe('creaturePoolChange — the arithmetic, and its two fallbacks', () => {
  it('splits a 12 hit and a 2 heal', () => {
    expect(creaturePoolChange(100, 90, 0, 2)).toEqual({ damage: 12, heal: 2 });
  });
  it('a heal bigger than the hit still shows both', () => {
    expect(creaturePoolChange(100, 105, 4, 13)).toEqual({ damage: 4, heal: 9 });
  });
  it('a counter that went DOWN (host migration onto an older build) counts no heal — net reading', () => {
    expect(creaturePoolChange(100, 90, 50, 0)).toEqual({ damage: 10, heal: 0 });
  });
  it('a rise the counter does not explain is shown as a heal, as before', () => {
    expect(creaturePoolChange(100, 107, 0, 0)).toEqual({ damage: 0, heal: 7 });
  });
});
