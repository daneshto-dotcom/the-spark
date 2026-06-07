import { describe, expect, it } from 'vitest';
import {
  ALL_SPARK_TYPES,
  PHYSICS_HZ,
  SPAWN_RATE_PER_SECOND,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from '../constants.ts';
import { mulberry32 } from '../state/rng.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner, enforceSpawnerBounds, type BombSpawnRequest, type PotatoSpawnRequest, type RainbowSpawnRequest } from './spawner.ts';
import type { Spark } from './spark.ts';

const DT = 1 / PHYSICS_HZ;

describe('Spawner', () => {
  it('spawns at the configured Poisson rate (within 15%)', () => {
    // Window scales with the rate so √N/N variance stays under 15%. We need
    // expected · 0.15 ≥ 2·SD = 2·√expected → expected ≥ ~178. At the current
    // playability rate (S5 dropped to 0.15/sec), 1500s gives ~225 expected
    // and 95% CI fits inside ±15%.
    const TARGET_EXPECTED = 200;
    const SECONDS = Math.ceil(TARGET_EXPECTED / SPAWN_RATE_PER_SECOND);
    const sparks: Spark[] = [];
    const spawner = new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1));
    for (let i = 0; i < SECONDS * PHYSICS_HZ; i++) {
      spawner.tick(DT, i, sparks);
    }
    const expected = SPAWN_RATE_PER_SECOND * SECONDS;
    expect(sparks.length).toBeGreaterThan(expected * 0.85);
    expect(sparks.length).toBeLessThan(expected * 1.15);
  });

  it('spawns all 6 SparkTypes within 5 minutes of simulated time', () => {
    const sparks: Spark[] = [];
    const spawner = new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7));
    for (let i = 0; i < 5 * 60 * PHYSICS_HZ; i++) {
      spawner.tick(DT, i, sparks);
    }
    const seen = new Set(sparks.map((s) => s.type));
    for (const t of ALL_SPARK_TYPES) expect(seen.has(t)).toBe(true);
  });

  it('all initial spawn positions land inside the spawner disk', () => {
    // Window sized to expect ≥ 50 spawns at the configured rate so the
    // sample stresses the disk-uniform sampler. S5 dropped the rate to
    // 0.15/sec so we run ~6 minutes of simulated time.
    const TARGET_SPAWNS = 50;
    const SECONDS = Math.ceil(TARGET_SPAWNS / SPAWN_RATE_PER_SECOND) + 60;
    const sparks: Spark[] = [];
    const spawner = new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(2));
    for (let i = 0; i < SECONDS * PHYSICS_HZ; i++) {
      spawner.tick(DT, i, sparks);
    }
    expect(sparks.length).toBeGreaterThan(TARGET_SPAWNS);
    for (const s of sparks) {
      const dx = s.pos.x - SPAWNER_CENTER_X;
      const dy = s.pos.y - SPAWNER_CENTER_Y;
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(SPAWNER_RADIUS);
    }
  });

  it('determinism: same seed → identical spawn sequence', () => {
    const a: Spark[] = [];
    const b: Spark[] = [];
    const sa = new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(99));
    const sb = new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(99));
    for (let i = 0; i < 600; i++) {
      sa.tick(DT, i, a);
      sb.tick(DT, i, b);
    }
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].type).toBe(b[i].type);
      expect(a[i].pos.x).toBeCloseTo(b[i].pos.x, 10);
      expect(a[i].pos.y).toBeCloseTo(b[i].pos.y, 10);
    }
  });
});

describe('enforceSpawnerBounds', () => {
  it('pushes a spark past the boundary back to the rim and reflects it inward', () => {
    const sparks: Spark[] = [];
    const spawner = new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3));
    // Poisson interarrivals can exceed one tick; run until at least one spawn.
    let frame = 0;
    while (sparks.length === 0 && frame < 1000) {
      spawner.tick(DT, frame++, sparks);
    }
    expect(sparks.length).toBeGreaterThan(0);
    const s = sparks[0];

    // Hand-position outside the rim, moving outward.
    s.prevPos = { x: SPAWNER_CENTER_X + SPAWNER_RADIUS, y: SPAWNER_CENTER_Y };
    s.pos = { x: SPAWNER_CENTER_X + SPAWNER_RADIUS + 10, y: SPAWNER_CENTER_Y };

    enforceSpawnerBounds(sparks);

    const dist = Math.hypot(s.pos.x - SPAWNER_CENTER_X, s.pos.y - SPAWNER_CENTER_Y);
    expect(dist).toBeLessThanOrEqual(SPAWNER_RADIUS);
    // Velocity flipped sign (was +x, now -x)
    expect(s.pos.x - s.prevPos.x).toBeLessThan(0);
  });

  it('60s of integration with bounce keeps every spark inside the disk', () => {
    const sparks: Spark[] = [];
    const spawner = new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(11));
    // Pre-populate to amplify boundary contact.
    for (let i = 0; i < 30; i++) spawner.tick(DT, i, sparks);

    const SUBSTEPS = 8;
    const subDt = DT / SUBSTEPS;
    for (let frame = 0; frame < 60 * PHYSICS_HZ; frame++) {
      spawner.tick(DT, frame, sparks);
      for (let sub = 0; sub < SUBSTEPS; sub++) {
        for (const s of sparks) {
          const vx = s.pos.x - s.prevPos.x;
          const vy = s.pos.y - s.prevPos.y;
          s.prevPos.x = s.pos.x;
          s.prevPos.y = s.pos.y;
          s.pos.x += vx * 0.998;
          s.pos.y += vy * 0.998;
        }
        enforceSpawnerBounds(sparks);
      }
    }
    void subDt;

    for (const s of sparks) {
      const dist = Math.hypot(s.pos.x - SPAWNER_CENTER_X, s.pos.y - SPAWNER_CENTER_Y);
      expect(dist).toBeLessThanOrEqual(SPAWNER_RADIUS + 0.01);
      expect(Number.isFinite(dist)).toBe(true);
    }
  });
});

