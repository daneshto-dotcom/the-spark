/**
 * SPARK — S180: the CHARACTER SHEET's model, driven headlessly.
 *
 * ⛔ **EVERY EXPECTED NUMBER HERE IS DERIVED FROM THE CONSTANT, NEVER TYPED AS A LITERAL.** That is
 * the S177 rule (*"derive the literal from the constant so the next retune cannot half-land"*) and
 * it is the direct answer to the Council's sharpest testing challenge: a hand-typed table of
 * twenty-four units drifts exactly the way `UNIT_STAT_TABLE.md` already has — it still lists Vlad at
 * 90 pool while the code says 260. A test that hardcodes 260 would go green on a stale sheet the
 * moment someone retunes a boss.
 *
 * ⛔ AND THE ROSTER IS WALKED, NOT SAMPLED. A new creature type cannot ship without a readable card.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { makeWorld, type World } from '../state/world.ts';
import { CREATURE_CONFIGS, getCreatureConfig } from '../state/creatures/voltkin-config.ts';
import type { CreatureType } from '../state/creatures/creature.ts';
import { applySpawnCreature } from '../state/creatures/creatureLifecycle.ts';
import { attackFifths, unitPoolFifths } from '../state/stats.ts';
import { T9_BOSS_NAMES, T9_BOSS_TYPE } from '../state/t9BossIds.ts';
import { asPlayerId, type CreatureId } from '../types.ts';
import { characterSheetModel, creatureDisplayName, statRowsFor } from './characterSheetModel.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function world2(): World {
  const w = makeWorld(0);
  w.isHost = true;
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]));
  return w;
}

/** Put one creature of `type` on the board for `seat` and hand back its id. */
function put(w: World, type: CreatureType, seat = P0): CreatureId {
  const before = new Set(w.creatures.keys());
  applySpawnCreature(w, {
    type: 'SPAWN_CREATURE',
    creatureType: type,
    ownerPlayerId: seat,
    pos: { x: 300, y: 300 },
    targetPos: { x: 900, y: 300 },
    sourceSpawnerId: null,
  });
  for (const id of w.creatures.keys()) if (!before.has(id)) return id;
  throw new Error(`nothing spawned for ${type}`);
}

const ALL_TYPES = Object.keys(CREATURE_CONFIGS) as CreatureType[];

