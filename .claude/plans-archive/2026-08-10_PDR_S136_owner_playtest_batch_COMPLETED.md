═══════════════════════════════════════════════════════════
    PRODUCTION DESIGN REPORT — S136 Batch: Owner Playtest Response + v0.6 Economy Continuation
═══════════════════════════════════════════════════════════

**Tier:** Full · **Session:** S136 · **Date:** 2026-08-10
**Approval:** owner, explicit, in-session — *"i approve full siession prioritry bathc and full
autonomous run and iil be going to bed. work in the absolute best interests of this project and
vision producing the highest qualityu of work and best output!"*

---

OBJECTIVE
  The owner playtested the S135 haul build and reported six defects/asks. Fix them in the order
  that keeps the game playable at every step, then continue the ruled v0.6 roadmap (B3 faucet,
  sim-worker flip). The centre of gravity is a redesign he asked for explicitly: **the automation
  controls stop being a permanent footer and become a context panel that opens when you click the
  castle**, because "eventually different towers and stuff will have different upgrades and they
  will pop up when you click on them." Storage moves INSIDE the castle, which structurally deletes
  the deposit-pile bug rather than patching it.

CURRENT STATE
  Established empirically this session (A.0, Rule 21). Every claim below is disk- or
  runtime-verified; the two A.0 probe fleets died on a spend cap, so this was done directly.

  · **Owner item 1 — "build extra gatherer or increase speed is not even clickable."**
    NOT a hit-test or wiring bug. Verified by driving the real app in headless Chromium
    (swiftshader; the Browser pane cannot composite, the documented S131 constraint):
    `hitTest` at the SPEED centre returns the button, `cursor==='pointer'`, and the click WORKS —
    score 100→50, `speedLevel` 0→1. Confirmed identically across a 6-cell matrix
    (solo|bots × 1920×1080 | 1536×864 | 1366×768).
    The real defect is **BUY GATHERER is disabled from t=0 and says nothing about why**:
    `STARTING_VICTORY_POINTS = 100` (`constants.ts:332`) against `GATHERER_PRICE = 105`
    (`constants.ts:327`). `drawFooter` renders it dim with no reason text (`ui.ts:727-736`), so a
    correctly-priced button is indistinguishable from a broken one. Worse, in the matrix the local
    player **never reached 105 again within ~93 s** (solo score sat at exactly 50, tick 5580):
    score income is complexity-driven, and a player who has not yet built anything has complexity 0,
    so the opening spend is close to a one-way door.
    ⚠ **A false repro I must not let into the record:** my first run showed the click DEAD. That was
    `?debug=1` — its DOM panel (`position:fixed; z-index:1001`, rect 1471,230→1896,1202) covers both
    buttons, so `elementFromPoint` returns `PRE` and the canvas never sees pointerdown. The e2e
    harness boots `?debug=1` everywhere, so **the harness could never have caught a footer click
    regression** even if there were one. That is its own finding (see SCOPE 1e).

  · **Owner item 2 — the footer should become a click-the-castle popup.** There is no entity
    selection concept in the game today. The footer is Pixi (not DOM), a `Container` added last in
    the HUD constructor holding `footerPlate` + `buyButton` + `upgradeButton` (`ui.ts:427-491`),
    visible only during PLAYING (`ui.ts:703-706`). `isOverFooterControl` (`ui.ts:213-220`) exists so
    a button click does not ALSO fire the raw canvas world hit-test, and `controls.ts:299` consumes
    it. Both button geometries derive from the same constants as that guard, deliberately.

  · **Owner items 3 + 4 — deposited shapes stack, and grabbing one flings the other. ROOT CAUSE
    FOUND.** Banked shapes are **real `freeSparks` physics entities** with `escrow:'banked'`
    (`spark.ts:47-57`) parked at computed world positions. `depositSlot` (`gathererLifecycle.ts:259-269`)
    picks the slot by **counting** currently-banked sparks near the keep:
    `x = home.x - 54 + (banked % 5) * 27`. That count is an occupancy total, not a high-water index,
    so **any hole collapses the mapping**: bank 3, grab the 1st, count drops 3→2, and the next
    deposit is written to index 2 — exactly on top of the shape already there. That is the "dropped
    on top of each other."
    The fling is the second half, and it is *not* a divide-by-zero. `resolvePair`
    (`collision.ts:36`) early-returns on `distSq < EPSILON` (1e-6), so an EXACT stack is inert — which
    is why they sit there looking fine. The moment a grab perturbs the pair off exact-zero,
    `dist` is ~0 while `overlap ≈ minDist/2`, so one substep applies a near-maximal positional
    correction; the module docblock states momentum "is recovered implicitly by Verlet on the next
    substep", which converts that jab into a large velocity. Banked sparks are NOT exempt from
    collision — the `escrow === undefined` tests at `physicsLoop.ts:226,242,248` exempt them only
    from the soft cap and the TTL reap.
    ⇒ Storing inside the castle (item 4) deletes both halves structurally: no world-space slots, no
    collision participation, nothing to fling.

  · **Owner item 5 — the popup build-space.** `CarryingPlayer` is retained and functional by owner
    ruling B6 (`BACKLOG.md:446`), and `PLACE_FROM_FREE` delegates to `placePrimitive`
    (`placeFromFree.ts:244`), so a "pull from bank into hand" path can reuse the shipped placement
    reducer rather than forking it.

  · **Owner item 6 — rainbow should recolor the castle.** Rainbow machinery exists
    (`rainbowLifecycle.ts`, `rainbowRenderer.ts`, `rainbowFlyoverRenderer.ts`); the keep is drawn by
    `gathererRenderer.ts:93` off `castleAnchor(seat)` (`gatherer.ts:102`). Exact tint plumbing to be
    read at P3 open — not yet verified, so P3's SCOPE is stated as intent, not as a line edit.

  · **Roadmap, ruled and pending.** B3 = 6× faucet: `SPAWN_RATE_PER_SECOND = 0.1875`
    (`constants.ts:107`) → ~1.125, and `FREE_SPARK_SOFT_CAP = 50` (`constants.ts:324`) must be
    RE-DERIVED — S132 measured the pool peaking at 4, i.e. the cap is dead code today, and at 6× it
    becomes live. Recipe sizes verified this session against the real registry: pentagram 5 ·
    lightningHub 6 · Helga 7 · Voltkin 8 · laserTurret 8 (plus an undocumented **NONET at 9**,
    `sudokuEvent.ts:20`, which is a 6th exact-size gate the bank-cap table omits). R8 verified: exactly
    ONE production `tickBuildAction` call site (`placePrimitive.ts:584`), and `PLACE_FROM_FREE`
    delegates to it — so a bank-place path that routes through `placePrimitive` keeps earning
    disruption charges automatically. Sim-worker flip: 6 `?worker=1` literals across **4** files (the
    BACKLOG says 5 files), plus `probeHarness.ts:340` REFUSES TO ARM when the flag is set, plus 6
    non-worker-only main-thread paths.

