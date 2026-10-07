/**
 * SPARK — S100 P1 (TD Phase 1a) spawner-zone renderer.
 *
 * When a built structure is a LIVE creature-spawner (its id sits in
 * `world.creatureSpawners`, which the host re-validates every poll so only
 * still-valid shapes remain), this draws a RADIATING pulsed aura over the
 * spawner's anchor component + a distinct "alive" pulse along that component's
 * bonds — so the shape reads as a special, more-complex spawn zone, while still
 * visibly being a built structure that can be raided and destroyed (the
 * primitives + bonds themselves are still drawn by structureRenderer underneath;
 * this layer only adds the "it's alive" overlay on top).
 *
 * One shared `Graphics`, cleared + redrawn each frame (mirrors BombRenderer /
 * HunterRenderer / SeagullRenderer — a per-spawner Graphics is overkill at the
 * Phase-1 cap, and one Graphics is the bundle-budget path). Cheap no-op when
 * `world.creatureSpawners` is empty.
 *
 * Determinism / clocks: the breathing/expanding rings are keyed off `world.tick`
 * (render-only, pauses with the sim exactly like bombRenderer's pulse) PLUS a
 * `performance.now()` shimmer so the aura animates fluidly even on the 10 Hz
 * client mirror. RENDER-ONLY — reads `world`, never mutates it. The tower's OWN
 * members are recomputed each frame via `towerFootprintAt` (S189 C2 — the same walk
 * the sim's re-validation uses; it was `componentOf` until welds became survivable).
 *
 * Owner colour tints the aura so each player's spawn zone reads as theirs.
 *
 * ⛔⛔ **S183 — EVERY LAYER IN HERE NOW FADES WITH `towerCover`, AND UNTIL THIS SESSION NONE OF
 * THEM DID.** This file contained no reference to `towerCover` at all, so while `structureRenderer`
 * faded a built tower's shapes and connectors to nothing, this redrew charged copies of the same
 * connectors on top, every frame. That is why the owner still saw *"the old triangles and
 * connectors between them and that little graphic that have it, like, radiate"* under a finished
 * building. See the block at the disc for his ruling and the one consequence he accepted.
 */

import { Application, Container, Graphics } from 'pixi.js';
// S189 C2 (audit W2-1) — the tower's OWN members (the sim's walk), not its connected component.
import { towerFootprintAt } from '../state/towerMembers.ts';
import { isConcealed } from './concealment.ts';
import {
  TOWER_COVER_DRAW_EPSILON, coverAlphaForBond, coverAlphaForPrim, forEachTowerCoverGroup, resetTowerCoverGroups, towerFootForPrim,
} from './towerCover.ts';
// ⭐ S196 (owner R196-T1) — every tower's own living signature; the hub's arcs are one of them.
import { TOWER_SIGNATURE, TOWER_SIG_BIRTH_PRIME_GAP_TICKS, TOWER_SIG_FLARE_TICKS, TOWER_SIG_NO_ACT, defenderSigAct, towerSignatureFx, type TowerSigSinks } from './fx/towerSignatureFx.ts';
import { getDefenderConfig } from '../state/defenders/defender.ts';
import { DEFENDER_FIRE_HOLD_TICKS } from '../constants.ts';
import { raceForTowerId } from '../state/raceTowerIds.ts';
import { raceForT9TowerId } from '../state/t9BossIds.ts';
import { BrokenTowerCache } from './brokenTowers.ts';
import { towerFixSparkleFx, type FixEdge } from './fx/towerSparkleFx.ts';
import { fxHighQuality } from './fx/fxRuntime.ts';
import type { Primitive } from '../game/primitive.ts';
import type { World } from '../state/world.ts';
import type { PlayerId, PrimitiveId } from '../types.ts';
import { fxActive, fxGround, fxShock, fxTop, fxTopShade } from './fx/fxState.ts';
// ⭐ S196 `s196/boss-release` (owner R196-T2) — the tier-9 tower's release + crumble, derived on every peer.
import { BOSS_RELEASE_DEV, BossReleaseTracker, sameTimeline } from './fx/bossReleaseTrack.ts';
import { BOSS_CRUMBLE_FX_TICKS, bossCrumbleFx, bossReleaseFx, type BossReleaseSinks } from './fx/bossReleaseFx.ts';
import {
  TOWER_SPARKLE_EPSILON, towerSparkleFx, towerSparkleStrength, type SparkleBond, type SparklePrim,
} from './fx/towerSparkleFx.ts';

