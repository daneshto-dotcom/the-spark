/**
 * ⭐ S194 (T11 re-audit) — a generation bumped whenever a snapshot replaces the world's entities
 * (`save.applySnapshotCore`: restore + applyNetSnapshot). Per-world memos (`endgameMonsters.ownedBy`) key on it,
 * so a resync can never leave a memo holding the replaced objects. Not state: never hashed, never sent.
 */
export const simMemo = { generation: 0 };
