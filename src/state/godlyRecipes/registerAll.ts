/**
 * SPARK — THE ONE PLACE EVERY RECIPE IS REGISTERED (S165).
 *
 * ⛔ THE BUG THIS EXISTS TO END. A recipe is registered by a SIDE-EFFECT IMPORT: each module calls
 * `registerRecipe` at its tail, so a recipe that is never imported simply does not exist. `main.ts`
 * carried all seven of those imports; `src/simWorker.ts` carried NONE.
 *
 * That is invisible until you run the game the one way that makes the worker authoritative. Under
 * `?worker=1` (a shipped opt-in — `WORKER_DEFAULT_ON` is false, but the query param is honoured)
 * `main.ts` deliberately SKIPS the main-thread matcher, so the worker is the only thing running
 * `runGodlyMatcherCore`. With an empty registry `findDefenderMatches` returns `[]` on every tick, so
 * the laser turret, Princess Helga, the stink tower, the goblin tower, the pentagram, the lightning
 * hub and the Voltkin cinematic were ALL unbuildable in that mode — the geometry completes, the
 * player waits, and nothing happens. No error, no log.
 *
 * ⭐ AND IT FAILS SILENTLY IN A SECOND DIRECTION, which is what makes it worth a module of its own.
 * `recipeStillSatisfied` degrades to the weaker "the anchor still exists" rule when it cannot find a
 * recipe — so a structure whose star had been broken would linger forever instead of tearing down.
 * The stink-tower and goblin-tower import comments in `main.ts` both call this out by name; the risk
 * was understood, and the second entrypoint still went without.
 *
 * ⚠ SO DO NOT ADD A RECIPE IMPORT TO AN ENTRYPOINT AGAIN. Add it HERE, and both entrypoints get it.
 * `registerAll.test.ts` asserts the full set is present after importing only this module, so a
 * recipe added to one entrypoint and not the other turns a test red instead of shipping half-alive.
 */
import './voltkin.ts';
import './pentagram.ts';
import './lightningHub.ts';
import './laserTurret.ts';
import './princessHelga.ts';
import './stinkTower.ts';
import './goblinTower.ts';
