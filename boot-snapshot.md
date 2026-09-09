# BOOT SNAPSHOT — after S169 (2026-09-09)

Read `HANDOFF_S169_2026-09-09.md` first. It is the full picture; this is the 30-second version.

## Where the code is
`master`, clean, pushed. Live at spark-online.space. `PROTOCOL_VERSION` 45.
Gates green at close: typecheck 0 / vitest 4159 / e2e:gating 65 / e2e:races 5 / soak 1 /
verify-deploy 4/4 / build 811.5 KiB of 900.

## The next five things, in order

1. **FIX THE FOG.** The owner ruled twice. EVERY race's artistic backdrop must be VISIBLE - all
   races, his and every opponent's - and whatever backdrop a player chose (including the plain black
   one) is what shows. The castle stays visible. HIDDEN during BUILD: buildings, connectors, spawn.
   AND a hidden building must REVEAL ON MOUSE-OVER, which nothing in the codebase does today. The
   shipped build fogs everything and he called it stupid. Fix site `src/main.ts:628-629` - but NOT
   as a two-way swap, that was regression F1 (the 0.55-alpha backdrop then composites over every
   building). Needs a third layer.
2. **P2 THE PHARAOH (R142)** — untargetable condition, locust cone, unkillable Ra channel. Not started.
3. **P4 THE THREE-DIGIT COHERENCE SWEEP** — never run. Only a 5-finding regression pass was.
4. **DISCUSS THE PARKED DESIGN** — hide connectors once a tower is built (they become a damage
   readout); per-race build/destroy cinematics (the `spawning` sheet row already exists and no code
   can draw it); repair/scrap; tower art for pentagram / lightningHub / Helga.
5. **ABILITY ART** — no boss skill draws anything at all. Two deliverables each: the VFX and a
   renderer that derives it from synced state. Read `ART_PIPELINE.md` before generating anything.

## Two traps that will bite on day one
- Moving a renderer between fog layers breaks `tower-art.spec.ts` and `fog.spec.ts` (hardcoded Pixi
  child indices 3 and 8). Item 1 above is exactly that change.
- `e2e:races` is a SEPARATE CI job; `npm run e2e:gating` cannot see it. Run both.