SCOPE (6 priorities)
──────────────────────────────────────────────────────────

**P0 — Castle selection + context panel; retire the always-on footer controls.** (owner 1+2)
  a. New selection concept: clicking your own castle selects it; clicking elsewhere deselects.
     Render-local state, NOT sim state — it must not touch the wire, the hash, or a save.
  b. A popup panel anchored to the castle holding BUY GATHERER and SPEED. Built to be
     entity-generic so a tower can supply its own control list later (the owner's stated reason).
  c. Delete the two controls from the permanent footer. Keep the footer plate/container only if
     something else still uses it; otherwise retire it and revert the `isOverFooterControl` click
     guard to cover the panel's rect instead.
  d. **A disabled control must state its reason** ("NEED 105"), not merely dim. This is the actual
     item-1 defect.
  e. Give the panel an e2e-reachable geometry getter, and fix the `?debug=1` overlay confound so
     the harness can click controls at all. Add the first e2e coverage of these controls — there is
     **zero** today, which is why this shipped unverifiable.

**P1 — Storage moves INSIDE the castle; bank cap 5; waiting-gatherer rule; PULL keeps the game
playable.** (owner 3+4 + ruled V6-1.3)
  a. Banked shapes become a per-castle inventory of primitive TYPES, not world-space entities.
     `depositSlot` and the `escrow:'banked'` world-parking are deleted.
  b. Cap = **5 slots** (owner ruling B4b). The recipe-size table stays adjacent to the number,
     forever, per the standing S128 instruction — and gains the NONET-9 row found this session.
  c. Bank full ⇒ a loaded gatherer walks home and WAITS holding its item.
  d. **PULL:** the castle panel can pull one stored shape into the player's hand (`CarryingPlayer`),
     routed through the shipped `placePrimitive` path. ⚠ This is a HARD COUPLING, not a nicety:
     without it, removing world-space banked sparks leaves the player no way to build at all and the
     game becomes unplayable. P1 does not ship without it.
  e. Serialization: the inventory must reach `FIELD_COVERAGE` (`stateHashFull.ts`), save
     serialize+deserialize, `protocol.ts`, and — the two UNFORCED sites the S135 audit caught —
     `structuralSignature` and the worker positions buffer.

**P2 — The in-bubble build space.** (owner 5)
  Prebuild a structure inside the popup's own space, then pull the whole assembly out. The
  ambitious half of item 5; P1d already delivers the one-by-one path, so P2 is additive and can
  be cut without breaking anything.

**P3 — Rainbow recolors the castle.** (owner 6)
  Make the keep participate in the existing rainbow. Renderer-only if the rainbow is client-side;
  if it turns out to be serialized sim state, that is a protocol bump and P3 stops for a ruling
  rather than inventing one.

**P4 — B3: 6× faucet + re-derive FREE_SPARK_SOFT_CAP.** (owner-ruled)
  `SPAWN_RATE_PER_SECOND` 0.1875 → 1.125. Re-derive the cap from λ×TTL rather than keeping 50; the
  S128 audit's constant-density value is ~28 (27.6 against the physical roam disk). Sequenced AFTER
  P1 deliberately: a 6× faucet against today's uncapped world-space pile would multiply the very
  bug P1 deletes. Also re-check `spatial.ts`'s "≤30 free sparks at 6P steady-state" assumption.

**P5 — Sim-worker default-on flip.** (unblocked by S135 P0)
  Flip the default, drop the flag gate, update the 6 literals across 4 files, and decide the
  `probeHarness` refusal (`probeHarness.ts:340`) — which becomes a refusal-by-default once the flag
  is on, i.e. it must become a `worker=0` opt-out or the harness dies silently.

NO CHANGES TO
  · `PHASE_1_WIN_SCORE` / `SCORE_INCOME_PER_COMPLEXITY_PER_SEC` — B5 (match length) is UNRULED and
    owned by V6-4.3. The faucet change will shorten matches; that is logged, not compensated here.
  · `FUNCTIONAL_BOND_COMPLEXITY` (R19 — the owner personally re-affirmed it).
  · `SPAWNER_RADIUS` and the six constants derived from it (R9/R10 — V6-1.2's spawner shrink).
  · `CarryingPlayer` deletion (B6 → moved to V6-4.3). Carry stays functional.
  · The NONET/sudoku swing, creature/hunter/seagull systems, deploy workflow, CI lanes.
  · `origin/gh-pages` deletion — OWNER-GATED.

RISK ASSESSMENT
  · **R-A (high) — P1 makes the game unplayable if PULL slips.** Mitigation: P1d is in-scope and
    gating; P1 is not committed until a headless run proves pull→place→score works end to end.
  · **R-B (high) — the inventory is a new serialized family with two UNFORCED sites.**
    `FIELD_COVERAGE` and the action Record fail the build if missed; `structuralSignature` and the
    positions buffer do NOT. Mitigation: explicitly enumerate all five sites in P1e and assert each.
  · **R-C (medium) — selection state leaking into sim state** would desync or dirty the hash.
    Mitigation: render-local only; verify it is absent from `FIELD_COVERAGE` and the wire.
  · **R-D (medium) — retiring the footer controls could strand the pointer-capture guard.** There is
    already a logged open item that the carried-potato `onUp` footer branch can strand capture.
    Mitigation: revert `isOverFooterControl` in the same change, do not leave a guard covering a
    region with nothing in it.
  · **R-E (medium) — P4's 6× faucet trips tests that assume a small pool** (`collision.pile`,
    `spatial`, probe-harness λ assertions, any `Math.abs(SPAWN_RATE_PER_SECOND - 0.1875)` check).
    Mitigation: enumerate and run before committing; a test asserting the OLD literal is a
    legitimate update, a test asserting pile behaviour is a real signal.
  · **R-F (low, process) — I could not run the mandated 3-way Council.** Two A.0 probe fleets died
    on a spend cap after ~1.7M subagent tokens returning nothing. Deliberation budget was
    redirected into the empirical A.0 work above (which is the load-bearing part) plus a written
    PRIME-AUDIT per priority. **Stated as a deviation, not presented as compliance.**
  · **R-G (low) — the owner is asleep and cannot rule mid-batch.** Any question that would need a
    ruling gets the conservative branch plus a logged carry-forward; nothing owner-gated is decided
    unilaterally (explicitly: gh-pages, B5, the R19 reversal, and a rainbow protocol bump).

TESTING PLAN
  · Per priority: `tsc` 0 errors · full `vitest` green (baseline to be captured at P0 open) ·
    `npm run build` under the bundle gate.
  · **Runtime, not just static.** Every priority that changes something the player touches gets a
    headless-Chromium run that drives the REAL app and asserts world state — the S130 lesson
    (a unit-tested feature shipped dead because the draw path was never driven) and the S135 lesson
    (wait on EVENTS, never tick counts: pickup is ~154 ticks, not 420).
  · **Never boot a click test with `?debug=1`** — its DOM panel covers the control region. Found
    this session; the entire existing harness has this confound.
  · RED-first where a bug is being fixed: prove the stacking repro fails before the fix.
  · New permanent e2e coverage for the castle panel controls (none exists today).
  · Deploy: `npm run verify-deploy` 4/4, rebuilding first (a stale local `dist` fails the hash
    compare — do not assume CDN lag).

TOOL TRIAGE
  Visual output needed?      **No** — this is game code; verification is headless screenshots from
                             the project's own Playwright, not generated art. No new characters or
                             sprites are in scope (the S135 art pipeline is untouched).
  Research/external data?    **No** — the entire scope is this repo plus owner rulings already
                             recorded in BACKLOG.md/LOCKED_DECISIONS.md. No external API is
                             authoritative for any of it.
  Artifact delivery needed?  **No** — the deliverable is committed code on `master` plus the live
                             deploy the owner plays; no document/export is requested.

DIFFERENTIAL_TEST_REQUIRED: **false**
  SCOPE touches none of `~/.claude/lib/`, `~/.claude/hooks/`, `router.sh`, Council/Grok/Gemini
  prompt-construction strings, or session-state schema migrations. It is game source in
  `src/` + `e2e/`. (P1 does change a SAVE/wire schema — that is covered by the stronger
  round-trip + host-migration assertions in P1e, not by a hook differential test.)

HOT_PATH_REFACTOR: **false**
  Same scope set as above: no `lib/`, no `hooks/`, no router/classifier, no LLM-prompt code, no
  session-state migration. Already Full tier, so no escalation applies regardless.

ESTIMATED TOKENS: ~420K across 6 priorities (GREEN at open: 200K/1M)
MODEL: strongest pinned (claude-opus-5 this session)

═══════════════════════════════════════════════════════════
    GATE: approved by owner in-session (explicit: "i approve full session priority batch
    and full autonomous run"). Executing P0→P5 in order.
═══════════════════════════════════════════════════════════
