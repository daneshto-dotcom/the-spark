/**
 * SPARK — shared cross-module types.
 * Branded IDs prevent accidental mixing at compile time.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export type SparkId = number & { readonly __brand: 'SparkId' };
export type PrimitiveId = number & { readonly __brand: 'PrimitiveId' };
export type BondId = number & { readonly __brand: 'BondId' };
export type PlayerId = number & { readonly __brand: 'PlayerId' };
export type CreatureId = number & { readonly __brand: 'CreatureId' };
// S71 P1 — bomb hazard entity id.
export type BombId = number & { readonly __brand: 'BombId' };
// S72 P2 — Pac-Man hunter entity id.
export type HunterId = number & { readonly __brand: 'HunterId' };
// S72 P3 — potato bomb entity id.
export type PotatoId = number & { readonly __brand: 'PotatoId' };

export const asSparkId = (n: number): SparkId => n as SparkId;
export const asPrimitiveId = (n: number): PrimitiveId => n as PrimitiveId;
export const asBondId = (n: number): BondId => n as BondId;
export const asPlayerId = (n: number): PlayerId => n as PlayerId;
export const asCreatureId = (n: number): CreatureId => n as CreatureId;
export const asBombId = (n: number): BombId => n as BombId;
export const asHunterId = (n: number): HunterId => n as HunterId;
export const asPotatoId = (n: number): PotatoId => n as PotatoId;

export const v2copy = (v: Vec2): Vec2 => ({ x: v.x, y: v.y });
