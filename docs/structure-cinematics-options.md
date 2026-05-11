# Structure Cinematics — Design Options

**Status:** S9 P4 brainstorm. Design-only — no code commits to renderers from this doc.
**Trigger:** Post-S8 user playtest: *"there should be some cool structural in-game cinematics that show the shape grow / become more complicated the more you add to it. we need to brainstorm exactly how it shows."*
**Decision target:** S10 implementation pick (one or two options to land before "ship Phase 2" sign-off).

---

## Current state (post-S9)

Every placement already emits a **one-shot ephemeral effect** at the bond
endpoint via `world.effects.push({ kind: 'BOND_COMMIT', ... })` and the
effects renderer draws a brief silhouette per `visualEffectId` (filament
starburst, cable parallels, etc.). After S8 the 6 LOW/HIGH-tier magic
silhouettes also animate continuously while the bond exists (whip drift,
wheel rotation, vortex pulse, etc.).

What's **missing** — and what this doc is brainstorming — is feedback at
the **structure level**, not the bond level. The current effects don't:

- Convey that the structure as a whole just *grew*.
- React when two structures *merge* (a new S9 P2 event with no special
  visual — looks like any other place).
- Escalate as the structure crosses **complexity thresholds**
  (10 → 20 → 30 score; magic-heavy vs functional-heavy).

---

## Design constraints

- **§ XV anti-bloat charter.** Each option costs LOC against the 500-cap
  per module budget. `bondVisualRenderer.ts` is ~400 — modest headroom.
- **`world.effects` queue is the established seam.** Renderers drain it
  each frame. A new `STRUCTURE_GROW` / `STRUCTURE_MERGE` /
  `TIER_CROSSED` event fits the pattern.
- **No audio dependency.** Suno track still pending — visuals only.
- **No screen-shake by default** in single-player (tunable later). MID-tier
  shake feels good in playtests; LOW threshold = nausea risk.
- **Cheap.** Pixi v8 ParticleContainer / Graphics — same renderer
  surface, no shaders.

---

## Options

### A — Bloom flash + radial ripple at place-site

```
              .  .  .  .
            .             .
          .   ●●●●●●●●●     .          ← new primitive at center
          .   ●●●●●●●●●     .             bloom radius scales with combo tier
            .             .
              .  .  .  .

   bloom: radial fill, color = player, alpha 1.0 → 0 over ~250ms
   ring:  outline-only circle expanding 0 → 80px over ~400ms, alpha 1.0 → 0
```

**Fires when:** every PLACE_PRIMITIVE (primary or merge bond).
**Intensity scaling:** ripple radius × `(SCORE_MAGIC_BOND / SCORE_FUNCTIONAL_BOND)` — Magic = 3× wider ring.
**Cost:** S — single Graphics circle per effect, age out via existing effects-list lifecycle. ~30 LOC in renderer.
**Pros:** Simple, fits existing one-shot effect pattern. Reads at all scales.
**Cons:** Doesn't escalate at structure level — every bond looks the same as the last in isolation. Magic-vs-Functional differentiation is subtle (3× radius is noticeable but easily blends in).
**Verdict:** Good baseline. Stack with B or D.

---

### B — Structure-wide pulse along bonds from new primitive

```
       ○─────○─────○                   t = 0       (new prim at left)
      / pulse here                      
     ●─────○─────○

       ○─────○─────○                   t = 100ms
       ╲                                 pulse traveled along
        ●─────●─────○                    one bond hop


       ○─────○─────○                   t = 300ms
        ╲     ╲                          fan-out: each connected primitive
         ●─────●─────●                    flashes briefly as the pulse reaches
                                          it; bonds light up as conduits
```

**Fires when:** every PLACE_PRIMITIVE. Visual = BFS-timed ripple where
each primitive in the new prim's component flashes when the front
reaches it (~50ms per bond hop), and the bonds themselves brighten
during the pass.

**Intensity scaling:** Travel speed/brightness × Magic-bond weight.
Wider connected components = visibly longer cascade — *the structure
reads as one organism reacting to a new addition*.

**Cost:** M — needs a `STRUCTURE_GROW` effect carrying the new prim's
component (BFS at emit time) and a per-frame interpolation on the
renderer. ~80–120 LOC. Existing bond renderer already iterates the
bonds list per frame; can fold the pulse-alpha lerp in cheaply.

**Pros:** **Best at conveying "the whole structure reacted."** Solves
the user's core ask. Reads at game speed — pulse is fast enough not
to clutter, slow enough to register. Scales gracefully with structure
size (longer pulse for bigger thing = inherent reward feedback).

**Cons:** Most complex to land. Risk of nausea if many places happen
in rapid succession (overlapping pulses) — needs a "swallow pending
pulse if structure mid-pulse" rule.

**Verdict:** **Recommended primary pick for S10.**

---

### C — Merge-wave (cross-structure bond commit cinematic)

```
   STRUCTURE α          STRUCTURE β
    ●─●─●                 ●─●
       \                 /                 t = 0  (new prim placed)
        ●               ●
         \             /
          ● ← NEW → ●


       drift inward:
                          ●               t = 200ms
   ●─●─●        ●─●         centers of mass briefly accelerate
       ●        ●              toward the new bond
        ●  →  ●
          NEW


   SHARED PULSE                            t = 400ms
   ●─●─●─●─●─●─●                            single component now;
            ●                                 entire shape brief color flash
            ●                                 (player color, 80% intensity)
                                              then settle.
```

