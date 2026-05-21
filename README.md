# SPARK

Real-time multiplayer game of geometric emergence — TypeScript + Pixi.js, P2P via Trystero/Nostr WebRTC, host-authoritative 10 Hz NetSnapshot + lerp interpolation.

**Live:** [spark-online.space](https://spark-online.space/) · debug overlay at `?debug=1`

## Quick start

```bash
npm install
npm run dev        # vite dev server (random port via $SESSION_PORT)
npm test           # vitest — 739 tests across 41 files
npm run typecheck  # tsc --noEmit
npm run build      # tsc -b && vite build → dist/
```

Dev server opens a browser automatically. P2P 1v1 needs two browsers/devices and a 6-char room code.

## What it is

Two players place geometric primitives (squares, triangles, circles, hex) onto a shared canvas, bond them into structures, and trigger "godly" cinematic effects when their structures match named recipes. First to a score threshold wins. Phase 2 added the Voltkin lightning creature — a multi-frame animated actor that spawns at cinematic handoff, charges, and severs enemy bonds over an 8-second active window.

Phase 1: single-player physics + placement + scoring.
Phase 2 (current): networked 1v1 + autonomous creature actors + procedural + sampled audio.

## Architecture

```
src/
├── main.ts                  Pixi app bootstrap + render loop + lobby wiring
├── constants.ts             Tunable game parameters
├── types.ts                 Branded ID types (PlayerId, SparkId, ...)
├── combos.ts                Geometric primitive combinations (sq/tr/ci/hx)
├── game/                    Domain entities (spark, primitive, player, effects, structure, invariants)
├── physics/                 Verlet integration, bond solver, collision, spatial grid
├── state/                   World + dispatch reducer
│   ├── world.ts             GameAction union + dispatch switch
│   ├── save.ts              WorldSnapshot serialize/restore + NetSnapshot wire variant
│   ├── creatures/           Voltkin lifecycle + AI + attack
│   └── godlyRecipes/        Recipe matcher (geometric pattern → cinematic trigger)
├── net/                     P2P networking
│   ├── transport.ts         Trystero/Nostr adapter (room join, ICE polling, error plumbing)
│   ├── protocol.ts          NetMessage envelope + parseNetMessage validator
│   ├── sync.ts              HostSync (emit) + ClientSync (receive + lerp interpolate)
│   └── iceConfig.ts         STUN/TURN servers + Nostr relay list
├── input/                   Pointer + keyboard controls
└── render/                  Pixi renderers + overlays + audio
    ├── audioManager.ts      Music + procedural SFX (Web Audio singleton)
    ├── creatureRenderer.ts  Voltkin sprite frame swap + flash
    └── effectsRenderer.ts   ARC_FLASH lightning, screen shake, particles
```

**Authority model:** host runs the full Verlet sim; client renders lerp-interpolated NetSnapshot updates at 10 Hz and sends INTENT envelopes upstream. Per-direction sequence numbers reject out-of-order snapshots; `parseNetMessage` validates the peer wire boundary (allowlist of GameAction discriminants + schemaVersion check).

**Determinism:** seeded RNG (mulberry32); fixed 60 Hz physics step with sub-stepping (PHYSICS_SUBSTEPS=8); all effects carry a `tick` field so the client can derive age deterministically.

## Tech stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Language | TypeScript 5.4 | strict + noUnusedLocals + noFallthroughCasesInSwitch |
| Bundler | Vite 5.2 | sourcemap on, target es2022 |
| Test | Vitest 1.5 | jsdom — no live Pixi/Web Audio |
| Renderer | Pixi.js 8.5 | WebGL + WebGPU fallback chunks |
| P2P | Trystero 0.24 | Nostr-primary (no signaling server to operate) |
| Deploy | GH Pages | actions/deploy-pages@v4 → custom domain via CNAME |

## Deploy

Pushing to `master` triggers `.github/workflows/deploy.yml` → `actions/upload-pages-artifact@v3` + `actions/deploy-pages@v4`. Custom-domain via `public/CNAME` (`spark-online.space`).

## Documentation index

Internal docs live in the repo root + `docs/`:

- **[SPARK_Blueprint.md](SPARK_Blueprint.md)** — full game design, FSM diagrams, physics tuning, scoring model
- **[LOCKED_DECISIONS.md](LOCKED_DECISIONS.md)** — architectural decisions with rationale + revisit gates
- **[BACKLOG.md](BACKLOG.md)** — session-by-session priority log
- **[AUDIT.md](AUDIT.md)** — most recent code audit (Pass 1, 2026-05-21)
- **[CLAUDE.md](CLAUDE.md)** — session pipeline + model-routing + Council protocols for AI-assisted dev sessions
- **[boot-snapshot.md](boot-snapshot.md)** — current session state snapshot
- **[docs/phase-2-design-options.md](docs/phase-2-design-options.md)** — Phase 2 deliberation notes
- **[docs/structure-cinematics-options.md](docs/structure-cinematics-options.md)** — cinematic system design notes

## License

Private project (`package.json: private: true`). Not published.
