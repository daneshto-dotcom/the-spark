import { describe, it, expect } from 'vitest';
import { netSnapshot, applyNetSnapshot } from './save.ts';
import { makeWorld } from './world.ts';
import { makeCreature } from './creatures/creature.ts';
import { CREATURE_CONFIGS } from './creatures/voltkin-config.ts';
import { unitPoolFifths } from './stats.ts';
import { RACE_UNIT_HP, RACE_UNIT_DEF } from '../constants.ts';

describe('ADVERSARIAL VERIFY: raceUnit ehp wire shape', () => {
  it('undamaged raceUnit omits ehp on the wire; receiver rebuilds it from ITS OWN config', () => {
    const cfg = CREATURE_CONFIGS['raceUnit'];
    expect(cfg.hp).toBe(RACE_UNIT_HP);
    expect(cfg.def).toBe(RACE_UNIT_DEF);
    const full = unitPoolFifths(cfg.hp, cfg.def);
    console.log('FULL_POOL_FIFTHS=', full);

    const mk = (id: number, ehp?: number) => {
      const c = makeCreature(cfg, {
        id: id as never,
        ownerPlayerId: 0 as never,
        pos: { x: 10, y: 10 },
        targetPos: { x: 10, y: 10 },
        spawnedAtTick: 0,
        sourceSpawnerId: -1 as never,
      });
      if (ehp !== undefined) c.ehp = ehp;
      return c;
    };

    const host = makeWorld(1);
    host.creatures.set(0 as never, mk(0));
    host.creatures.set(1 as never, mk(1, 3));

    const snap = netSnapshot(host);
    const wireCreatures = (snap as unknown as { creatures: unknown[] }).creatures;
    console.log('UNDAMAGED_WIRE=', JSON.stringify(wireCreatures[0]));
    console.log('DAMAGED_WIRE=', JSON.stringify(wireCreatures[1]));
    expect('ehp' in (wireCreatures[0] as object)).toBe(false);
    expect('ehp' in (wireCreatures[1] as object)).toBe(true);

    const peer = makeWorld(1);
    applyNetSnapshot(JSON.parse(JSON.stringify(snap)), peer);
    console.log('PEER_REBUILT_EHP=', peer.creatures.get(0 as never)!.ehp, ' DAMAGED=', peer.creatures.get(1 as never)!.ehp);
    expect(peer.creatures.get(0 as never)!.ehp).toBe(full);
  });
});
