# S196 PROGRESS — tree ui-5 (branch s196/ui-5)

## NEXT STEP (top, always current)
TASKS 1-4 DONE. Gates: typecheck 0, build 0 (1237.5 KiB), vitest 617/626 files (teams census fixed after; endgameAudit MED-1 timeout-only). NEXT: e2e:gating running detached → .tmp-gates/e2e-gating.{log,exit}; then full vitest re-run; then final report.

ROOT CAUSE (found): index.html canvas CSS = max-width/max-height 100% + object-fit: contain. Whenever the
window aspect != 16:9 (half-screen, any browser with a toolbar, other monitors), the canvas CSS box is
letterboxed. Controls.updateCursor uses the letterbox-aware cssToCanvasCoords (S39), but Pixi 8's
EventSystem.mapPositionToPoint is NON-uniform (x*(canvas.width/rect.width)) and ignores the bars — so every
Pixi `pointertap`/`pointerover` (castle panel rows+slots+tiles, draft, title, codex, matchBoard, buttons) is
offset. At 1920x1080 (the only e2e viewport) the bug is invisible.

## Log
- npm install exit 0. Enumerated sites (controls.updateCursor OK; Pixi EventSystem WRONG; lobbyScreen input fontSize uses rect.height ratio).
- created progress file; branch from master 7e9d241c.
