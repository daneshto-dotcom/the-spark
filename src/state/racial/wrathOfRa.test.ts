/**
 * SPARK — S188 P11 — **WRATH OF RA (`mummies.l10`)**, pinned.
 *
 * > *"at level 10, they will have the power of Ra, but times three. So you can use it three times per
 * > fight phase … It's only if you've chosen Power of Ra level zero, you can upgrade it … if the
 * > mummies did not choose Power of Ra level zero then instead at level 10 they will receive something
 * > else completely, which is a sandworm … Just record it for now and don't implement that part yet."*
 *
 * Two halves, and both are the kind that fail silently:
 *   1. THE CONDITIONAL OFFER — the first racial offer that depends on the SEAT, not just the race.
 *      Both seats are tested: the one holding POWER OF RA is offered WRATH; the one that took the
 *      general sees COMING SOON (the sandworm is ruled, not built) and cannot take it by any route.
 *   2. THE CHARGES — three casts a fight, a fourth refused, all three refilled next fight, and the
 *      three strikes REACH their victims through the real host tick even when they overlap.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, RA_COLUMN_ATK, RA_COLUMN_COUNT, RA_COLUMN_PEN, RA_COLUMN_TICKS } from '../../constants.ts';
import { asPlayerId, asSpawnerId, type CreatureId, type PlayerId } from '../../types.ts';
import type { Controls } from '../../input/controls.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { mulberry32 } from '../rng.ts';
import { attackFifths } from '../stats.ts';
import { raColumnImpactTick, raColumnPos } from '../bossSkillsPharaohRitual.ts';
import { draftIndexForWave, generalPickForWave, type DraftPick } from '../draft.ts';
import { autoPickFor, draftOptionsFor, openDraftIfDue, pickIsOffered, playerHoldsPerk, tickDraft, DRAFT_DEADLINE_TICKS } from '../draftEvent.ts';
import { RACIAL_PERK_BUILT, RACIAL_PERK_REQUIRES, perkDraftIndex, racialPerkFor, seatHoldsPerk } from '../racialPerks.ts';
import { hashWorldStateFull } from '../stateHashFull.ts';
import { restore, snapshot } from '../save.ts';
import { raStrikeColumnPos } from './powerOfRa.ts';
import {
  WRATH_OF_RA_CHARGES,
  raCastRefusal,
  raChargesFor,
  raChargesLeft,
  raStrikesFromWire,
  type RaStrike,
} from './powerOfRaRules.ts';

const P0 = asPlayerId(0); // mummies
const P1 = asPlayerId(1); // orcs — the enemy

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
const deps = (): HostTickDeps => ({
  spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)), controls: stubControls,
  botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
}) as unknown as HostTickDeps;

/** A 1v1 with seat 0 = mummies holding exactly `picks`, pinned to a long FIGHT on `wave`. */
function world(picks: DraftPick[], wave = 11): World {
  const w = makeWorld(0x188a);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0]!, raceId: 'mummies' },
      { seat: 1, color: PLAYER_COLORS[1]!, raceId: 'orcs' },
    ],
  });
  w.draft = null;
  w.players.get(P0)!.draftPicks.splice(0, Infinity, ...picks);
  w.waveNumber = wave;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  return w;
}
const WRATH: DraftPick[] = ['racial', 'hp', 'racial'];
const cast = (w: World, x: number, y: number): void => {
  dispatch(w, { type: 'CAST_POWER_OF_RA', playerId: P0, x, y });
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 P11 — the registry: WRATH OF RA is mummies level 10, and it requires POWER OF RA', () => {
  it('sits at draft index 2 (wave 11), is built, and names its requirement', () => {
    expect(perkDraftIndex('mummies.l10')).toBe(2);
    expect(draftIndexForWave(11)).toBe(2);
    expect(perkDraftIndex('mummies.l0')).toBe(0);
    expect(perkDraftIndex('mummies.l5')).toBe(1);
    expect(RACIAL_PERK_BUILT['mummies.l10']).toBe(true);
    expect(RACIAL_PERK_REQUIRES['mummies.l10']).toBe('mummies.l0');
    expect(WRATH_OF_RA_CHARGES, 'his "times three"').toBe(3);
  });
});

