# assets-source/

**Purpose:** Source-of-truth folder for asset generation work that happens in **parallel side sessions** while the main SPARK code session works in `src/`.

**Why this exists:** SPARK's main development is a solo workflow in `src/`. Asset generation (sprites, video, audio) is parallelizable, IP-sensitive, and tool-heavy — it benefits from a dedicated session with its own context window and toolchain.

---

## Subfolders

Each godly combo (or other major asset pack) gets its own subfolder with a HANDOFF.md, DESIGN_BRIEF.md, and ASSET_MANIFEST.md.

| Folder | Purpose | Status |
|---|---|---|
| `godly-voltkin/` | First godly — Pokemon-Origins cartoon mascot + TV-bezel cinematic | Active (S22+) |

---

## Workflow rule (parallel sessions)

- **Main session** works in `src/` only.
- **Side session(s)** work in `assets-source/<pack>/` only.
- Both sessions commit to `master` and push to origin.
- Conflicts are unlikely (disjoint paths) but rebase before push.
- When a side session writes `assets-source/<pack>/READY.md`, the main session pulls + integrates.

This is an **authorized exception** to CLAUDE.md's "solo workflow / one session per project" rule, scoped to asset generation only.