/** How many concentric rings radiate outward from the zone centre. */
const RING_COUNT = 3;
/** Outer reach of the radiating rings as a multiple of the component radius. */
const RING_REACH = 1.55;
/** Breathing pulse cycles per second (driven by world.tick). */
const PULSE_HZ = 0.6;
/** Cosmetic shimmer cycles per second (driven by performance.now, client-fluid). */
const SHIMMER_HZ = 1.4;
/** Fallback aura tint if the owner colour can't be resolved. */
const FALLBACK_TINT = 0xffd27a;

export class SpawnerZoneRenderer {
  private readonly graphics: Graphics;
  /**
   * ⭐ S192 `s192/visuals` — the renderer's slot on `fogHiddenLayer` (index 5) is now a CONTAINER: the
   * legacy Graphics, then the fx GROUND layer (`fx/fxRuntime.ts` adds it here). One slot, not two, so
   * `tower-art.spec.ts`'s indices 6 and 11 do not move; `fog.spec.ts`'s roll call names the type change.
   * The ground layer sits here because this is exactly the depth ground light belongs at: over the
   * shapes and connectors, under every tower building and every unit.
   */
  readonly root: Container;

  // S100 P1 — defaults to app.stage but main.ts passes aboveFogLayer: a spawn
  // ⭐ S169 (owner) — SUPERSEDED. This now renders UNDER the fog on `fogHiddenLayer`: "It should all be hidden during build state ... You should only see, like, their castle." The cross-player-landmark argument below was overruled — scouting has to cost something.
  // Superseded reason: "zone is a cross-player landmark (everyone must see the high-value target to
  // raid it), so it renders THROUGH the fog like the other global-reach visuals."
  // ⚠ The aura had to move WITH the tower, or a hidden building would still glow.
  constructor(app: Application, parent: Container = app.stage) {
    this.root = new Container();
    this.root.label = 'spawnerZoneRoot';
    this.root.eventMode = 'none';
    this.graphics = new Graphics();
    this.root.addChild(this.graphics);
    parent.addChild(this.root);
  }

  /**
   * ⭐ S194 — the owner of each sparkle group, remembered while its shapes exist: a crumbled tower's
   * destroy sparkle still needs a colour and a fog test after its last shape has gone.
   */
  private readonly groupOwner = new Map<number, PlayerId>();

