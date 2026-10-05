/**
 * ⭐⭐ S194 (teams × master deploys #18–#23) — **THE TEAM RULE ON EVERY SITE THAT LANDED AFTER ROUND 2.**
 *
 * R192-T1 (*"teammates never damage each other … your enemies obviously can't attack each other"*) meets
 * the master code merged in S194: the Saboteur bot's leader pick (S193 R193-AI), the RESIST cue (S192
 * R192-M12), the S191 building cards and the S191 end-of-match stat board. (The zombie boss's death blast —
 * R193-B3, *"It does not hit his own side"* — is proven through the real host tick in `teams.reach.test.ts`.)
 *
 * Every TEAM assertion has its CONTROL (the same setup with an ENEMY, which must still be picked / hit /
 * labelled ENEMY) and its NEGATIVE (the same setup in a free-for-all, which must be the pre-teams answer).
 * The census (`teams.sites.test.ts`) pins each converted site; these prove the sites are REACHED.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, phaseDurationTicks } from '../constants.ts';
import { asPlayerId, asSpawnerId, type PlayerId } from '../types.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asCreatureId, makeCreature, type Creature, type CreatureType } from './creatures/creature.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { addBond, addPrim } from './s191PerfOracle.fixtures.ts';
import { leaderTargetSeat, raidTargetSeat } from '../bots/botBrain.ts';
import { botConfigFor } from '../bots/botConfig.ts';
import { magicBeatResistedAt } from './magicResistCue.ts';
import { characterSheetModel } from '../render/characterSheetModel.ts';
import { matchBoardModel } from '../render/matchBoardModel.ts';
import { arrangeTeamZones } from './teams.ts';

const P = [0, 1, 2, 3].map((s) => asPlayerId(s));
const FFA: (number | undefined)[] = [undefined, undefined, undefined, undefined];

/** Four seats, 0+1 vs 2+3 by default (TL 0 · TR 1 · BR 2 · BL 3), FIGHT, an empty board. */
function fourSeat(teams: (number | undefined)[] = [0, 0, 1, 1]): World {
  const w = makeWorld(0x5194);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s], ...(teams[s] !== undefined ? { team: teams[s] } : {}) })),
    botSeats: [1, 2, 3],
  });
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT') * 10;
  w.creatures.clear();
  w.primitives.clear();
  w.bonds.clear();
  w.draft = null;
  return w;
}

