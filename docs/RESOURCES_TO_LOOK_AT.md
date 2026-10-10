# The Spark: resources worth a look
Date: 2026-10-10. Stack: TypeScript, PixiJS, WebRTC (host-authoritative P2P), Vite/Playwright. Priorities seen in NEXT_SESSION_PROMPT (S196): lag fix verification, six race tiles and team tiles art, team music, bots, CI fixes, host CPU with 3+ joiners.

1. **PixiJS v8.22.0** https://github.com/pixijs/pixijs/releases (MIT, Oct 1 2026). Adds WebGPU transient MSAA and 3D/storage textures; Tab-key accessibility activation is back on by default (opt out via `accessibilityOptions: { activateOnTab: false }`). *Check your pinned version and the opt-out before upgrading; may help the graphics tiers.*
2. **Trystero 0.26.0** https://github.com/dmotz/trystero (MIT, Oct 4 2026). Serverless WebRTC matchmaking. *Review release notes against your relay/TURN setup and the hard-blip silent-drop issue.*
3. **Kenney assets** https://kenney.nl/assets (CC0). Newest: Skyboxes Space (Oct 1 2026), Flag Pack, Modular Cave Kit, Tiny Farm, Mini Forest (https://kenney.itch.io/kenney-game-assets/devlog/1588546/update-version-36). *Placeholder and reference art for race tiles and tower sets.*
4. **Lospec palette list** https://lospec.com/palette-list (free; each palette has its own credit/terms). *Fixed palettes to keep the six race tiles visually coherent.*
5. **game-icons.net** https://game-icons.net (CC BY 3.0, attribution required: https://game-icons.net/about.html). *Tower, unit and ability icons for the UI.*
6. **Free music loops (CC0)** by Tallbeard Studios, listed at https://itch.io/game-assets/free (per-asset licenses; this one shown as CC0). *Starting point for team/race music while your own tracks are in progress.*
7. **Sonniss GDC 2026 audio** https://gdc.sonniss.com/ (royalty-free, no attribution). *Impact, explosion and ambience SFX.*
8. **OpenGameArt** https://opengameart.org (mixed licenses: filter CC0; avoid unclear ones; FAQ https://opengameart.org/content/faq). *Fallback for tiles and loops.*
9. **Freesound** https://freesound.org (CC0, CC-BY, CC-BY-NC mixed: https://freesound.org/help/faq/). *Single SFX; skip anything marked NC for a commercial game.*

Unverified: your current Pixi and Trystero versions; whether Spark already uses any of these.

---
Found by Vigil for Daniel; optional reading for your next session, no code changes.
