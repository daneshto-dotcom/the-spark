/**
 * SPARK — S165: the depleted stink tower's TAUNT actually taunts something (owner R77).
 *
 * ⛔ THIS FEATURE WAS DEAD CODE AND NOTHING NOTICED FOR SEVERAL SESSIONS. `applyDefenderTick`'s taunt
 * loop had two `continue` guards whose intersection had become EMPTY across the whole production
 * roster:
 *   · gate 1 admitted only `sourceSpawnerId === null` creatures — by S165 the Voltkin alone;
 *   · gate 2 admitted only `targetsStructures: true` creatures — and the Voltkin is `false`.
 * So `c.targetPrimitiveId = d.anchorPrimitiveId` never executed, and a spent tower pulled nothing.
 *
 * ⭐ THE COMMENT ABOVE THOSE GUARDS DESCRIBED THE BUG WITHOUT SEEING IT. It read *"the taunt
 * genuinely pulls GOBLINS and only goblins right now"* and called that "a real limitation, not a
 * bug". It had been true when free starter goblins were minted with a null spawner id; R49 deleted
 * those, S151 gave every goblin a tower spawner id, and the sentence quietly became false.
 *
 * ⚠ AND IT IS THE SECOND CONSUMER OF THE SAME DRIFT. `bots/botBrain.ts`'s `nearestChewer` filtered on
 * the identical predicate and had also stopped meaning what it said. Its S165 fix note warned that
 * "a provenance check is what drifted, and it will drift again the moment another spawner-sourced
 * creature is added". This file is that warning being right.
 *
 * The guard now tests the property the comment always CLAIMED to be testing — a creature mid-chew is
 * glued to its bond — via `chewsConnectors`, which is a config fact rather than a provenance proxy.
 */
import { describe, expect, it } from 'vitest';

import { applyDefenderTick } from './defenderLifecycle.ts';
import { makeDefender } from './defender.ts';
import { makeCreature } from '../creatures/creature.ts';
import {
  CHEWER_CONFIG,
  GOBLIN_MELEE_CONFIG,
  RACE_UNIT_CONFIG,
  VOLTKIN_CONFIG,
} from '../creatures/voltkin-config.ts';
import { makeWorld, type World } from '../world.ts';
import {
  asCreatureId,
  asDefenderId,
  asPlayerId,
  asPrimitiveId,
  asSpawnerId,
  type CreatureId,
} from '../../types.ts';

const OWNER = asPlayerId(0);
const ENEMY = asPlayerId(1);
const ANCHOR = asPrimitiveId(77);
const AT = { x: 500, y: 500 };

/** A DEPLETED stink tower at AT, owned by OWNER. Depleted = no bags left, which is what arms it. */
function depletedTower(w: World) {
  const d = makeDefender({
    id: asDefenderId(1),
    kind: 'stinkTower',
    ownerPlayerId: OWNER,
    anchorPrimitiveId: ANCHOR,
    recipeId: 'stinkTower' as never,
    pos: AT,
    registeredAtTick: 0,
  });
  d.bagsRemaining = 0; // spent — `stinkIsDepleted`
  w.defenders.set(d.id, d);
  return d;
}

/** One ENEMY creature of `config`, well inside STINK_AURA_RADIUS (120). */
function enemyAt(w: World, id: number, config: typeof CHEWER_CONFIG, spawner: number | null): CreatureId {
  const cid = asCreatureId(id);
  w.creatures.set(
    cid,
    makeCreature(config, {
      id: cid,
      ownerPlayerId: ENEMY,
      pos: { x: AT.x + 20, y: AT.y },
      targetPos: { x: AT.x + 20, y: AT.y },
      spawnedAtTick: 0,
      sourceSpawnerId: spawner === null ? null : asSpawnerId(spawner),
    }),
  );
  return cid;
}

function tick(w: World): void {
  applyDefenderTick(w, { type: 'DEFENDER_TICK', defenderId: asDefenderId(1) });
}

describe('a DEPLETED stink tower taunts the units that can actually answer it (owner R77)', () => {
  it('⭐ pulls a GOBLIN — the case the old comment claimed already worked, and which had stopped', () => {
    const w = makeWorld(5);
    depletedTower(w);
    // Exactly the shape goblinTowerFeed produces: a goblin carrying a real spawner id. Under the old
    // provenance gate this was rejected, which is what made the whole feature unreachable.
    const g = enemyAt(w, 1, GOBLIN_MELEE_CONFIG, 9);
    tick(w);
    expect(w.creatures.get(g)!.targetPrimitiveId).toBe(ANCHOR);
  });

  it('⭐ pulls a RACE UNIT — free, structure-seeking, and carrying a castle sentinel id', () => {
    const w = makeWorld(5);
    depletedTower(w);
    const r = enemyAt(w, 1, RACE_UNIT_CONFIG, -1); // negative = castle sentinel (R133)
    tick(w);
    expect(w.creatures.get(r)!.targetPrimitiveId).toBe(ANCHOR);
  });

  it('⛔ does NOT pull a CHEWER — it is mid-chew business and must stay glued to its bond', () => {
    // This is the guard's actual purpose, and it now says so directly (`chewsConnectors`) instead of
    // approximating it with "has a spawner id".
    const w = makeWorld(5);
    depletedTower(w);
    const c = enemyAt(w, 1, CHEWER_CONFIG, 9);
    tick(w);
    expect(w.creatures.get(c)!.targetPrimitiveId).toBeNull();
  });

  it('⛔ does NOT pull a VOLTKIN — it never targets structures, so the field would go unread', () => {
    const w = makeWorld(5);
    depletedTower(w);
    const v = enemyAt(w, 1, VOLTKIN_CONFIG, null);
    tick(w);
    expect(w.creatures.get(v)!.targetPrimitiveId).toBeNull();
  });

  it('⛔ does NOT pull the tower OWNER own units', () => {
    const w = makeWorld(5);
    depletedTower(w);
    const cid = asCreatureId(1);
    w.creatures.set(cid, makeCreature(GOBLIN_MELEE_CONFIG, {
      id: cid,
      ownerPlayerId: OWNER, // same seat as the tower
      pos: { x: AT.x + 20, y: AT.y },
      targetPos: { x: AT.x + 20, y: AT.y },
      spawnedAtTick: 0,
      sourceSpawnerId: asSpawnerId(9),
    }));
    tick(w);
    expect(w.creatures.get(cid)!.targetPrimitiveId).toBeNull();
  });

  it('⛔ ANTI-VACUITY — a tower with bags LEFT taunts nobody', () => {
    // Without this, every assertion above would pass just as well against a taunt that never runs.
    const w = makeWorld(5);
    const d = depletedTower(w);
    d.bagsRemaining = 3; // not depleted
    const g = enemyAt(w, 1, GOBLIN_MELEE_CONFIG, 9);
    tick(w);
    expect(w.creatures.get(g)!.targetPrimitiveId).toBeNull();
  });
});
