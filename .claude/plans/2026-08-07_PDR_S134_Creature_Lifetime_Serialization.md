STATUS: AWAITING-APPROVAL

═══════════════════════════════════════════════════════════
    PRODUCTION DESIGN REPORT — S134: Creature lifetime serialization
═══════════════════════════════════════════════════════════

OBJECTIVE
  `serializeCreature` couples the `despawnAtTick` emit to `sourceSpawnerId !== null`, and
  `trimMirrorCreature` then strips the field from the wire unconditionally. Any consumer that
  rebuilds a world from a snapshot therefore rehydrates `despawnAtTick = 0`, which makes every
  lifetime and fuse comparison unconditionally true. Emit the field for every creature, stop
  stripping it (and `sourceSpawnerId`) on the wire, and correct the four docblocks that
  mis-state where the fix belongs.

CURRENT STATE
  - The chain, every link re-verified at HEAD ab8d50e this session:
      save.ts:904            `world.tick = snap.tick`
      save.ts:1325-1327      `...(c.sourceSpawnerId !== null ? { sourceSpawnerId, despawnAtTick } : {})`
      save.ts:880-885        `const { sourceSpawnerId: _s, despawnAtTick: _d, targetCreatureId: _tc, ...wire } = c;`
      save.ts:1589           `despawnAtTick: s.despawnAtTick ?? 0`
      creatureLifecycle.ts:298  `if (world.tick >= creature.despawnAtTick) { ...delete... }`
      main.ts:2029-2039      the takeover block never touches `world.creatures`
  - All three CREATURE_CONFIGS are `persistent: false` (voltkin-config.ts:196, :253, :287), so the
    lifetime gate applies to every type.
  - `creature.ts:344` hardcodes `sourceSpawnerId: null` for a Voltkin. `creatureLifecycle.ts:139`
    (lightningDrone) and `:161` (chewer) both pass non-null. So on the DISK path a Voltkin emits no
    lifetime at all; on the WIRE path no creature does.
  - THREE live consumers, not one. Measured this session:
      (1) host migration — `netSnapshot` → `applyNetSnapshot` on a promoted client;
      (2) worker INIT — main.ts:1630 `snapshot()` → workerSim.ts:198 `restore()` + `isHost = true`.
          MEASURED on clean HEAD: `DISK chewer despawn=3600 voltkin despawn=0 (host voltkin=1700)`.
          Under `?worker=1` the Voltkin dies on the worker's first CREATURE_TICK **on the original
          host, with no peer disconnect and no worker failure**. This is live on today's build.
      (3) worker-failure direct-resume — main.ts:1656, which rebuilds allocators and never touches
          `world.creatures`.
  - Severity is higher than "creatures are deleted". hostTick.ts:412-431 Step 1.5 runs BEFORE the
    lifetime gate: a `selfExplode` drone in SEEKING computes `world.tick >= despawnAtTick - 1`,
    i.e. `>= -1`, unconditionally true. Every live drone dispatches DRONE_EXPLODE on the successor's
    first tick, each severing up to DRONE_MAX_CONNECTORS = 3 enemy bonds, up to DRONE_MAX_GLOBAL = 12
    drones — up to 36 irreversible, score-affecting severs caused purely by a host handoff.
  - A second defect is currently MASKED by the deletion: `sourceSpawnerId` rehydrates `?? null`
    (save.ts:1594), which (a) makes `applySpawnCreature` (creatureLifecycle.ts:109) count every
    rehydrated chewer/drone as that owner's Voltkin population and block their summon, and
    (b) zeroes the perSpawner term in `underChewerCaps` (:193) and `underDroneCaps`
    (droneLifecycle.ts:52), silently degrading CHEWER_MAX_PER_SPAWNER 4 and DRONE_MAX_PER_SPAWNER 3
    to the global 12. Fixing lifetimes alone converts one loud bug into two silent ones.
  - Four docblocks assert the fix belongs in the emit condition — save.ts ~840-866, ~1311-1324,
    ~1580-1588 (":1587 says it verbatim") — and are wrong, because the trim runs afterward. A fourth,
    ~1596-1598, still claims `hp` is stripped by `trimMirrorCreature`, untrue since S133. This text is
    what steered S133 into scoping the fix out.

SCOPE (7 changes, 5 files)
──────────────────────────────────────────────────────────