describe('S188 P11 — ⛔ THE CONDITIONAL OFFER, both seats', () => {
  it('⭐ a seat that took POWER OF RA is offered WRATH OF RA at wave 11', () => {
    expect(draftOptionsFor(11, 'mummies', ['racial', 'hp']).racial).toBe('mummies.l10');
    expect(racialPerkFor('mummies', 2, ['racial', 'def'])).toBe('mummies.l10');
    const w = world(['racial', 'hp'], 11);
    expect(pickIsOffered(w, P0, 11, 'racial')).toBe(true);
    expect(autoPickFor(w, P0, 11), 'the deadline takes it for him').toBe('racial');
  });

  it('⛔ a seat that took the GENERAL at level 0 is owed the SANDWORM — not built, so COMING SOON', () => {
    expect(draftOptionsFor(11, 'mummies', ['hp', 'hp']).racial, 'the tile is COMING SOON').toBeNull();
    const w = world(['hp', 'racial'], 11);
    expect(pickIsOffered(w, P0, 11, 'racial'), 'a modified client cannot take it').toBe(false);
    expect(autoPickFor(w, P0, 11), 'the deadline falls back to the general').toBe(generalPickForWave(11));
  });

  it('⛔ without the seat\'s picks the conditional perk is never offered (the safe default)', () => {
    expect(draftOptionsFor(11, 'mummies').racial).toBeNull();
    expect(racialPerkFor('mummies', 2)).toBeNull();
  });

  it('⛔ another race is never offered it, whatever it picked', () => {
    for (const race of ['vampires', 'zombies', 'orcs', 'demons', 'nagas'] as const) {
      expect(racialPerkFor(race, 2, ['racial', 'racial'])).not.toBe('mummies.l10');
    }
  });

  it('⛔ a racial pick at index 2 WITHOUT POWER OF RA does not read as holding WRATH (the future sandworm)', () => {
    const p = { raceId: 'mummies' as const, draftPicks: ['hp', 'def', 'racial'] as DraftPick[] };
    expect(seatHoldsPerk(p, 'mummies.l10')).toBe(false);
    expect(raChargesFor(p), 'no charges at all').toBe(0);
    expect(seatHoldsPerk({ ...p, draftPicks: WRATH }, 'mummies.l10')).toBe(true);
  });

  it('⭐ END TO END through the real draft: the holder takes it, the other seat\'s deadline gives the general', () => {
    const w = world(['racial', 'hp'], 11);
    w.players.get(P1)!.draftPicks.splice(0, Infinity, 'hp', 'def');
    w.matchPhase = 'BUILD';
    openDraftIfDue(w, 11);
    expect(w.draft, 'the wave-11 draft opened').not.toBeNull();
    dispatch(w, { type: 'CHOOSE_DRAFT', playerId: P0, pick: 'racial' });
    expect(playerHoldsPerk(w, P0, 'mummies.l10')).toBe(true);

    // And a mummies seat without POWER OF RA, at the same draft, by the deadline:
    const v = world(['hp', 'def'], 11);
    v.players.get(P1)!.draftPicks.splice(0, Infinity, 'hp', 'def');
    v.matchPhase = 'BUILD';
    openDraftIfDue(v, 11);
    dispatch(v, { type: 'CHOOSE_DRAFT', playerId: P0, pick: 'racial' });
    expect(v.players.get(P0)!.draftPicks, 'the racial pick was refused').toEqual(['hp', 'def']);
    v.tick += DRAFT_DEADLINE_TICKS;
    tickDraft(v);
    expect(v.players.get(P0)!.draftPicks).toEqual(['hp', 'def', generalPickForWave(11)]);
    expect(playerHoldsPerk(v, P0, 'mummies.l10')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 P11 — THREE CHARGES a fight', () => {
  it('⭐ three casts land, a fourth is a whole-world no-op, and the button says USED', () => {
    const w = world(WRATH);
    expect(raChargesLeft(w, P0)).toBe(3);
    cast(w, 300, 300);
    cast(w, 900, 300);
    cast(w, 1500, 300);
    expect(w.players.get(P0)!.raStrikes.map((s) => [s.x, s.y])).toEqual([[300, 300], [900, 300], [1500, 300]]);
    expect(raChargesLeft(w, P0)).toBe(0);
    expect(raCastRefusal(w, P0)).toBe('USED');
    const before = hashWorldStateFull(w);
    cast(w, 600, 600);
    expect(w.players.get(P0)!.raStrikes).toHaveLength(3);
    expect(hashWorldStateFull(w), 'the fourth cast changed nothing').toBe(before);
  });

  it('⭐ the charges REFILL next fight, and the old fight\'s strikes are dropped', () => {
    const w = world(WRATH, 11);
    cast(w, 300, 300);
    cast(w, 900, 300);
    cast(w, 1500, 300);
    w.waveNumber = 12; // the next fight (waves turn on entry into BUILD)
    expect(raChargesLeft(w, P0)).toBe(3);
    expect(raCastRefusal(w, P0)).toBeNull();
    cast(w, 700, 700);
    expect(w.players.get(P0)!.raStrikes, 'last fight\'s three are gone; this is charge 0').toEqual([
      expect.objectContaining({ wave: 12, x: 700, y: 700 }),
    ]);
    expect(raChargesLeft(w, P0)).toBe(2);
  });

  it('⛔ POWER OF RA alone is still EXACTLY once — even at wave 11, having taken the general there', () => {
    const w = world(['racial', 'hp', 'atk'], 11);
    expect(raChargesFor(w.players.get(P0)!)).toBe(1);
    cast(w, 300, 300);
    cast(w, 900, 300);
    expect(w.players.get(P0)!.raStrikes).toHaveLength(1);
    expect(raCastRefusal(w, P0)).toBe('USED');
  });

  it('⭐ charge 0 keeps POWER OF RA\'s pattern; charges 1 and 2 fall in patterns of their own', () => {
    const aim = { x: 900, y: 500 };
    const pattern = (c: number) => Array.from({ length: RA_COLUMN_COUNT }, (_, k) => raStrikeColumnPos(P0, k, aim, c));
    expect(pattern(0)).toEqual(Array.from({ length: RA_COLUMN_COUNT }, (_, k) => raColumnPos(0, k, aim.x, aim.y)));
    expect(pattern(1)).not.toEqual(pattern(0));
    expect(pattern(2)).not.toEqual(pattern(1));
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 P11 — ⭐⭐ REACH: three OVERLAPPING strikes, through the real host tick', () => {
  it('each strike\'s every column lands 300 on an enemy standing on ITS spot', () => {
    const w = world(WRATH);
    const d = deps();
    const s = makeHostTickState(w);
    const aims = [{ x: 400, y: 250 }, { x: 960, y: 250 }, { x: 1500, y: 250 }];
    for (const a of aims) cast(w, a.x, a.y); // all three on ONE tick — the overlap case
    const strikes = w.players.get(P0)!.raStrikes;
    expect(strikes).toHaveLength(3);

    const victims: CreatureId[] = aims.map((a, i) => {
      dispatch(w, {
        type: 'SPAWN_CREATURE', creatureType: 'chewer', ownerPlayerId: P1,
        pos: { ...a }, targetPos: { ...a }, sourceSpawnerId: asSpawnerId(9400 + i),
      });
      const id = [...w.creatures.keys()].at(-1)!;
      const c = w.creatures.get(id)!;
      c.ehp = 10_000;
      c.maxEhp = 10_000;
      return id;
    });

    for (let k = 0; k < RA_COLUMN_COUNT; k++) {
      const impact = raColumnImpactTick(strikes[0]!.untilTick, k);
      while (w.tick < impact - 1) runHostTick(w, d, s);
      const before = victims.map((id) => w.creatures.get(id)!.ehp);
      strikes.forEach((st, charge) => {
        const c = w.creatures.get(victims[charge]!)!;
        const at = raStrikeColumnPos(P0, k, st, charge);
        c.pos = { ...at }; c.prevPos = { ...at }; c.targetPos = { ...at };
      });
      runHostTick(w, d, s);
      expect(w.tick).toBe(impact);
      victims.forEach((id, charge) => {
        expect(before[charge]! - w.creatures.get(id)!.ehp, `strike ${charge} column ${k}`)
          .toBe(attackFifths(RA_COLUMN_ATK, RA_COLUMN_PEN));
      });
    }
    void RA_COLUMN_TICKS;
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 P11 — the list survives the save, the wire and the hash', () => {
  it('⭐ three strikes round-trip in order', () => {
    const w = world(WRATH);
    cast(w, 300, 300);
    cast(w, 900, 300);
    cast(w, 1500, 300);
    const r = makeWorld(1);
    restore(JSON.parse(JSON.stringify(snapshot(w))), r);
    expect(r.players.get(P0)!.raStrikes).toEqual(w.players.get(P0)!.raStrikes);
  });

  it('⛔ the rehydrate drops malformed entries and never keeps more than three', () => {
    const ok = (x: number): RaStrike => ({ wave: 11, x, y: 10, untilTick: 900 });
    expect(raStrikesFromWire([ok(1), { x: 'bad' }, ok(2), null, ok(3), ok(4), ok(5)]))
      .toEqual([ok(1), ok(2), ok(3)]);
    expect(raStrikesFromWire(undefined)).toEqual([]);
    expect(raStrikesFromWire({ 0: ok(1) })).toEqual([]);
  });

  it('⭐ the ORDER is hashed — the index seeds the pattern, so a reorder is a real divergence', () => {
    const w = world(WRATH);
    const a: RaStrike = { wave: 11, x: 100, y: 100, untilTick: 900 };
    const b: RaStrike = { wave: 11, x: 200, y: 200, untilTick: 900 };
    w.players.get(P0)!.raStrikes = [a, b];
    const ab = hashWorldStateFull(w);
    w.players.get(P0)!.raStrikes = [b, a];
    expect(hashWorldStateFull(w)).not.toBe(ab);
  });
});

void (P1 as PlayerId);
