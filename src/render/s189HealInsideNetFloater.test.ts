/**
 * ⚠ S189 LOW (a) — A SAME-TICK HEAL IS HIDDEN INSIDE A NET DAMAGE FLOATER. **STATED, NOT FIXED.**
 *
 * The brief: *"`damageNumbers.ts` emits on the net `ehp` delta — show both, or state why not; do not
 * change R185-D anchoring."* This file is the "state why not", made mechanical: it drives the REAL
 * strike funnel (`damageEntity`) and the REAL lifesteal batch (`applyPendingLifesteal`, exactly the
 * pair `runHostTick` runs) into the REAL `DamageNumbers` class, and pins what a player sees today.
 *
 * WHAT HAPPENS. A BLOOD DEBT unit trades goblin-sized 12s with an enemy in one tick: it takes 12 and
 * heals 2 (20 % of its own swing). `ehp` falls by 10 between two observations, so ONE red "10" is
 * printed — the true 12 and the green 2 are both invisible. Under CRIMSON TIDE (50 %) the same trade
 * prints a red "6". His S181 complaint in the mirror image: *"it says it hits 40 per shot, but it only
 * does 6 … we need to show the ACTUAL damage being taken"*.
 *
 * WHY IT IS NOT FIXED ON THIS BRANCH. The two halves cannot be separated from synced state: `ehp` is
 * the only thing either peer holds, and the heal's size depends on the healer's OWN swing into a
 * target the wire does not name (`trimMirrorCreature` strips `targetCreatureId`). An exact split
 * needs a host-local per-frame record written at the heal sites — the `creatureKillHits` pattern —
 * i.e. a new `World` field (worldTypes + factory + three phase resets + workerSim + stateHashFull
 * 'acknowledged') and writes in `racial/lifesteal.ts` (×2), `bossSkills.ts:121` (Vlad's sap) and
 * `racial/corpseEater.ts:256`. All of that is outside `s189/render`'s file boundary (renderers only),
 * so it is REPORTED with that shape instead (progress file, LOW a). A joiner would still see the net
 * number even then — the same host-only limit `creatureKillHits` already accepts.
 *
 * ⛔ WHEN THAT CHANNEL LANDS, THIS FILE GOES RED ON PURPOSE — re-pin it to "red 12 + green 2", never
 * delete it. The heal-only and damage-only cases below must stay green through that change.
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

const { GOBLIN_MELEE_ATK, GOBLIN_MELEE_PEN, PLAYER_COLORS, phaseDurationTicks } = await import('../constants.ts');
const { dispatch, makeWorld } = await import('../state/world.ts');
const { damageEntity } = await import('../state/damage.ts');
const { applyPendingLifesteal, lifestealFifths, BLOOD_DEBT_LIFESTEAL_PCT, CRIMSON_TIDE_LIFESTEAL_PCT } =
  await import('../state/racial/lifesteal.ts');
const { asCreatureId, makeCreature } = await import('../state/creatures/creature.ts');
const { getCreatureConfig } = await import('../state/creatures/voltkin-config.ts');
const { attackFifths } = await import('../state/stats.ts');
const { asPlayerId, asSpawnerId } = await import('../types.ts');
const { DamageNumbers } = await import('./damageNumbers.ts');

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const SWING = attackFifths(GOBLIN_MELEE_ATK, GOBLIN_MELEE_PEN); // 12 — the one ladder
const GREEN = 0x2fbf3f;

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

/** Sync to seed the watch, act, sync again: the floaters the act produced, with their colour. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function floatersFrom(w: any, act: () => void): Array<{ text: string; color: 'red' | 'green' }> {
  const dn = new DamageNumbers();
  dn.sync(w);
  act();
  dn.sync(w);
  const live = (dn as unknown as { live: Array<{ text: { text: string; style: { o?: { fill?: number } } } }> }).live;
  return live.map((f) => ({ text: f.text.text, color: f.text.style.o?.fill === GREEN ? 'green' : 'red' }));
}

describe('⚠ S189 LOW (a) — the trade in one tick prints ONE net red number (the known, stated gap)', () => {
  it('BLOOD DEBT: takes 12, heals 2 → a single red "10" over my unit; no "12", no green "2"', () => {
    const { w, mine, theirs } = fight(['racial']);
    const heal = lifestealFifths(SWING, BLOOD_DEBT_LIFESTEAL_PCT);
    expect(heal).toBe(2);
    const out = floatersFrom(w, () => batch(w, () => {
      damageEntity(w, { kind: 'creature', id: mine.id }, SWING, 'creature', { kind: 'creature', id: theirs.id });
      damageEntity(w, { kind: 'creature', id: theirs.id }, SWING, 'creature', { kind: 'creature', id: mine.id });
    }));
    // The enemy's floater is its true 12; mine is the NET of 12 in and 2 back.
    expect(out).toContainEqual({ text: String(SWING), color: 'red' });
    expect(out).toContainEqual({ text: String(SWING - heal), color: 'red' });
    expect(out.filter((f) => f.color === 'green')).toEqual([]);
    expect(out).toHaveLength(2);
  });

  it('CRIMSON TIDE: the same trade prints a red "6" — half the swing he would be checking against', () => {
    // L5 is draft index 1; a seat with 'racial' there holds CRIMSON TIDE.
    const { w, mine, theirs } = fight(['hp', 'racial']);
    const heal = lifestealFifths(SWING, CRIMSON_TIDE_LIFESTEAL_PCT);
    expect(heal).toBe(6);
    const out = floatersFrom(w, () => batch(w, () => {
      damageEntity(w, { kind: 'creature', id: mine.id }, SWING, 'creature', { kind: 'creature', id: theirs.id });
      damageEntity(w, { kind: 'creature', id: theirs.id }, SWING, 'creature', { kind: 'creature', id: mine.id });
    }));
    expect(out).toContainEqual({ text: String(SWING - heal), color: 'red' });
    expect(out.filter((f) => f.color === 'green')).toEqual([]);
  });
});

describe('✅ the two cases that ARE exact today — these must stay green through any fix', () => {
  it('damage alone prints the true swing, red', () => {
    const { w, mine, theirs } = fight(['hp']);
    const out = floatersFrom(w, () => batch(w, () => {
      damageEntity(w, { kind: 'creature', id: mine.id }, SWING, 'creature', { kind: 'creature', id: theirs.id });
    }));
    expect(out).toEqual([{ text: String(SWING), color: 'red' }]);
  });

  it('a heal alone prints the true heal, green', () => {
    const { w, mine, theirs } = fight(['racial']);
    // Wound it first (outside the watch), then let it land a blow and heal with nothing coming in.
    damageEntity(w, { kind: 'creature', id: mine.id }, SWING, 'creature', { kind: 'creature', id: theirs.id });
    const out = floatersFrom(w, () => batch(w, () => {
      damageEntity(w, { kind: 'creature', id: theirs.id }, SWING, 'creature', { kind: 'creature', id: mine.id });
    }));
    expect(out).toContainEqual({ text: String(lifestealFifths(SWING, BLOOD_DEBT_LIFESTEAL_PCT)), color: 'green' });
    expect(out).toContainEqual({ text: String(SWING), color: 'red' }); // the enemy's
  });
});