describe('Spawner — S71 P1 bomb cadence', () => {
  // High rate so a few hundred ticks spawn enough sparks (≥8) to trigger bombs.
  const FAST = { ...DEFAULT_SPAWNER_CONFIG, ratePerSecond: 5 };
  const TICKS = 800;

  it('adding a bombRng leaves the spark stream byte-identical (separate stream)', () => {
    const sparksA: Spark[] = [];
    const a = new Spawner(FAST, mulberry32(123));
    for (let i = 0; i < TICKS; i++) a.tick(DT, i, sparksA);

    const sparksB: Spark[] = [];
    const bombs: BombSpawnRequest[] = [];
    const b = new Spawner(FAST, mulberry32(123), mulberry32(999));
    for (let i = 0; i < TICKS; i++) b.tick(DT, i, sparksB, bombs);

    // Bombs DID fire, yet the spark sequence is identical → the separate bombRng
    // never perturbs the spark rng stream (the whole point of the two-stream design).
    expect(bombs.length).toBeGreaterThan(1);
    expect(sparksB.length).toBe(sparksA.length);
    for (let i = 0; i < sparksA.length; i++) {
      expect(sparksB[i].type).toBe(sparksA[i].type);
      expect(sparksB[i].pos).toEqual(sparksA[i].pos);
    }
  });

  it('bomb spawns are deterministic for the same (rng, bombRng) seeds', () => {
    const run = (): BombSpawnRequest[] => {
      const sparks: Spark[] = [];
      const bombs: BombSpawnRequest[] = [];
      const s = new Spawner(FAST, mulberry32(5), mulberry32(7));
      for (let i = 0; i < TICKS; i++) s.tick(DT, i, sparks, bombs);
      return bombs;
    };
    expect(run()).toEqual(run());
  });

  it('emits NO bombs when constructed without a bombRng (disabled by default)', () => {
    const sparks: Spark[] = [];
    const bombs: BombSpawnRequest[] = [];
    const s = new Spawner(FAST, mulberry32(1)); // no bombRng
    for (let i = 0; i < TICKS; i++) s.tick(DT, i, sparks, bombs);
    expect(bombs).toHaveLength(0);
    expect(sparks.length).toBeGreaterThan(8); // plenty of sparks, just no bombs
  });
});

describe('Spawner — S75 P3 rainbow cadence', () => {
  // High rate + many ticks so the rare rainbow cadence (35-60 sparks) fires several times.
  const FAST = { ...DEFAULT_SPAWNER_CONFIG, ratePerSecond: 5 };
  const TICKS = 3000;

  it('adding a rainbowRng leaves the spark + bomb + potato streams byte-identical (4th separate stream)', () => {
    // Baseline: spark + bomb + potato streams, NO rainbow.
    const sparksA: Spark[] = [];
    const bombsA: BombSpawnRequest[] = [];
    const potatoesA: PotatoSpawnRequest[] = [];
    const a = new Spawner(FAST, mulberry32(123), mulberry32(999), mulberry32(555));
    for (let i = 0; i < TICKS; i++) a.tick(DT, i, sparksA, bombsA, potatoesA);

    // Same seeds, PLUS a rainbowRng.
    const sparksB: Spark[] = [];
    const bombsB: BombSpawnRequest[] = [];
    const potatoesB: PotatoSpawnRequest[] = [];
    const rainbowsB: RainbowSpawnRequest[] = [];
    const b = new Spawner(FAST, mulberry32(123), mulberry32(999), mulberry32(555), mulberry32(777));
    for (let i = 0; i < TICKS; i++) b.tick(DT, i, sparksB, bombsB, potatoesB, rainbowsB);

    expect(rainbowsB.length).toBeGreaterThan(0); // rainbows DID fire...
    // ...yet the spark + bomb + potato sequences are identical → the 4th rainbowRng stream
    // never perturbs the prior three (the whole point of the separate-stream design).
    expect(sparksB.length).toBe(sparksA.length);
    for (let i = 0; i < sparksA.length; i++) {
      expect(sparksB[i].type).toBe(sparksA[i].type);
      expect(sparksB[i].pos).toEqual(sparksA[i].pos);
    }
    expect(bombsB).toEqual(bombsA);
    expect(potatoesB).toEqual(potatoesA);
  });

  it('rainbow spawns are deterministic for the same seeds', () => {
    const run = (): RainbowSpawnRequest[] => {
      const sparks: Spark[] = [];
      const rainbows: RainbowSpawnRequest[] = [];
      const s = new Spawner(FAST, mulberry32(5), null, null, mulberry32(7));
      for (let i = 0; i < TICKS; i++) s.tick(DT, i, sparks, undefined, undefined, rainbows);
      return rainbows;
    };
    expect(run()).toEqual(run());
  });

  it('emits NO rainbows when constructed without a rainbowRng (disabled by default)', () => {
    const sparks: Spark[] = [];
    const rainbows: RainbowSpawnRequest[] = [];
    const s = new Spawner(FAST, mulberry32(1)); // no rainbowRng
    for (let i = 0; i < TICKS; i++) s.tick(DT, i, sparks, undefined, undefined, rainbows);
    expect(rainbows).toHaveLength(0);
  });
});
