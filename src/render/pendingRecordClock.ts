/**
 * SPARK — S191 C-2 (WRATH-F5) — **THE CLOCK OF A CLIENT-SIDE "SENT, NOT YET SYNCED" RECORD.**
 *
 * A client that sends an intent the host does not echo at once (WRATH OF RA's cast, `raAimPreview.ts`;
 * any later aimed ability) keeps a small VIEW-STATE record of it, trusted for a window of SYNCED ticks,
 * so its preview and its counters do not fall back to the stale synced value while the intent is in
 * flight. This is that window's rule, in one place, so every such record ages the same way.
 *
 * ⛔ **THE SYNCED CLOCK IS NOT MONOTONIC ON A JOINER.** It runs `world.tick++` every fixed step between
 * snapshots (`main.ts`, the client branch) and each snapshot then sets `world.tick = snap.tick`
 * (`applySnapshotCore`), so a clock that ran ahead steps BACK on apply — typically right after the send,
 * the one moment the record is for. Reading that as `age < 0 → dead` made the record inert exactly then.
 *
 * The rule:
 *  · the clock stepped BACK past the send tick → the record is RE-ANCHORED at the adopted tick (its
 *    window restarts there; every other check on the record still re-validates it);
 *  · older than `timeoutTicks` → EXPIRED. ⛔ The caller must DROP an expired record, never keep it: kept,
 *    a later step back re-anchors it and a refused intent comes back to life.
 *
 * Pure, Pixi-free (`controls.ts` reaches it through `raAimPreview.ts`), no wall clock, not on the wire.
 *
 * @returns the record's send tick to keep (`atTick`, or `nowTick` when re-anchored), or `null` = expired.
 */
export function pendingRecordAnchor(nowTick: number, atTick: number, timeoutTicks: number): number | null {
  if (nowTick < atTick) return nowTick;
  return nowTick - atTick > timeoutTicks ? null : atTick;
}
