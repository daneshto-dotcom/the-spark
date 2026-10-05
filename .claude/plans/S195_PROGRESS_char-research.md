# S195 PROGRESS — char-research (N20)
NEXT STEP: DONE — research doc committed; hand back to coordinator (owner reads summary in chat).
## Facts gathered (cited in the final doc)
- Blender NOT installed on this machine (no `where blender`, no Program Files/Blender Foundation, not in Steam common).
- Game: units face L/R only via sprite.scale.x flip (creatureRenderer.ts:442,522); side-on walk; 12 frames/state. Units atlas 2400x800 (200px cells, 4 states) ~1.6 MB PNG; voltkin-tv 3072x1536 (256 cells, 6 rows) 352 KB. public/art 86 MB. Bundle cap 1350 KiB (check-bundle-size.mjs:19). pixi.js ^8.19.0, pixi-filters 6.1.5. GraphicsTier HIGH/LOW/MINIMAL (displayPrefs.ts:91).
- Spine: @esotericsoftware/spine-pixi-v8 4.3.x, official, Pixi >=8.16, WebGL/WebGPU/Canvas (esotericsoftware.com/spine-pixi, blog 2024-11-07). Essential $69 (no meshes), Pro $379 (meshes), Enterprise if >$500k revenue (esotericsoftware.com/spine-purchase).
- Rive: @rive-app/webgl2 ~925 KB gz wasm + ~450 KB JS; canvas-lite smaller (rive.app/docs/runtimes/web).
- three.js+Pixi v8 shared context: official guide pixijs.com/8.x/guides/third-party/mixing-three-and-pixi (resetState, clearBeforeRender false).
- pixi3d: no official v8; unofficial alpha fork smithy-org/pixi3d-v8 (Pixi >=8.20, not production-used).
- Meshy: Free 100cr CC BY 4.0; Pro $20/mo 1000cr; Meshy 6 gen = 30cr (meshy.ai/pricing).
- Tripo: Pro ~$19.90/mo, rig 25cr, retarget 10cr/anim, free tier CC BY no commercial (developers.tripo3d.ai/en/pricing).
- Blender headless: blender -b file.blend -P script.py (docs.blender.org/manual/en/latest/advanced/command_line/arguments.html).
