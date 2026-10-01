/**
 * ⭐⭐ S191 C-8 (owner R190-I, on the CASTLE) — A HIT AND A HEAL ON THE KEEP IN ONE WINDOW PRINT AS TWO
 * NUMBERS, IN THEIR OWN COLOURS.
 *
 * > *"Show every hit and every heal separately, in different colours, stacking … it shows every single
 * > hit or heal … it looks sick"* — owner, R190-I (S190)
 *
 * S189 built it for creatures (`Creature.healedFifths` + `creaturePoolChange`). The castle watch still
 * diffed `castleHp` alone, so a keep under siege that regenerated inside the same window printed the
 * NET — a 40 hit and a 25 regen read as one red "15". On a JOINER that window is a whole 10 Hz snapshot
 * (six ticks), so a besieged keep with regen almost never showed a true number.
 * `Player.castleHealedHp` (a monotonic count of every point the keep has healed, riding the wire) now
 * splits the two, through the SAME pure `creaturePoolChange`.
 *
 * DRIVEN FOR REAL: the regen through the real `runHostTick` (its `castleRegenTick` beat), the hit through
 * the real `damageEntity` castle arm, into the real `DamageNumbers`; the joiner through the real
 * `HostSync → ClientSync.receive → interpolateInto`. Only Pixi's `Text` is faked (Node has no canvas).
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

const { NET_RENDER_DELAY_MS, PLAYER_COLORS, PHYSICS_HZ, phaseDurationTicks } = await import('../constants.ts');
const { dispatch, makeWorld } = await import('../state/world.ts');
const { damageEntity } = await import('../state/damage.ts');
const { castleRegenPerSecond } = await import('../state/castleRegen.ts');
const { castleMaxHpFor } = await import('../state/castleUpgrades.ts');
const { makeHostTickState, runHostTick } = await import('../state/hostTick.ts');
const { Spawner, DEFAULT_SPAWNER_CONFIG } = await import('../game/spawner.ts');
const { mulberry32 } = await import('../state/rng.ts');
const { makeGameStateExtras } = await import('../state/gameState.ts');
const { HostSync, ClientSync } = await import('../net/sync.ts');
const { asPlayerId } = await import('../types.ts');
const { DamageNumbers } = await import('./damageNumbers.ts');

const P0 = asPlayerId(0);
const GREEN = 0x2fbf3f;
const HIT = 40;

type Floater = { text: string; color: 'red' | 'green' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function siege(): { w: any; regen: number; step: () => void } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = makeWorld(0x191c8);
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
  const keep = w.players.get(P0);
  keep.castleRegenLevel = 1;
  const max = castleMaxHpFor(keep.castleUpgrades);
  keep.castleHp = max - 400; // room to heal, far from falling
  // Park the clock one tick BEFORE seat 0's regen beat, so the next host tick regenerates.
  while ((w.tick + 1) % PHYSICS_HZ !== 0) w.tick++;
  const deps = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)),
    controls: { state: { kind: 'Idle' }, applyPerSubstep() {} },
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as never;
  const st = makeHostTickState(w);
  return { w, regen: castleRegenPerSecond(1, max), step: () => runHostTick(w, deps, st) };
}

/** The keep takes HIT through the real castle arm (no attacker: a raid-shaped blow, nothing heals). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hitKeep = (w: any): void => { damageEntity(w, { kind: 'castle', seat: P0 }, HIT, 'player', null); };

function read(dn: unknown): Floater[] {
  const live = (dn as { live: Array<{ text: { text: string; style: { o?: { fill?: number } } } }> }).live;
  return live.map((f) => ({ text: f.text.text, color: f.text.style.o?.fill === GREEN ? 'green' : 'red' }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hostFloaters(w: any, act: () => void): Floater[] {
  const dn = new DamageNumbers();
  dn.sync(w);
  act();
  dn.sync(w);
  return read(dn);
}

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
    if (strip) for (const p of msg.snapshot.players ?? []) delete (p as { castleHealedHp?: number }).castleHealedHp;
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

describe('⭐⭐ S191 C-8 — HOST: a hit and a regen on the keep in one window are two numbers', () => {
  it('REACH: the real host tick regenerates while the keep takes 40 — red 40 AND green regen, not a net', () => {
    const { w, regen, step } = siege();
    expect(regen, 'anti-vacuity: regen level 1 heals something').toBeGreaterThan(0);
    expect(regen).not.toBe(HIT);
    const hpBefore = w.players.get(P0).castleHp;
    const out = hostFloaters(w, () => { hitKeep(w); step(); });
    expect(w.players.get(P0).castleHp, 'the real tick did regenerate').toBe(hpBefore - HIT + regen);
    expect(out.filter((f) => f.color === 'red').map((f) => f.text), 'the hit alone, not the net (pre-fix: one red net number)').toEqual([String(HIT)]);
    expect(out.filter((f) => f.color === 'green').map((f) => f.text)).toEqual([String(regen)]);
  });

  it('negative — a hit alone is one red 40; a regen alone is one green, exactly as before', () => {
    const a = siege();
    expect(hostFloaters(a.w, () => hitKeep(a.w))).toEqual([{ text: String(HIT), color: 'red' }]);
    const b = siege();
    expect(hostFloaters(b.w, () => b.step())).toEqual([{ text: String(b.regen), color: 'green' }]);
  });
});

describe('⭐⭐ S191 C-8 — JOINER: the same two numbers, off the wire', () => {
  it('a joiner applying 10 Hz snapshots prints red 40 + green regen for a keep hit and healed in one snapshot', () => {
    const { w, regen, step } = siege();
    const out = joinerFloaters(w, () => { hitKeep(w); step(); });
    expect(out.filter((f) => f.color === 'red').map((f) => f.text)).toEqual([String(HIT)]);
    expect(out.filter((f) => f.color === 'green').map((f) => f.text)).toEqual([String(regen)]);
  });

  it('⚠ STALE PEER — a host that never writes the counter: the joiner prints the old net number, no error', () => {
    const { w, regen, step } = siege();
    const out = joinerFloaters(w, () => { hitKeep(w); step(); }, true);
    const net = HIT - regen;
    expect(out).toEqual([{ text: String(Math.abs(net)), color: net > 0 ? 'red' : 'green' }]);
  });
});
