# S196 PROGRESS — tree ui-5 (branch s196/ui-5)

## NEXT STEP (top, always current)
TASKS 1-4 DONE (4: prototype OFF, screenshots on OneDrive Desktop). NEXT: git merge master, then gates (typecheck, vitest, build, e2e:gating detached), then final report.

ROOT CAUSE (found): index.html canvas CSS = max-width/max-height 100% + object-fit: contain. Whenever the
window aspect != 16:9 (half-screen, any browser with a toolbar, other monitors), the canvas CSS box is
letterboxed. Controls.updateCursor uses the letterbox-aware cssToCanvasCoords (S39), but Pixi 8's
EventSystem.mapPositionToPoint is NON-uniform (x*(canvas.width/rect.width)) and ignores the bars — so every
Pixi `pointertap`/`pointerover` (castle panel rows+slots+tiles, draft, title, codex, matchBoard, buttons) is
offset. At 1920x1080 (the only e2e viewport) the bug is invisible.

## Log
- npm install exit 0. Enumerated sites (controls.updateCursor OK; Pixi EventSystem WRONG; lobbyScreen input fontSize uses rect.height ratio).
- created progress file; branch from master 7e9d241c.
