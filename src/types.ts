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

export const asSparkId = (n: number): SparkId => n as SparkId;
export const asPrimitiveId = (n: number): PrimitiveId => n as PrimitiveId;
export const asBondId = (n: number): BondId => n as BondId;
export const asPlayerId = (n: number): PlayerId => n as PlayerId;
export const asCreatureId = (n: number): CreatureId => n as CreatureId;

export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const v2copy = (v: Vec2): Vec2 => ({ x: v.x, y: v.y });
