/**
 * SPARK — S188 P3 fix 1: **A KEEP ABOVE 2500 CROSSES THE WIRE.**
 *
 * `serializePlayer` emitted `castleHp` only when it was below the flat `CASTLE_MAX_HP`, and the
 * rehydrate read an absent value as `CASTLE_MAX_HP`. That was the whole range `castleHp` could take
 * until S187 let a keep buy HP. A keep at 2750 / 2750 — or regenerating through 2600 / 2750 — was then
 * "not below max", emitted NOTHING, and every peer read it back as 2500: a silent divergence on the
 * number that ends the match. The S187 `maxEhp` bug class exactly.
 *
 * Driven through BOTH paths that carry players: the disk/migration `snapshot` → `restore`, and the
 * 10 Hz `netSnapshot` → `applyNetSnapshot` a joiner lives on, each through a real JSON round trip
 * using the wire's own replacer.
 */

import { describe, expect, it } from 'vitest';
import { CASTLE_MAX_HP } from '../constants.ts';
import { asPlayerId, type PlayerId } from '../types.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { applyNetSnapshot, netSnapshot, restore, snapshot, wireNumberReplacer } from './save.ts';
import { castleMaxHpFor } from './castleUpgrades.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

/** A 1v1 host world where seat 0 bought one HP point (max 2750) and seat 1 bought nothing. */
function host(p0Hp: number, p1Hp: number = CASTLE_MAX_HP): World {
  const w = makeWorld(0x188a);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  const a = w.players.get(P0)!;
  a.castleUpgrades = { hpLevel: 1, hpBonus: 250, atkLevel: 0, defLevel: 0, penLevel: 0 };
  a.castleHp = p0Hp;
  w.players.get(P1)!.castleHp = p1Hp;
  return w;
}

/** A fresh mirror to apply onto — its own seats start at the flat 2500, which is the trap. */
function mirror(): World {
  const w = makeWorld(0x188b);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.isHost = false;
  return w;
}

const viaDisk = (src: World): World => {
  const dst = mirror();
  restore(JSON.parse(JSON.stringify(snapshot(src))), dst);
  return dst;
};
const viaNet = (src: World): World => {
  const dst = mirror();
  applyNetSnapshot(JSON.parse(JSON.stringify(netSnapshot(src), wireNumberReplacer)), dst);
  return dst;
};
const hpOf = (w: World, seat: PlayerId): number => w.players.get(seat)!.castleHp;

describe('S188 P3 — a keep with bought HP round-trips at its REAL number', () => {
  for (const [name, path] of [['snapshot → restore', viaDisk], ['netSnapshot → applyNetSnapshot', viaNet]] as const) {
    it(`⛔ ${name}: a FULL upgraded keep (2750 / 2750) arrives as 2750, not 2500`, () => {
      const out = path(host(CASTLE_MAX_HP + 250));
      expect(hpOf(out, P0)).toBe(CASTLE_MAX_HP + 250);
      expect(castleMaxHpFor(out.players.get(P0)!.castleUpgrades)).toBe(CASTLE_MAX_HP + 250);
    });

    it(`⛔ ${name}: a keep ABOVE 2500 but below its max (2600 / 2750) arrives as 2600`, () => {
      expect(hpOf(path(host(2600)), P0)).toBe(2600);
    });

    it(`${name}: a damaged upgraded keep (2400 / 2750) still arrives exactly`, () => {
      expect(hpOf(path(host(2400)), P0)).toBe(2400);
    });

    it(`${name}: the un-upgraded seat beside it is unchanged — full and damaged`, () => {
      expect(hpOf(path(host(2600)), P1)).toBe(CASTLE_MAX_HP);
      expect(hpOf(path(host(2600, 1800)), P1)).toBe(1800);
    });
  }

  it('⭐ an un-upgraded full keep still emits NO castleHp — byte-identical to every prior snapshot', () => {
    const snap = snapshot(host(2600));
    const p1 = snap.players.find((p) => p.id === P1)!;
    expect('castleHp' in p1).toBe(false);
  });

  it('⭐ and a FULL upgraded keep emits none either — absent means "at this seat’s own ceiling"', () => {
    const snap = snapshot(host(CASTLE_MAX_HP + 250));
    const p0 = snap.players.find((p) => p.id === P0)!;
    expect('castleHp' in p0).toBe(false);
    expect(p0.castleUpgrades?.hpBonus).toBe(250);
  });
});