1. src/state/save.ts:1325-1327 — `serializeCreature` (modify)
   Replace the coupled spread with:
       despawnAtTick: c.despawnAtTick,
       ...(c.sourceSpawnerId !== null ? { sourceSpawnerId: c.sourceSpawnerId } : {}),
   `despawnAtTick` becomes unconditional; `sourceSpawnerId` stays conditional so a Voltkin's null
   is not shipped as 23 B of zero information (save.ts:1594 rehydrates `?? null`) and the pre-S100
   Voltkin byte-identity property survives.

2. src/state/save.ts:872-887 — `trimMirrorCreature` (modify) — THE LOAD-BEARING EDIT
   Guard becomes `if (c.targetCreatureId === undefined) { return c; }`; destructure keeps only
   `targetCreatureId`. The 3-condition early-return MUST be rewritten too, not just the destructure:
   once `despawnAtTick` is always emitted, `c.despawnAtTick === undefined` is unreachable and the
   old guard dead-ends. Without this edit, change 1 is a no-op for the wire.

3. src/state/save.ts:1589 — `deserializeCreature` (comment only)
   Leave `?? 0` in place for stale-peer back-compat. Rewrite the comment to state the truth: 0 is a
   DETONATION default (makes creatureLifecycle.ts:298 and hostTick.ts:427 unconditionally true), not
   a neutral one, and the only consumer needing it is a stale PEER — the save/load seams at
   main.ts:971-976 are DEV-only.

4. src/state/save.ts:840-866, 1311-1324, 1580-1588, 1596-1598 (modify)
   Rewrite all four docblocks. Not cosmetic — they are the proximate cause of S133 mis-scoping this.

5. src/state/save.migrationDamage.test.ts:123-156 (modify)
   Invert the characterization locks IN PLACE per the S133 precedent at save.replay.test.ts:815-821.
   Flip :130, :147, :150. KEEP :133-134 (targetCreatureId still stripped — correct) and KEEP
   :154-155 (spawnedAtTick still 0 — a real residual, and the fixture's Voltkin has spawnedAtTick
   500 so "the value travelled" stays distinguishable from "it equalled the default").

6. src/state/save.replay.test.ts:834-835 (modify)
   Flip the two `.not.toContain(...)` assertions. Leave :836 (`targetCreatureId`) alone. Update the
   measured byte block at :797-802. Annotate the 16 KiB assertion at :804 as fixture-scoped.

7. src/state/workerSim.ts:198 + cross-ref comment at main.ts:1630 (modify)
   Record that `restore(snap, world)` + `isHost = true` makes this an AUTHORITATIVE consumer of the
   disk serializer, so any field the host sim reads must be emitted unconditionally. This is what
   stops a future perf pass from re-trimming the path.

NO CHANGES TO
  - `PROTOCOL_VERSION` — stays 15. A bump at protocol.ts:101 drops every peer on an older build
    (transport.ts:144-151), strictly worse than the residual mixed-build window. Shipped as a NAMED
    risk, not as "safe".
  - `schemaVersion` — stays 1.
  - The stale-peer backfill guard (main.ts:2029 / :1656 / :1630) — NOT shipped. Owner call 1.
  - `prevPos` / `targetPos` / `spawnedAtTick` — still do not travel. Logged, not fixed.
  - The 16 KiB wire budget — flagged, not fixed. Owner call 5.
  - Anything under `src/net/`, `e2e/`, the bundle charter, or BACKLOG's V6 roadmap rows.

RISK ASSESSMENT
  - Mixed-build window (HIGH, accepted + named). No bump means a predecessor on an unrefreshed tab
    still sends lifetime-less snapshots and its successor still mass-deletes. (a) closes NEW→NEW and
    nothing for OLD→NEW. Single-artifact Pages deploy makes it one refresh wide. Owner call 1.
  - Caps re-enablement is a visible gameplay change (MEDIUM). Post-fix a promoted host spawns FEWER
    creatures than today, because PER_SPAWNER 4/3 stop degrading to the global 12. Correct behaviour,
    but a playtester will report it as a regression if it is not called out first. Owner call 2.
  - Wire cost (LOW, measured not estimated). Worst-case fixture (12 chewers mid-chew):
    baseline 12,821 B → 13,073 B (despawnAtTick only) → 13,313 B (+492 B, +3.8%). Per-creature
    +21 B Voltkin / +41 B chewer — the brief's "~17 B" was ~2.4x low. Real cap is 30 creatures
    (CHEWER_MAX_GLOBAL 12 + DRONE_MAX_GLOBAL 12 + 6 Voltkins), not 12. transport.ts:555-570 sends
    per active strategy per peer with both nostr and torrent on, so multiply by fan-out.
  - Determinism (NONE, explained not merely observed). The sole production oracle at main.ts:1706 is
    `hashWorldState`, a Pick over NARROW_HASHED_FAMILIES = ['primitives','bonds','freeSparks',
    'scoreByPlayer'] (stateHash.ts:82-87) — structurally unable to read `world.creatures`.
    `despawnAtTick` appears only in the test-only `hashWorldStateFull` (stateHashFull.ts:341).
  - Round-trip-fidelity overclaim (MEDIUM, process risk). (a) does NOT make successor == predecessor.
    Do not ship that claim, or the next session writes a host-vs-mirror equality test that cannot pass.

