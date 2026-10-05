/**
 * S195 T19 (#9) — OWNER B-1 RULED: KEEP THE OWN-POOL BAR. Pinned so no session re-asks whether the welded
 * tower's bar/card/art should show the WHOLE weld pool. They should not; T15's held own reading stands.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { heldOwnPoolAt } from './structureBarHealth.ts';

describe('B-1 — keep own-pool (owner, S195)', () => {
  it('the ruling is written at the module that holds the reading, verbatim', () => {
    const src = readFileSync(join(__dirname, 'towerHealthHold.ts'), 'utf8');
    expect(src).toContain('OWNER B-1 RULED: KEEP THE OWN-POOL BAR');
    expect(src).toContain('the current welded structure health bar is fine');
  });
  it('and the one reading every surface shares is still exported from structureBarHealth', () => {
    expect(typeof heldOwnPoolAt).toBe('function');
  });
});
