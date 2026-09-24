/**
 * SPARK — S188 (audit F3) — the tower card says what the tower ACTUALLY emits for its owner's seat.
 *
 * A naga seat holding `nagas.l5` (APEX PREDATOR) gets elite piranhas from its tower; the card used to
 * say "piranha" regardless. Driven through the real card builder (`characterSheetModel`) on a real,
 * built tower, and the caption held to the same measured width budget as every race's.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { blueprintBill } from '../state/blueprints.ts';
import { applyBuildBlueprint } from '../state/blueprintBuild.ts';
import { makeCastleBank } from '../state/castleBank.ts';
import { RACE_TOWER_IDS } from '../state/raceTowerIds.ts';
import { makeWorld, type World } from '../state/world.ts';
import { asPlayerId } from '../types.ts';
import type { DraftPick } from '../state/draft.ts';
import type { RaceId } from '../state/races.ts';
import {
  characterSheetModel,
  feedCaptionLines,
  feedCaptionMaxWidthPx,
  feedCaptionWidthPx,
  feedHintFor,
} from './characterSheetModel.ts';
import '../state/godlyRecipes/raceTower.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function towerCard(race: RaceId, picks: DraftPick[], viewer = P0): { feedHint: string | null; description: string | null } {
  const w: World = makeWorld(0);
  w.isHost = true;
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!, { x: 0, y: 0 }, race));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  w.players.get(P0)!.draftPicks.push(...picks);
  const bank = makeCastleBank();
  const id = RACE_TOWER_IDS[race];
  for (const [type, count] of blueprintBill(id)) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id, centre: { x: 420, y: 400 } });
  const prim = [...w.primitives.values()][0]!;
  const view = characterSheetModel(w, viewer, { kind: 'structure', primitiveId: prim.id })!;
  return { feedHint: view.feedHint ?? null, description: view.description ?? null };
}

describe('S188 audit F3 — the piranha tower card is seat-aware', () => {
  it('⭐⭐ a naga seat HOLDING nagas.l5: the card names the ELITE piranha, in both lines of copy', () => {
    const c = towerCard('nagas', ['hp', 'racial']);
    expect(c.feedHint).toBe('FEED A SHAPE TO BUILD MORE ELITE PIRANHAS');
    expect(c.description).toBe('Spawns an elite piranha every 15s.');
  });

  it('⭐ it is the OWNER’s seat that decides, whoever is looking at the card', () => {
    expect(towerCard('nagas', ['hp', 'racial'], P1).feedHint).toBe('FEED A SHAPE TO BUILD MORE ELITE PIRANHAS');
  });

  it('negative: a naga seat WITHOUT the pick still reads "piranha"', () => {
    const c = towerCard('nagas', ['hp']);
    expect(c.feedHint).toBe('FEED A SHAPE TO BUILD MORE PIRANHAS');
    expect(c.description).toBe('Spawns a piranha every 15s.');
  });

  it('negative: another race holding ITS level-5 racial keeps its own unit', () => {
    expect(towerCard('orcs', ['hp', 'racial']).feedHint).toBe(feedHintFor(RACE_TOWER_IDS.orcs));
  });

  it('⛔ the longer caption still fits the card: wrapped to two lines, inside the measured budget', () => {
    const hint = towerCard('nagas', ['hp', 'racial']).feedHint as string;
    const [a, b] = feedCaptionLines(hint);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(`${a} ${b}`).toBe(hint);
    expect(feedCaptionWidthPx(hint)).toBeLessThanOrEqual(feedCaptionMaxWidthPx());
  });
});