**Fires when:** PLACE_PRIMITIVE emits a *merge* bond (i.e. a P2
sweep added a bond into a previously-disjoint component). Each merge
bond = one merge-wave.

**Visual:** brief impulse on each side's center-of-mass toward the new
bond (physics nudge, like a satisfying click), then a single
structure-wide flash on the now-merged component (option B's pulse
mechanism reused on the union).

**Intensity scaling:** number of newly-merged primitives is the
"weight" — merging two 1-prim singletons is subtle; merging two
20-prim wings is dramatic.

**Cost:** M — needs a `STRUCTURE_MERGE` effect with the union-of-
component-ids. ~60 LOC if B is in (reuses pulse). ~120 if standalone.

**Pros:** Directly addresses the user's "you connect complex
structures you get one super complex structure" intent. Makes P2 a
visual *event* rather than a silent semantic.

**Cons:** Only fires on cross-structure place — many builds won't
trigger it. Needs B (or its primitives) underneath.

**Verdict:** **Recommended secondary pick.** Pair with B. Cinematic
"reward" for the rare moment of structural unification.

---

### D — Tier-gated screen-FX every N points

```
   scoreProgress = 10    →   tiny corner pulse + bloom at progress bar
   scoreProgress = 20    →   peripheral bloom around canvas border
   scoreProgress = 30    →   subtle vignette flash + audio chime (if/when audio)
   scoreProgress = 40    →   structure-wide pulse + slow camera-zoom-out
   scoreProgress = 50    →   WIN cinematic (already exists, escalate)
```

**Fires when:** scoreProgress crosses every 10 (configurable).

**Visual:** Stepped feedback escalating with proximity to WIN. Each
tier above the last in intensity and screen-area.

**Cost:** S–M depending on how rich. ~50 LOC for the simple version
(corner pulses + bloom); ~120 LOC if vignette and zoom are included.

**Pros:** Communicates progress *toward the goal*, not just toward
the moment. Solves the "I don't know if I'm close to winning" failure
mode that flat progress bars have at the periphery of vision.

**Cons:** Risk of feeling pre-canned and "achievement-y" rather than
emergent. Camera-zoom on a single-screen prototype is tricky (Pixi
stage scale + center recalc).

**Verdict:** Worth landing as a *thin* version — just the corner
pulse at each 10-score boundary. Skip zoom/vignette in S10. Stack
with B.

---

### E — Procedural fractal "grow" — new primitive extrudes from bond target

```
   before:                                during place:                  after:
                                              ●     ← extruding             ●
   ●                                          │        from target          │
   │                                          ●        through bond         │
   ●─────● ← place new prim here              │        path                 ●─────●
                                              ●─────●                       │
                                                                            ●
```

**Visual:** New primitive doesn't pop in at spark.pos. Instead, it
*grows* out from the target primitive along the bond direction over
~150ms (radius animating 0 → final via easeOutCubic, position lerping
from target.pos to spark.pos).

**Intensity scaling:** Grow duration × combo-tier (Magic combos grow
slower and more dramatically; Functional snap in fast).

**Cost:** M — touches structureRenderer (per-primitive grow tween)
not just effects. Needs a `grownAt: tick` field on Primitive and an
ease in the render path. ~100 LOC. Some interaction risk with verlet
constraints (the bond is taut from frame 1, so the visual extrude
must be **renderer-only** — the simulation primitive is at spark.pos
already, only the *drawn* position lerps).

**Pros:** Most "organic" / "alive" feel. Reads great in playtests
since it makes every place satisfying without being noisy.

**Cons:** Subtle — may not register as "the structure is growing"
unless coupled with another option. Renderer-vs-physics divergence
adds complexity (debug overlay needs to know which to draw).

**Verdict:** Optional polish. Stack with B for max effect; skip if
500-LOC budget gets tight.

---

## Recommendation

For S10, land:

1. **Option B (structure-wide pulse)** as primary — directly answers
   the user ask and reads at all scales.
2. **Option C (merge-wave)** as secondary — makes S9 P2's
   cross-structure merge into a felt event.
3. **Option D-lite (corner pulse on every 10-score boundary)** as
   tertiary — keeps WIN proximity legible.

**Skip in S10:** A (subsumed by B), E (polish, optional).

**Estimated S10 cost:** ~180–250 LOC across `effects.ts`,
`structureRenderer.ts`, `ui.ts`. All renderer-side. No simulation
changes — `world.effects` queue absorbs the new event kinds without
schema migrations.

**Validation plan for S10:** browser pixel-hash signature per event
type (re-use S8 pattern). Snapshot the structure at place-tick vs
place-tick+150 — pulse should produce a hash diff that decays back
to baseline.

---

## Open questions for user

1. **Pulse direction:** in B, should the pulse propagate *outward
   from the new primitive* (suggested above), or *inward toward the
   structure's center of mass*? Outward = "new addition radiates
   outward," inward = "structure draws the new piece in." Either
   reads well; pick one.

2. **Merge-wave force:** in C, should the brief impulse on each
   side's center-of-mass be a *visual-only* nudge (pure render lerp)
   or a *physics impulse* (real verlet jolt)? Physics impulse is more
   satisfying but risks instability under cascade merges.

3. **Tier-gated frequency:** in D, is every-10 right, or
   every-5 / every-15? At threshold 50 and Magic ×3, mid-game pace
   gets one tier event per ~3 placements.

4. **Skip cinematic mode:** debug toggle (`~` + key) to disable all
   structure cinematics? Useful for stress-testing physics without
   visual clutter — but also a slippery slope to bloat.