describe('characterSheetModel — the card a player reads', () => {
  it('gives EVERY creature in the roster a readable card, with no raw type ids leaking', () => {
    const w = world2();
    for (const type of ALL_TYPES) {
      const id = put(w, type);
      const view = characterSheetModel(w, P0, { kind: 'creature', id });
      expect(view, type).not.toBeNull();
      // A name a player would say, never the code's identifier — the LASERTURRET defect the codex
      // already had to fix once.
      expect(view!.title, type).not.toBe(type);
      expect(view!.title.length, type).toBeGreaterThan(0);
      expect(view!.stats, type).toHaveLength(4);
    }
  });

  it('prints the ladder, not a second scale — pool and per-swing come off the shipped functions', () => {
    const w = world2();
    for (const type of ALL_TYPES) {
      const cfg = getCreatureConfig(type);
      const id = put(w, type);
      const view = characterSheetModel(w, P0, { kind: 'creature', id })!;
      // ⛔ DERIVED, so a retune moves the expectation with the game rather than breaking this test
      // into a hand-edit that could half-land.
      expect(view.health.max, type).toBe(unitPoolFifths(cfg.hp, cfg.def));
      const atk = view.stats.find((r) => r.label === 'ATK')!;
      const hp = view.stats.find((r) => r.label === 'HP')!;
      expect(atk.derived, type).toBe(`${attackFifths(cfg.atk, cfg.pen)} a swing`);
      expect(hp.derived, type).toBe(`${unitPoolFifths(cfg.hp, cfg.def)} pool`);
    }
  });

  /**
   * ⭐ HIS OWN CORRECTION, PINNED — *"you see the 150 a swing is right where the attack row is, so
   * the 260 pool should be where the HP row is."* My draft had the pool on the DEF row.
   */
  it('puts each derived number on the row it is derived FROM, and nowhere else', () => {
    const rows = statRowsFor(20, 8, 10, 10);
    expect(rows.map((r) => r.label)).toEqual(['ATK', 'PEN', 'HP', 'DEF']);
    expect(rows.find((r) => r.label === 'ATK')!.derived).toBe(`${attackFifths(10, 10)} a swing`);
    expect(rows.find((r) => r.label === 'HP')!.derived).toBe(`${unitPoolFifths(20, 8)} pool`);
    expect(rows.find((r) => r.label === 'PEN')!.derived).toBeNull();
    expect(rows.find((r) => r.label === 'DEF')!.derived).toBeNull();
  });

  it('reads a boss name out of the ONE name table, so the trademark question stays one edit', () => {
    for (const [race, type] of Object.entries(T9_BOSS_TYPE) as [keyof typeof T9_BOSS_NAMES, CreatureType][]) {
      expect(creatureDisplayName(type)).toBe(T9_BOSS_NAMES[race]);
    }
  });

  /**
   * ⛔ THE SNAPSHOT HAZARD GEMINI-AUDITOR RAISED IN COUNCIL. `applySnapshotCore` CLEARS and rebuilds
   * `world.creatures`, so a card holding an object reference would render a detached ghost forever.
   * Holding the id means a vanished subject reports `null` and the renderer can freeze instead.
   */
  it('returns null once its subject is gone, because it holds an id and not the object', () => {
    const w = world2();
    const id = put(w, 'goblinMelee');
    expect(characterSheetModel(w, P0, { kind: 'creature', id })).not.toBeNull();
    w.creatures.delete(id);
    expect(characterSheetModel(w, P0, { kind: 'creature', id })).toBeNull();
  });

  it('shows an ENEMY creature the same card, with live health — his S180 ruling', () => {
    const w = world2();
    const mine = put(w, 'goblinMelee', P0);
    const theirs = put(w, 'goblinMelee', P1);
    const a = characterSheetModel(w, P0, { kind: 'creature', id: mine })!;
    const b = characterSheetModel(w, P0, { kind: 'creature', id: theirs })!;
    expect(b.stats).toEqual(a.stats);
    expect(b.health.max).toBe(a.health.max);
    expect(b.subtitle).toContain('ENEMY');
    expect(a.subtitle).not.toContain('ENEMY');
    // And an enemy card carries NO actions — his *"obviously you can't do fix scrape to enemy towers"*.
    expect(b.actions).toBeNull();
  });

  it('tracks live health as the subject takes damage, rather than snapshotting it at selection', () => {
    const w = world2();
    const id = put(w, 'goblinShield');
    const before = characterSheetModel(w, P0, { kind: 'creature', id })!.health.cur;
    w.creatures.get(id)!.ehp -= 3;
    const after = characterSheetModel(w, P0, { kind: 'creature', id })!.health.cur;
    expect(after).toBe(before - 3);
  });

  it('never reports negative health, however far the pool is driven under', () => {
    const w = world2();
    const id = put(w, 'chewer');
    w.creatures.get(id)!.ehp = -999;
    expect(characterSheetModel(w, P0, { kind: 'creature', id })!.health.cur).toBe(0);
  });

  it('keeps the card fully on the board when its subject is jammed against an edge', () => {
    const w = world2();
    const id = put(w, 'goblinMelee');
    const c = w.creatures.get(id)!;
    c.pos = { x: 0, y: 0 };
    const tl = characterSheetModel(w, P0, { kind: 'creature', id })!.rect;
    expect(tl.x).toBeGreaterThanOrEqual(0);
    expect(tl.y).toBeGreaterThanOrEqual(0);
    c.pos = { x: 5000, y: 5000 };
    const br = characterSheetModel(w, P0, { kind: 'creature', id })!.rect;
    expect(br.x + br.w).toBeLessThanOrEqual(1920);
    expect(br.y + br.h).toBeLessThanOrEqual(1080);
  });

  it('carries no skills row at all — he ruled the boss skills out of the sheet', () => {
    const w = world2();
    const id = put(w, T9_BOSS_TYPE.vampires);
    const view = characterSheetModel(w, P0, { kind: 'creature', id })!;
    expect(Object.keys(view)).not.toContain('skills');
  });
});