  /** Clear + redraw the aura for every live spawner. No-op when none. */
  sync(world: World): void {
    const g = this.graphics;
    g.clear();
    /*
     * ⭐⭐ S194 `s194/visuals-6` (owner) — **THE FX PATH DRAWS THE SPARKLE FOR EVERY TOWER, AND NOTHING
     * ELSE HERE.** The S192 aura (pool + embers) and the S100 charged connectors were this renderer's
     * fx-path draws, for SPAWNERS only — so the laser turret never sparkled (*"make it consistent across
     * all built … towers"*). Both now live in `fx/towerSparkleFx.ts`, keyed on `towerCover`'s groups,
     * which cover every tower kind that hides its connectors. The legacy path below is unchanged.
     */
    if (fxActive()) {
      this.syncSparkles(world);
      this.syncFixSparkles(world);
      this.syncTowerSignatures(world);
      this.syncBossReleases(world);
      return;
    }
    if (world.creatureSpawners.size === 0) return;

    // world.tick pulse (pauses with the sim) + wall-clock shimmer (client-fluid).
    const pulse = (Math.sin((world.tick / 60) * PULSE_HZ * Math.PI * 2) + 1) * 0.5; // 0..1
    const shimmer = (Math.sin((performance.now() / 1000) * SHIMMER_HZ * Math.PI * 2) + 1) * 0.5;

    for (const sp of world.creatureSpawners.values()) {
      const anchor = world.primitives.get(sp.anchorPrimitiveId);
      if (anchor === undefined) continue; // re-validation will remove it next poll
      /*
       * ⭐ S170 (owner) — FOG: *"I shouldn't see their buildings, their sparks, their SPAWN, their
       * connectors."* This aura IS the spawn he means, so it is culled with everything else.
       */
      if (isConcealed(anchor.pos.x, anchor.pos.y, anchor.placedBy)) continue;
      /*
       * ⭐ S189 C2 (audit W2-1) — THE TOWER'S OWN MEMBERS, NOT ITS COMPONENT. With welds allowed,
       * the component includes shapes that are not the tower; walking it drew the charged strokes
       * ONLY over the welds (the own bonds are covered) — i.e. exactly over the connectors whose cut
       * does NOT kill the zone — and twice for two welded towers. `towerFootprintAt` is the sim's
       * own walk (component only for a recipe with no survival shape).
       */
      const comp = towerFootprintAt(world, sp.recipeId, sp.anchorPrimitiveId);
      if (comp === null) continue;

      // Centroid + radius of the tower's own footprint.
      let cx = 0;
      let cy = 0;
      let n = 0;
      const prims: Primitive[] = [];
      for (const pid of comp.prims) {
        const p = world.primitives.get(pid);
        if (p === undefined) continue;
        prims.push(p);
        cx += p.pos.x;
        cy += p.pos.y;
        n++;
      }
      if (n === 0) continue;
      cx /= n;
      cy /= n;
      let radius = 0;
      for (const p of prims) {
        radius = Math.max(radius, Math.hypot(p.pos.x - cx, p.pos.y - cy));
      }
      radius = Math.max(radius + p0Pad(prims), 28); // pad past prim sprites, min floor

      const tint = anchorTint(world, anchor);
      /*
       * ⚠ S192 PILOT 2 — the rebuilt aura (`fx/auraFx.ts`) was called HERE, for spawners only. ⭐ S194 moved
       * it into the shared sparkle (`syncSparkles` above), so this loop is the LEGACY drawing alone.
       */

      /*
       * ⭐⭐⭐ S183 (owner) — **THE AURA FADES WITH THE BUILDING, ON EVERY TOWER, FRIENDLY AND
       * ENEMY ALIKE.**
       *
       * ⛔ **AND THIS IS THE MAIN REASON HE COULD STILL SEE THE SHAPES AFTER S175 SHIPPED THE
       * HIDING.** This renderer drew, every frame, with no reference to `towerCover` anywhere in
       * the file: a breathing disc under the structure, three radiating rings, **a bright stroke
       * over every bond**, a white spark bead at each bond midpoint, and a glowing core at the
       * anchor. Its own comment said so — *"traced over each spawner bond (on top of the normal
       * bond visual structureRenderer already drew)"*. `structureRenderer` faded the real
       * connectors to nothing and this drew charged copies of them straight back. Eight sessions,
       * every gate green, because a source-text guard can prove a line EXISTS and never that it is
       * REACHED — and this was a draw site that existed and had never consumed.
       *
       * > *"When you place it, you can see the tower art, but you also see, like, the old triangles
       * > and connectors between them and that little graphic that have it, like, radiate or
       * > whatever. That's what I'm having issue with."*
       *
       * ⭐ **THE ZONE'S OWN LAYERS RIDE THE ANCHOR'S ALPHA; THE BOND LAYERS RIDE THEIR OWN BOND'S.**
       * The disc, the rings and the core are one object centred on the structure, so one alpha is
       * the honest answer for them and the anchor is the shape that is always covered. The strokes
       * and beads are per-connector and each one has its own phase — a mid-ramp structure would
       * otherwise show a fully-lit bead over a half-faded connector.
       *
       * ⚠ **A CONSEQUENCE HE WAS TOLD ABOUT AND ACCEPTED: THE RAID AIMS BLIND.** `world.ts:769`
       * lets a player right-click a SPECIFIC bond and pay a raid point for it, which is the one
       * player-directed act his reasoning does not cover — *"You can't control your spawn … you
       * can't control your characters anyways."* Verified safe rather than assumed: the raid pick
       * in `controls.ts` never consults `coverAlphaForBond`, so an invisible connector is still
       * clickable and still raidable. The mechanic works; the player simply cannot see which arm
       * he is cutting on an enemy tower. Reverting is this one alpha.
       *
       * ⚠ AND AN UNCOVERED SPAWNER IS UNAFFECTED: `coverAlphaFor*` returns 1 for anything no
       * sprite is standing on, so a zone with no building art glows exactly as it did in S100.
       */
      const zoneAlpha = coverAlphaForPrim(anchor.id);
      if (zoneAlpha > TOWER_COVER_DRAW_EPSILON) {
        // ── breathing tint disc under the structure (the "alive" glow floor) ──
        g.circle(cx, cy, radius * (0.85 + pulse * 0.1)).fill({
          color: tint,
          alpha: (0.06 + pulse * 0.05) * zoneAlpha,
        });

        // ── radiating concentric rings expanding outward, staggered in phase ──
        for (let i = 0; i < RING_COUNT; i++) {
          // Each ring rides its own offset slice of the pulse so they appear to
          // emanate outward (inner→outer) rather than breathe in unison.
          const ringPhase = (pulse + i / RING_COUNT) % 1;
          const ringR = radius * (0.6 + ringPhase * (RING_REACH - 0.6));
          const ringAlpha = (1 - ringPhase) * 0.45;
          g.circle(cx, cy, ringR).stroke({ width: 2, color: tint, alpha: ringAlpha * zoneAlpha });
        }
      }

      // ── distinct 'alive' styling on the component's own bonds ──
      // A bright energized pulse traced over each spawner bond (on top of the
      // normal bond visual structureRenderer already drew), so the connectors
      // read as charged/living — and the player can see EXACTLY which bonds to
      // cut to kill the zone.
      const bondAlpha = 0.4 + shimmer * 0.45;
      for (const bid of comp.bonds) {
        const bond = world.bonds.get(bid);
        if (bond === undefined) continue;
        /*
         * ⛔ S183 — the per-connector half of the fade above. SKIPPED rather than drawn at alpha
         * zero, the same call `structureRenderer` makes for the same reason: these strokes go into
         * a shared Graphics and an invisible one still costs its geometry.
         */
        const bondCover = coverAlphaForBond(bid);
        if (bondCover <= TOWER_COVER_DRAW_EPSILON) continue;
        const a = bond.a as Primitive;
        const b = bond.b as Primitive;
        g.moveTo(a.pos.x, a.pos.y).lineTo(b.pos.x, b.pos.y)
          .stroke({ width: 1.5 + shimmer * 1.5, color: tint, alpha: bondAlpha * bondCover });
        // A travelling spark bead at the shimmering midpoint sells "energy flow".
        const mx = a.pos.x + (b.pos.x - a.pos.x) * (0.3 + shimmer * 0.4);
        const my = a.pos.y + (b.pos.y - a.pos.y) * (0.3 + shimmer * 0.4);
        g.circle(mx, my, 2 + pulse * 1.5)
          .fill({ color: 0xffffff, alpha: (0.5 + shimmer * 0.4) * bondCover });
      }

      // ── a steady core glow at the anchor itself (the spawn point) ──
      // ⛔ S183 — *"that little graphic that have it, like, radiate"*. The core is the brightest
      // thing in this file and sits dead centre under the building, so it fades with the rest.
      if (zoneAlpha > TOWER_COVER_DRAW_EPSILON) {
        g.circle(anchor.pos.x, anchor.pos.y, 5 + pulse * 3).fill({
          color: tint,
          alpha: (0.35 + pulse * 0.3) * zoneAlpha,
        });
        g.circle(anchor.pos.x, anchor.pos.y, 2.5).fill({ color: 0xffffff, alpha: 0.85 * zoneAlpha });
      }
    }
  }

