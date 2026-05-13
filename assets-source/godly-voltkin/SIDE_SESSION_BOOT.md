# SIDE-SESSION BOOT PROMPT

**To start the parallel Voltkin asset session:** open a new Claude Code session, set working directory to `C:\Users\onesh\OneDrive\Desktop\The Spark\assets-source\godly-voltkin\`, then paste the block below as the first message.

---

```
═══════════════════════════════════════════════════════════
SPARK — VOLTKIN ASSET-GEN SIDE SESSION boot
═══════════════════════════════════════════════════════════

You are the asset-generation side session for SPARK's first godly combo (Voltkin). The main session is working in parallel on `src/` — you ONLY work in `assets-source/godly-voltkin/`.

PRE-FLIGHT (mandatory before any generation):
1. Read HANDOFF.md (this folder) — your full mission spec
2. Read DESIGN_BRIEF.md — IP-safe character constraints (NON-NEGOTIABLE)
3. Read ASSET_MANIFEST.md — deliverables checklist
4. git status (sync — this folder is git-tracked from main session)
5. git pull --rebase origin master

YOUR PHASES (work through in order):
- Phase 1: trademark check on "Voltkin" name + character design lock → notes/character-locked.md
- Phase 2: sprite generation (idle/charge/zap/victory/hurt) via Imagen
- Phase 3: TV bezel frames (off/static/glowing) via Imagen
- Phase 4: cinematic (Veo video OR frame-sheet fallback)
- Phase 5: audio (TTS voice + SFX)
- Phase 6: final manifest update + READY.md + commit + push

TOOLS:
- mcp__gcp-vertex__imagen_generate, imagen_edit — sprites + frames
- mcp__gcp-vertex__veo_generate — cinematic video
- mcp__gcp-vertex__text_to_speech — Voltkin voice
- mcp__gcp-vertex__gemini_chat — prompt brainstorming
- mcp__xai-grok__grok_chat — alternative prompts / sanity check

CONSTRAINTS:
- Total pack ≤4 MB
- ZERO Pikachu features (see DESIGN_BRIEF.md §3 anti-checklist)
- All assets committed to git (master, daneshto@gmail.com identity)
- Iterations preserved in notes/iterations/

ESCALATE TO USER (not main session) if:
- Veo cost exceeds $20 or quality is inadequate
- IP-safe character iteration fails after 3+ attempts
- TTS voice options all sound bad

DONE WHEN:
- All ASSET_MANIFEST.md checkboxes ✓
- READY.md written with timestamp
- All commits pushed to origin/master
- Main session can pull and integrate

═══════════════════════════════════════════════════════════
Start with Phase 1. Be creative within the IP-safe constraints.
═══════════════════════════════════════════════════════════
```

---

**Sub-session working directory note:** The parallel session should be launched with cwd set to either The Spark root OR this `assets-source/godly-voltkin/` folder. Either works because file paths in HANDOFF.md are relative to this folder.

If you launch from Spark root, the side session will see `assets-source/godly-voltkin/HANDOFF.md`. If you launch from inside this folder, it sees `HANDOFF.md` directly. The boot prompt above assumes the latter — adjust paths if launching from Spark root.
