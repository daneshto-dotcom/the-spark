# S192 CANON NOTES — `s192/voltkin` (T16)

For the merge owner to fold into `SPARK_CANON.md` (suggested: a new bullet under §5b, beside "THE
VOLTKIN GOES FOR THE ENEMY FIRST", and a cross-reference from the R190-J Helga note in §7b). No
number below needs a `canon.test.ts` pin except `VOLTKINS_PER_TV`.

## ⭐ THE TV GIVES ITS VOLTKIN BACK EVERY WAVE (S192 T16, `s192/voltkin`)

Owner, S192: *"I had five TVs, full health, but no new Voltkins each new wave phase. I had to …
rebuild the Voltkin tower."*

- **The rule:** at FIGHT→BUILD, every standing TV (the 4-Square + 4-Triangle chain, the same set the
  renderer draws, welded or not) that has no Voltkin gets one at its centre, owned by the seat whose
  colour is on most of its members (lowest seat on a tie). R190-J's rule for Helga, applied to the TV.
  `resummonVoltkins` (`src/state/voltkinTv.ts`), called once from `hostTick`'s FIGHT→BUILD arm after
  `recallArmies`.
- **One per TV** — `VOLTKINS_PER_TV = 1`. ⚠ MINE.
- **The edge** — FIGHT→BUILD, so he is home and visible the whole BUILD and his 20 s starts with the
  next FIGHT. ⚠ MINE. A Voltkin killed during BUILD (a raid) does not come back until the next
  FIGHT→BUILD; Helga also revives at BUILD→FIGHT, the TV does not. Open question.
- **No double summon:** live Voltkins (not fading) and summons in flight (`pendingCreatureSpawn`,
  queued `pendingCinematics`) are bound to their own seat's TVs, nearest first, over a total order;
  only unbound TVs summon.
- **A fallen or broken TV summons nothing** — it is no longer a chain.
- **Ignition is unchanged**: closing a TV still needs the strict S48 P4 isolation, still fires the
  silent emerge and still mints a Voltkin every time a TV is built (S157 B4). A FIX on a damaged TV
  still re-fires ignition, so a repaired TV whose Voltkin lives gets a second one (pre-existing,
  reported, not changed).

## ⛔ TWO DEFECTS THAT ATE TVs, FIXED TOGETHER

- **Defect A** — `runGodlyMatcherCore` returned early while any Voltkin was emerging, so the
  `BOND_FORMED` of a TV closed in that window was wiped with the frame's effects and never matched.
  The matcher now always scans; a match during an emerge queues (the reducer always could).
- **Defect B** — direct mode's `onComplete` chained a queued trigger without resetting the transition
  watch, so a queued event from the SAME seat never played and `activeCinematicPlayerId` stayed set
  for the match (build cards read LOCKED). Reset now, as the worker path always did.
- **And the overwrite**: a chained emerge used to replace a `pendingCreatureSpawn` that had not fired
  yet (wall-clock timer vs tick poll on a slow frame). A pending summon is now minted at once instead
  (direct mode only — `GodlyOrchestrationCtx.simRunsHere`, false on the worker-mode mirror).

## ⚠ STILL TRUE, NOT CHANGED HERE

- Worker mode (`?worker=1`, opt-in) still runs the pre-S175 **4.8 s** emerge; direct runs **900 ms**
  (`VOLTKIN_EMERGE_MS`). Five TVs closed at once take 24 s to emerge in worker mode, 4.5 s in direct.
- At most ONE godly trigger per frame/batch (the cadence contract). Two TVs closed in the SAME frame
  or batch: the second is not matched at ignition, and gets its Voltkin at the next FIGHT→BUILD.