  /**
   * ⭐ S194 — the build / destroy sparkle, for every tower a renderer drew (`towerCover` groups): the
   * race towers, the five ramp towers (spawners AND defenders), the Voltkin TV and the stink tower.
   */
  private syncSparkles(world: World): void {
    const ground = fxGround();
    const top = fxTop();
    const seen = new Set<number>();
    forEachTowerCoverGroup((grp) => {
      const key = grp.key as unknown as number;
      seen.add(key);
      // Owner + footprint from whatever shapes still exist.
      let sx = 0, sy = 0, n = 0, minX = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const pid of grp.prims) {
        const p = world.primitives.get(pid);
        if (p === undefined) continue;
        if (n === 0) this.groupOwner.set(key, p.placedBy);
        sx += p.pos.x; sy += p.pos.y; n++;
        if (p.pos.x < minX) minX = p.pos.x;
        if (p.pos.x > maxX) maxX = p.pos.x;
        if (p.pos.y + p.radius > maxY) maxY = p.pos.y + p.radius;
      }
      // ⛔ S194 audit L2 — a re-reveal (back out of fog) shows the finished tower, not a build.
      const s = grp.standing && grp.revealOnly ? 0 : towerSparkleStrength(grp.standing, grp.alpha, grp.downTicks);
      if (!(s > TOWER_SPARKLE_EPSILON)) return;
      const owner = this.groupOwner.get(key);
      if (owner === undefined) return;
      const foot = grp.foot ?? (n === 0 ? null : { x: sx / n, y: maxY, w: Math.max(56, maxX - minX + 40), h: Math.max(56, maxX - minX + 40) });
      if (foot === null) return;
      // ⛔ FOG — the sparkle is the tower's, so it is concealed with it (a tower lost into fog stops
      // publishing, which would otherwise read as a crumble and sparkle in the dark).
      if (isConcealed(foot.x, foot.y, owner)) return;
      const bonds: SparkleBond[] = [];
      for (const bid of grp.bonds) {
        const b = world.bonds.get(bid);
        if (b === undefined) continue;
        const a = b.a as Primitive;
        const c = b.b as Primitive;
        bonds.push({ ax: a.pos.x, ay: a.pos.y, bx: c.pos.x, by: c.pos.y, a: grp.standing ? coverAlphaForBond(bid) : s });
      }
      const prims: SparklePrim[] = [];
      for (const pid of grp.prims) {
        const p = world.primitives.get(pid);
        if (p === undefined) continue;
        prims.push({ x: p.pos.x, y: p.pos.y, r: p.radius, a: grp.standing ? coverAlphaForPrim(pid) : s });
      }
      const tint = world.players.get(owner)?.color ?? FALLBACK_TINT;
      towerSparkleFx(ground, top, key, foot.x, foot.y, foot.w, foot.h, tint, world.tick, s, bonds, prims);
    });
    for (const k of this.groupOwner.keys()) if (!seen.has(k)) this.groupOwner.delete(k);
  }

  private readonly broken = new BrokenTowerCache();

  /**
   * ⭐⭐ S194 (owner R194-22) — the soft FIX-ME sparkle on every fallen tower FIX can still stand up
   * (`brokenTowers.ts`: synced state, the FIX card's own predicates), on its connectors, its shapes and
   * its missing edges. ⭐ R194-23 (owner): shown to EVERY viewer — *"It doesn't matter because enemies
   * can't … control their own units … so it's fine"* — and fogged exactly like the tower.
   */
  private syncFixSparkles(world: World): void {
    const towers = this.broken.get(world);
    if (towers.length === 0) return;
    const top = fxTop();
    const low = !fxHighQuality();
    for (const t of towers) {
      let sx = 0, sy = 0, n = 0;
      const prims: Array<{ x: number; y: number; r: number }> = [];
      for (const id of t.prims) {
        const p = world.primitives.get(id);
        if (p === undefined) continue;
        prims.push({ x: p.pos.x, y: p.pos.y, r: p.radius });
        sx += p.pos.x; sy += p.pos.y; n++;
      }
      if (n === 0) continue;
      if (isConcealed(sx / n, sy / n, t.owner)) continue;
      const edges: FixEdge[] = [];
      for (const e of t.edges) {
        const a = world.primitives.get(e.a);
        const b = world.primitives.get(e.b);
        if (a === undefined || b === undefined) continue;
        const missing = e.bond === null || !world.bonds.has(e.bond);
        edges.push({ ax: a.pos.x, ay: a.pos.y, bx: b.pos.x, by: b.pos.y, missing });
      }
      const tint = world.players.get(t.owner)?.color ?? FALLBACK_TINT;
      towerFixSparkleFx(top, t.key as unknown as number, tint, world.tick, low, edges, prims);
    }
  }

  /*
   * ⭐ S196 (audit HIGH-1) — **THE BIRTH IS DERIVED CLIENT-SIDE: the first frame a creature is SEEN.**
   * `Creature.spawnedAtTick` does NOT cross the wire — the peer deserializer sets it to 0 (`save.ts`
   * `deserializeCreature`; `chewerRenderer`'s split burst says the same) — so the first cut, which read it,
   * never flared on a joiner. Each frame records the source-spawner creatures present; one that was absent
   * last frame was born now (the chewer split-burst idiom). ⚠ NOT PRIMED until one frame has been seen, and
   * re-primed after a gap (a join, a title return, a stretch in legacy/MINIMAL where this does not run, a new
   * match), so a mid-match joiner does not watch every tower on the board flare at once.
   */
  /** Source-spawner creatures present last tracked frame (swapped with `birthNow` each frame). */
  private birthSeen = new Set<number>();
  private birthNow = new Set<number>();
  /** Spawner id → the tick one of its creatures was first seen (pruned once past the flare). */
  private readonly lastBirth = new Map<number, number>();
  /** The tick of the last tracked frame; NaN = never (not primed). */
  private birthTrackTick = Number.NaN;
  /** ⛔ S196 audit HIGH-1 — a belt only: the shipped client keeps one World; a new match is the title `clear()` + not PLAYING. */
  private birthTrackWorld: World | null = null;

  /** One tracking pass: fills `lastBirth`. */
  private trackBirths(world: World): void {
    const tick = world.tick;
    const gap = tick - this.birthTrackTick;
    /*
     * ⛔ S196 audit HIGH-1 — primed by a recent previous frame of the SAME match. It used to require `gap >= 0`, but a
     * joiner's clock steps BACK a few ticks whenever a snapshot lands (`save.ts` sets `world.tick = snap.tick` after the
     * client ran ahead), so every snapshot re-primed it and a joiner missed every birth that arrived on a step-back
     * frame. Now: not PLAYING (and the title `clear()`), a forward gap or a backwards jump past `PEER_CLOCK_STEP_BACK_TICKS`
     * (60 — a one-second stall) re-primes; a smaller step back does not. A different World object also re-primes (a belt).
     */
    const primed = sameTimeline(world === this.birthTrackWorld, world.gameState === 'PLAYING', gap, TOWER_SIG_BIRTH_PRIME_GAP_TICKS);
    this.birthTrackWorld = world;
    if (!primed) this.lastBirth.clear();
    const now = this.birthNow;
    now.clear();
    for (const c of world.creatures.values()) {
      const sid = c.sourceSpawnerId;
      if (sid === null || sid === undefined) continue;
      const id = c.id as unknown as number;
      now.add(id);
      if (primed && !this.birthSeen.has(id)) this.lastBirth.set(sid as unknown as number, tick);
    }
    this.birthNow = this.birthSeen;
    this.birthSeen = now;
    this.birthTrackTick = tick;
    for (const [k, t] of this.lastBirth) if (tick - t >= TOWER_SIG_FLARE_TICKS) this.lastBirth.delete(k);
  }

  /**
   * ⭐⭐ S196 `s196/tower-fx` (owner R196-T1) — **EVERY TOWER'S SIGNATURE** (`fx/towerSignatureFx.ts`):
   * *"what you done for the lightning hub is gorgeous … I want that for all the towers."* The S194 hub arcs
   * (this method's predecessor, `syncHubArcs`) are now one row of `TOWER_SIGNATURE`.
   *
   * Drawn only while the building is actually drawn (its renderer published a foot — no art, fogged, atlas
   * loading ⇒ no foot ⇒ nothing) and fogged with it (the same `isConcealed` the hub used). The Voltkin TV
   * is the one tower that is neither a spawner nor a defender; `voltkinTowerRenderer` draws its signature.
   *
   * ⛔ THE FLARE IS NEVER A `world.effects` PUSH. A spawner's act is the first frame THIS client saw one of
   * its creatures (`sourceSpawnerId` is on the wire; `spawnedAtTick` is NOT — see `trackBirths`), so host and
   * peer each see the flare when the creature reaches their screen, a snapshot apart on a peer. A defender's
   * act is its FSM (`state`, `ticksInState`, `nextFireTick` — all on the wire).
   */
  private syncTowerSignatures(world: World): void {
    this.trackBirths(world); // every fx frame, towers or not, so a tower built later does not flare old units
    if (world.creatureSpawners.size === 0 && world.defenders.size === 0) return;
    const sinks: TowerSigSinks = { ground: fxGround(), top: fxTop(), shade: fxTopShade() };
    const low = !fxHighQuality();
    const births = this.lastBirth;
    for (const sp of world.creatureSpawners.values()) {
      const kind = TOWER_SIGNATURE[sp.recipeId];
      if (kind === undefined) continue;
      const anchor = world.primitives.get(sp.anchorPrimitiveId);
      if (anchor === undefined) continue;
      const foot = towerFootForPrim(anchor.id);
      if (foot === null) continue;
      if (isConcealed(foot.x, foot.y, anchor.placedBy)) continue;
      const born = births.get(sp.id as unknown as number);
      // ⛔ audit HIGH-1 — clamped: a joiner's clock may step back below the tick the birth was seen on
      const actAge = born === undefined ? TOWER_SIG_NO_ACT : Math.max(0, world.tick - born);
      const race = raceForTowerId(sp.recipeId) ?? raceForT9TowerId(sp.recipeId);
      towerSignatureFx(sinks, kind, anchor.id as unknown as number, foot.x, foot.y, foot.w, foot.h, world.tick, low, actAge, 0, race);
    }
    for (const d of world.defenders.values()) {
      const kind = TOWER_SIGNATURE[d.recipeId];
      if (kind === undefined) continue;
      const anchor = world.primitives.get(d.anchorPrimitiveId);
      if (anchor === undefined) continue;
      const foot = towerFootForPrim(anchor.id);
      if (foot === null) continue;
      if (isConcealed(foot.x, foot.y, anchor.placedBy)) continue;
      const cfg = getDefenderConfig(d.kind);
      const act = defenderSigAct(d.state, d.ticksInState, d.nextFireTick, world.tick, cfg.fireIntervalTicks, DEFENDER_FIRE_HOLD_TICKS);
      towerSignatureFx(sinks, kind, anchor.id as unknown as number, foot.x, foot.y, foot.w, foot.h, world.tick, low, act.actAge, act.charge, null);
    }
  }

  /** ⭐ S196 (R196-T2) — the tier-9 towers falling right now, and whether each let its boss out. */
  private readonly bossFalls = new BossReleaseTracker();

  /**
   * ⭐⭐ S196 `s196/boss-release` (owner R196-T2) — **THE BOSS TOWER'S RELEASE AND CRUMBLE** (`fx/bossReleaseFx.ts`):
   * *"when a boss tower releases his boss and it crumbles, there should be a flash that's appropriate to … the
   * player's race … make it look like sick with a nice release effect."*
   *
   * ⛔ DERIVED, NEVER PUSHED, AND NEVER FROM `spawnedAtTick` (not on the wire): `bossReleaseTrack.ts` notices a
   * tier-9 spawner VANISH from the synced `creatureSpawners` (→ the crumble) and a boss of its race + owner first
   * seen at its anchor in the same window (→ the release). Every peer sees both in the same snapshot.
   *
   * ⚠ OBSERVED EVERY FX FRAME, AND ABOVE `syncTowerSignatures`' EMPTY-MAP RETURN ON PURPOSE: the frame a seat's
   * only boss tower releases is exactly the frame `creatureSpawners` can become empty. Fogged with the tower: an
   * enemy tower that falls in fog shows nothing (`isConcealed` at its foot, as the signature is).
   */
  private syncBossReleases(world: World): void {
    this.bossFalls.observe(world, (anchor) => towerFootForPrim(anchor as unknown as PrimitiveId));
    const falls = this.bossFalls.current();
    if (falls.length === 0 || BOSS_RELEASE_DEV.off) return;
    const s: BossReleaseSinks = { ground: fxGround(), top: fxTop(), shade: fxTopShade(), shock: fxShock() };
    const low = !fxHighQuality();
    for (const f of falls) {
      if (isConcealed(f.foot.x, f.foot.y, f.owner as unknown as PlayerId)) continue;
      const raw = Math.max(0, world.tick - f.startTick); // ⛔ audit HIGH-1 — a joiner's clock step-back
      const age = BOSS_RELEASE_DEV.loop ? raw % BOSS_CRUMBLE_FX_TICKS : raw; // DEV seam only
      bossCrumbleFx(s, f.race, f.seed, f.foot.x, f.foot.y, f.foot.w, f.foot.h, age, low, f.released);
      if (f.released) bossReleaseFx(s, f.race, f.seed, f.foot.x, f.foot.y, f.foot.w, f.foot.h, age, low);
    }
  }

  /** Drop the aura graphic (title-return; closes the one-frame orphan window). */
  clear(): void {
    // ⭐ S194 audit M1 — the title return clears the shapes; forget every tower group and owner with them.
    this.groupOwner.clear();
    this.birthTrackTick = Number.NaN; // ⭐ S196 — re-prime: the next match's first frame flares nothing
    this.birthTrackWorld = null;
    this.lastBirth.clear();
    this.bossFalls.reset(); // ⭐ S196 (R196-T2) — re-prime: no release replays behind the title or into the next match
    resetTowerCoverGroups();
    this.graphics.clear();
  }

  destroy(): void {
    // The root also holds the fx GROUND layer, which `fxRuntime` owns, so only our own Graphics goes.
    this.graphics.destroy();
  }
}

/** Small extra padding past the primitive sprites so the aura clears the shape. */
function p0Pad(prims: readonly Primitive[]): number {
  let r = 0;
  for (const p of prims) r = Math.max(r, p.radius);
  return r * 1.6 + 10;
}

/**
 * Aura tint = the spawner owner's live colour (read off the anchor primitive's
 * ownerColor, which tracks rainbow-shuffles). Falls back to a warm amber if the
 * colour is somehow unresolved. Exported for unit testability.
 */
export function anchorTint(world: World, anchor: Primitive): number {
  const owner = world.players.get(anchor.placedBy);
  if (owner !== undefined) return owner.color;
  if (anchor.ownerColor !== 0) return anchor.ownerColor;
  return FALLBACK_TINT;
}
