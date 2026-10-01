# S192 — ENGINE AUDIT (read-only research, 2026-10-01)

Companion to `S192_ENGINE_AUDIT.html` (same content, designed page; also at
`C:\Users\onesh\OneDrive\Desktop\SPARK_Engine_Audit.html`). No source edited, nothing committed.

## Recommendation (5 lines)
1. Don't rebuild. The effects look cheap because they're flat solid shapes: there are 0 glow/bloom filters, 0 additive blend modes and 0 particle textures in `src/`. That's not a Pixi limit.
2. This month, run a visual pilot on Pixi. Rebuild Vlad's siphon, then the spawner aura, with additive soft particles, one bloom filter layer and a shockwave. 1–2 days each, $0 (MIT + CC0).
3. Stop using veo video for effects. Keep it for characters and towers; effects should be particles + shaders that react to game state.
4. For Steam, use Electron + steamworks.js (Vampire Survivors and Cookie Clicker precedent). About 4–6 weeks including Steam's mandatory 2-week Coming Soon. Steam relays fix TURN for Steam players.
5. An engine port is 3–5 months (Godot) to 4–6 months (Unity) just to reach parity. Worth it only for consoles, 3D or an artist-editor team, and then Godot (MIT), not Unity (browser can't host) or Unreal (no web, weak 2D).

## Measured stack facts (main checkout, 2026-10-01)
| | |
|---|---|
| Language | TypeScript 5. 313 non-test `.ts` files, **111,709 lines** |
| Renderer | **pixi.js 8.19.0** (latest on npm 8.21.0, 2026-09-17). 121 render modules, 41,161 lines |
| Build | Vite 6 + tsc. Main bundle **977.7 KiB** / 1,100 KiB cap (122.3 KiB headroom), from `node scripts/check-bundle-size.mjs` on `dist/`; simWorker chunk 228 KiB |
| Netcode | Trystero 0.25.2 (WebRTC P2P; MQTT/Nostr/torrent signalling; metered.ca TURN). Host-authoritative, `NET_SNAPSHOT_HZ = 10`. `src/net` 9,227 non-test lines |
| Sim | `src/state` 41,221 + game/physics/combos/constants 7,303 + bots 2,210 = **~50,700 lines** of deterministic logic |
| Hosting | GitHub Pages (`spark-online.space`), push to master = deploy; Cloudflare Worker + D1 leaderboard |
| Tests | 426 test files / **115,442 lines**, ~5,742 `it(`/`test(` calls (regex count; CLAUDE.md's S179 measured 4,569/290 files); e2e 35 files / 111 tests |
| Static assets | **177.4 MiB / 225 files** (54.6 MiB is the Godot game Pitch Masters; boss atlases 4.8–6.8 MB PNG each) |
| Effects | 81/121 render modules use Pixi `Graphics`; **59 use only Graphics**; 28 load textures; 388 vector draw calls; 69 atlas JSONs. The only custom shader is `cinematicLumaKey.ts`; no `blendMode:'add'` anywhere (only `'erase'` in fog) |
| Vlad siphon | `src/render/bossAuras.ts` `drawLifeSap()` L560–590: one growing circle + 18 solid 3.4 px dots sliding inward |
| Building aura | `src/render/spawnerZoneRenderer.ts`: 6–11% disc + three 2 px rings + bond strokes + midpoint beads + core dot. Also `groundDecalRenderer.ts`/`raceGround.ts` ground marks |
| Comparison | Pitch Masters (Godot 4.3 web export, `public/pitch-masters/game/build.json`): `index.wasm` 35.4 MB + `index.pck` 6.0 MB |
| History | 2,112 commits since 2026-05-09 |

## Key external facts (checked 2026-10-01)
- pixi-filters 6.1.5, MIT, peer pixi >=8 (glow, advanced-bloom, shockwave, displacement, godray).
- @pixi/particle-emitter 5.0.10 is Pixi v7-only (peer <8); the v8 community fork @spd789562/particle-emitter 1.0.2 (MIT, Oct 2025). Both use Math.random, which conflicts with SPARK's same-on-every-screen visual rule, so write a deterministic emitter instead.
- Spine runtime spine-pixi-v8 4.3.13 (peer pixi ^8.16). Spine Essential $69 sale / $99 list; Pro $369 / $439; Enterprise $2,499 at ≥$500K revenue.
- dragonbones-pixijs 1.0.5 (community, May 2025): skip.
- EffekseerForWebGL: MIT, last release tag 2023-05, no Pixi integration. Use it as an authoring tool that exports PNG frames. Pixel FX Designer about £8.50 on Steam, exports sprite sheets.
- Kenney Particle Pack: 80 sprites, CC0. CraftPix magic packs about $6–7 (often 90% off), 774-asset bundle $49.
- PixelLab from $12/mo; Ludo $20/mo.
- Godot: 4.7 (2026-06-18), 4.7.2 (2026-08-18); MIT. Web export supports WebRTC/WebSocket only; C# can't export to web; single-threaded web default since 4.3. GodotSteam 4.20 (MIT) with Godot 4.7.
- Unity: Personal free under $200K; Unity 6 Personal splash optional; Pro $2,310/yr/seat from 2026-01-12; Runtime Fee cancelled 2024-09-12. Unity Web = WebSocket *client* only via Unity Transport, so a browser can't host.
- Unreal: 5% royalty above $1M lifetime gross per product (waived on EGS). No HTML5 export since 4.24. Paper2D ships but is neglected.
- Steam: $100 Steam Direct fee (recouped at $1,000); store review 3–5 business days; Coming Soon ≥2 weeks before release. Steam Datagram Relay for P2P.
- Electron 44.5.1 (2026-09-30); Tauri CLI 2.12.1; steamworks.js 0.4.0 (last commit 2025-09-07): achievements, stats, cloud, matchmaking lobbies, P2P packets, overlay (unreliable in Electron), workshop.
- Precedents: Vampire Survivors (Phaser + Electron until Unity v1.6, Aug 2023): ~2M copies / ~$7M in its first Steam month. Cookie Clicker (Electron, Steam Sep 2021): est. 2.5M+ Steam copies. CrossCode (impact.js + NW.js): est. ~464K Steam copies, ~$6M gross. Godot: Brotato 10M+; Slay the Spire 2 left Unity for Godot (EA March 2026).

## Port estimate
| Part | Lines | Fate | Effort |
|---|---|---|---|
| Sim (state/game/physics/combos/constants/bots) | ~50,700 | translate as logic; re-prove determinism | largest, riskiest |
| Net | ~9,200 | rewrite on engine networking / Steam | medium |
| Render + UI | ~41,200 | rebuild as scenes (where engines help) | large |
| Shell/input/arcade/worker | ~10,600 | mostly replaced | small–medium |
| Tests | ~115,400 + 111 e2e | rewrite (GUT/gdUnit4/NUnit); no Playwright equivalent | large |
Estimate: Godot 3–5 months, Unity 4–6 months of daily sessions to parity. My estimate, from measured size and the S182 "2–4 defects per fix round" history.

## Visual pilot (about 1.5 days, $0)
0. Capture before footage of the sap and a spawner aura.
1. Add pixi-filters (advanced-bloom, glow, shockwave only); create one additive `fxLayer` with a single bloom; re-check the bundle cap.
2. Write a deterministic particle helper: f(world.tick, entityId, index), no Math.random; soft Kenney CC0 texture.
3. Rebuild `drawLifeSap`: ~120 spiralling motes with MeshRope trails, pulsing core, ground stain, shockwave on heal. Same `sapFlashUntilTick` trigger, no protocol bump.
4. Keep the `bossAuras.test.ts` contracts and add a same-tick-same-output determinism pin.
5. Owner reviews the side-by-side. If approved, apply to the spawner aura, Ra, lightning, hits and deaths (about a day each).

## Sources (accessed 2026-10-01)
- npm registry live queries: https://registry.npmjs.org/ (pixi.js, pixi-filters, @pixi/particle-emitter, @spd789562/particle-emitter, @esotericsoftware/spine-pixi-v8, dragonbones-pixijs, steamworks.js, electron, @tauri-apps/cli)
- https://github.com/pixijs/filters
- https://pixijs.com/8.x/guides/components/scene-objects/particle-container
- https://github.com/pixijs-userland/particle-emitter
- https://jsr.io/@spd789562/particle-emitter
- https://esotericsoftware.com/spine-purchase
- https://github.com/effekseer/EffekseerForWebGL
- https://store.steampowered.com/sub/815848 ; https://codemanu.itch.io/particle-fx-designer
- https://github.com/Calinou/kenney-particle-pack
- https://free-game-assets.itch.io/pixel-art-magic-sprite-sheet-effects
- https://support.unity.com/hc/en-us/articles/34387186019988-Can-I-use-assets-from-the-Asset-Store-with-other-engines
- https://ludo.ai/compare/best-ai-sprite-generators ; https://app.cinevva.com/guides/ai-pixel-art-generators
- https://godotengine.org/news/release
- https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html (raw rst on github godot-docs master)
- https://godotsteam.com/
- https://unity.com/products/pricing-updates
- https://unity.com/blog/unity-is-canceling-the-runtime-fee
- https://docs.unity3d.com/2023.1/Documentation/Manual/webgl-networking.html
- https://coherence.io/blog/tech/unity-webgl-game-builds-meet-multiplayer
- https://www.unrealengine.com/en-US/faq ; https://roadtovr.com/unreal-engine-royalty-free-first-1-million-revenue/
- https://forums.unrealengine.com/t/paper2d-dead/121200
- https://partner.steamgames.com/doc/features/multiplayer/steamdatagramrelay
- https://partner.steamgames.com/doc/store/coming_soon ; https://partner.steamgames.com/doc/store/releasing
- https://fungies.io/how-to-sell-games-on-steam/
- https://github.com/ceifa/steamworks.js (client.d.ts) ; https://github.com/goldfire/greenworks/blob/master/docs/troubleshooting.md
- https://www.drawize.com/blog/tech-how-to-release-html5-game-on-steam
- https://en.wikipedia.org/wiki/Vampire_Survivors ; https://www.gamingonlinux.com/2023/07/vampire-survivors-switching-to-new-game-engine-on-august-17
- https://www.vidaextra.com/industria/vampire-survivors-consiguio-7-millones-dolares-su-primer-mes-cuanto-habria-perdido-cambios-unity
- https://raijin.gg/app/1454400/Cookie_Clicker ; https://raijin.gg/app/368340/CrossCode/sales-revenue ; https://wiki.netbsd.org/gaming/crosscode/
- https://en.wikipedia.org/wiki/Brotato ; https://en.wikipedia.org/wiki/Slay_the_Spire_II

Caveats: Cookie Clicker and CrossCode sales are third-party estimates. Port estimates are judgment, not quotes. Bundle size was read from the `dist/` sitting in the main checkout (CLAUDE.md's S192 figure of 975.2 KiB was measured on the deploy-#6 tree).