TESTING PLAN
  Four tests, each observed RED before the fix — not predicted. A/B were already driven to RED on
  clean HEAD this session:
    TEST A (disk/worker-INIT): host at tick 700, chewer(spawner 5, spawnedAt 600) + Voltkin(null,
      spawnedAt 500); `restore(JSON.parse(JSON.stringify(snapshot(host))), fresh)`; assert Voltkin
      despawnAtTick === 1700. OBSERVED RED: `voltkin despawn= 0`. Post-patch: 1700.
    TEST B (wire/promotion): same fixture via netSnapshot → applyNetSnapshot; assert both lifetimes
      equal the host's and exceed world.tick. OBSERVED RED: `chewer 0 / voltkin 0 / tick 700`.
    TEST C (drone, highest severity): lightningDrone SEEKING with a live enemy bond mid-fuse; one
      `runHostTick` on the successor; assert `bonds.size` unchanged. RED at hostTick.ts:427.
    TEST D (caps, writable only after sourceSpawnerId lands — the concrete proof the split is wrong):
      after round-trip, spawn a 5th chewer from spawner 5 and assert REFUSED.
  MUTATION MATRIX — a test that survives its own mutation is vacuous (S133 M9, documented at
  save.migrationDamage.test.ts:60-70):
    M1 restore ONLY the emit coupling (save.ts:1325)      → TEST A re-RED
    M2 restore ONLY `despawnAtTick: _d` in the destructure → TESTS B+C re-RED, TEST A stays GREEN
       (this asymmetry is the proof the two edits fix different consumers)
    M3 restore ONLY `sourceSpawnerId: _s`                  → TEST D re-RED
  FULL-SUITE GATE, measured: both edits on clean HEAD give 2 failed / 2018 passed (132 files), the
  two being the intentional locks. After inverting them the target is 2020/2020 + the new tests.
  ANY THIRD FAILURE IS A REAL REGRESSION. Re-baseline before trusting these numbers.
  BOOT-THEN-SMOKE (owner call 4): the vitest lane mocks the wire with JSON.parse(JSON.stringify(...)).
  Nothing chains wire → promote → snapshot() → restore(), and that chain is exactly where the Voltkin
  died. e2e/hostmigration.spec.ts is @quarantine-flaky (line 33), excluded from the gating lane, and
  contains ZERO occurrences of "creature".

TOOL TRIAGE
  Visual output needed?      No — serialization change, no rendered surface.
  Research/external data?    No — 3-way Council + A.0 already ran; all inputs are in-repo.
  Artifact delivery needed?  No — code + tests land in the repo.

DIFFERENTIAL_TEST_REQUIRED: true
  SCOPE touches the wire/save serialization shape. Satisfied by the byte-measurement pre/post on the
  worst-case fixture (12,821 → 13,313 B) plus the replay byte-equivalence suites.

HOT_PATH_REFACTOR: true
  `serializeCreature` / `trimMirrorCreature` run per creature per snapshot at up to 10 Hz per peer per
  strategy. Already satisfied — 3-way Council R1 (Claude + Grok + Gemini, all three relays succeeded)
  plus PRIME-AUDIT completed before this PDR was written.

ESTIMATED TOKENS: ~28K  (Standard tier)
MODEL: strongest pinned (claude-opus-5, session-pinned)

DELIBERATION RECORD
  A.0 state discovery: 8 agents, 229 tool calls, 10 PRIME-AUDIT deltas (2 BLOCKER).
  3-way Council: claude-opus-5 + grok-4.20-0309-reasoning + gemini-3.1-pro-preview, all HIGH
  confidence on (a) + same-commit sourceSpawnerId; 3 adversarial challenge lenses; Battle Ledger
  + PRIME-AUDIT. Dissent recorded: the sourceSpawnerId emit shape was an unresolved 2-1 (Grok wanted
  it unconditional), two of three could not defend their own determinism reasoning, and Claude's
  Edit 5 backfill was REJECTED as specified because it reintroduces option (c)'s exploit inside the
  one window it was written for.

═══ GATE: Awaiting approval ═══