function unit(w: World, owner: PlayerId, at: { x: number; y: number }, type: CreatureType): Creature {
  const c = makeCreature(getCreatureConfig(type), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: owner, pos: { ...at }, targetPos: { ...at },
    spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(900 + w.creatures.size), clock: w,
  });
  w.creatures.set(c.id, c);
  return c;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S194 teams — the Saboteur never hunts a teammate (`leaderTargetSeat`, master S193)', () => {
  /** Seat 0 is the bot. Its teammate (seat 1) is the runaway leader; seat 2 leads the ENEMY side. */
  function scored(teams: (number | undefined)[]): World {
    const w = fourSeat(teams);
    w.scoreByPlayer.set(P[0], 100);
    w.scoreByPlayer.set(P[1], 900);
    w.scoreByPlayer.set(P[2], 500);
    w.scoreByPlayer.set(P[3], 200);
    return w;
  }

  it('⛔ with teams the leader is the top ENEMY, never the teammate on 900', () => {
    expect(leaderTargetSeat(scored([0, 0, 1, 1]), P[0])).toBe(P[2]);
  });

  it('⛔ REACH — the Saboteur personality reads it through `raidTargetSeat` (the raid AND the Ra focus)', () => {
    const cfg = botConfigFor('MID', 'SABOTEUR');
    expect(raidTargetSeat(scored([0, 0, 1, 1]), P[0], cfg)).toBe(P[2]);
  });

  it('NEGATIVE — free-for-all: the 900 seat IS the leader (the pre-teams answer)', () => {
    expect(leaderTargetSeat(scored(FFA), P[0])).toBe(P[1]);
  });

  it('flat among ENEMIES is flat: a teammate ahead does not make a leader', () => {
    const w = scored([0, 0, 1, 1]);
    w.scoreByPlayer.set(P[2], 100);
    w.scoreByPlayer.set(P[3], 100);
    expect(leaderTargetSeat(w, P[0])).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S194 teams — the RESIST cue mirrors the sim: no cue under a teammate\'s rot (R192-M12)', () => {
  /** How many ticks of 600 the cue fires over `owner`'s Archdemon (DEF 8 / MRES 14), next to seat 0's zombie boss. */
  function cues(teams: (number | undefined)[], owner: PlayerId): number {
    const w = fourSeat(teams);
    w.players.get(owner)!.raceId = 'demons';
    unit(w, P[0], { x: 600, y: 330 }, 't9BossZombies' as CreatureType);
    const v = unit(w, owner, { x: 620, y: 330 }, 't9BossDemons' as CreatureType);
    let n = 0;
    for (let t = 0; t < 600; t++) if (magicBeatResistedAt(w, v, w.tick + t)) n++;
    return n;
  }

  it('CONTROL — an ENEMY Archdemon in the rot shows RESIST on some beats', () => {
    expect(cues([0, 0, 1, 1], P[2])).toBeGreaterThan(0);
  });

  it('⛔ a TEAMMATE\'s Archdemon never does (the sim\'s rot spares him — `bossSkills.ts` asks sameTeam)', () => {
    expect(cues([0, 0, 1, 1], P[1])).toBe(0);
  });

  it('NEGATIVE — free-for-all: seat 1 is an enemy, so the cue fires', () => {
    expect(cues(FFA, P[1])).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S194 teams — a teammate\'s building card reads ALLY BUILDING (S191 cards)', () => {
  function subtitle(teams: (number | undefined)[], owner: number): string | undefined {
    const w = fourSeat(teams);
    const a = addPrim(w, owner, 1200, 300);
    const b = addPrim(w, owner, 1240, 300);
    addBond(w, a, b);
    return characterSheetModel(w, P[0], { kind: 'structure', primitiveId: a.id })?.subtitle;
  }
  it('⛔ a teammate\'s', () => expect(subtitle([0, 0, 1, 1], 1)).toBe('ALLY BUILDING'));
  it('CONTROL — an enemy\'s', () => expect(subtitle([0, 0, 1, 1], 2)).toBe('ENEMY BUILDING'));
  it('mine', () => expect(subtitle([0, 0, 1, 1], 0)).toBe('YOUR BUILDING'));
  it('NEGATIVE — free-for-all: seat 1\'s is an ENEMY BUILDING', () => expect(subtitle(FFA, 1)).toBe('ENEMY BUILDING'));
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S194 teams — the end-of-match board crowns the winning SIDE (S191 board)', () => {
  function board(teams: (number | undefined)[]): { headline: string; winners: number[] } {
    const w = fourSeat(teams);
    w.gameState = 'POSTGAME';
    w.lastWinnerId = P[1];
    const m = matchBoardModel(w)!;
    return { headline: m.headline, winners: m.rows.filter((r) => r.isWinner).map((r) => r.seat as number).sort() };
  }
  it('⛔ teams: "TEAM 1 WINS" (the banner\'s words) and both teammates starred', () => {
    expect(board([0, 0, 1, 1])).toEqual({ headline: 'TEAM 1 WINS', winners: [0, 1] });
  });
  it('a seat on no team keeps its own label and stands alone', () => {
    expect(board([undefined, undefined, 1, 1])).toEqual({ headline: 'BOT 2 WINS', winners: [1] });
  });
  it('NEGATIVE — free-for-all: exactly the pre-teams board, one winner', () => {
    expect(board(FFA)).toEqual({ headline: 'BOT 2 WINS', winners: [1] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S195 teams — a bot is never re-seated, so it keeps its personality by construction', () => {
  it('⛔ the diagonal 2v2 maps ZONES, not seats: every seat keeps its own bot', () => {
    // You (seat 0) and bot 2 (seat 2) on team 0. S192 permuted the bots (`permuteBots`); S195 leaves every
    // seat alone and stands seat 2 in the SW quadrant instead, so a bot's difficulty and personality cannot
    // be separated from it — there is no list to permute.
    expect(arrangeTeamZones([0, 1, 0, 1], 4)).toEqual([0, 1, 3, 2]);
  });
  it('NEGATIVE — no teams: the identity board', () => {
    expect(arrangeTeamZones([undefined, undefined, undefined, undefined], 4)).toEqual([0, 1, 2, 3]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S194 teams — the endgame PANTS (owner 255) is every seat\'s enemy with teams ON too', () => {
  it('⛔ sameTeam(255, seat) is false on a team board; a pants is its own side', async () => {
    const { MONSTER_OWNER_ID } = await import('./endgameMonsters.ts');
    const { sameTeam } = await import('./teams.ts');
    const w = fourSeat([0, 0, 1, 1]);
    expect(w.teams).toBeDefined();
    for (const s of P) expect(sameTeam(w, MONSTER_OWNER_ID, s), `seat ${s}`).toBe(false);
    expect(sameTeam(w, MONSTER_OWNER_ID, MONSTER_OWNER_ID)).toBe(true);
  });
});
