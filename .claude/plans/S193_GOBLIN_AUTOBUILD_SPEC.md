# S193 — GOBLIN TOWER AUTO-BUILD TOGGLES (owner T4) — SPEC

Branch `s193/goblin-autobuild` (worktree agent, NOT the merge owner). Base: master `a638565b`.

## The owner's words (T4, `S192_OWNER_PLAYTEST_LIST.md`, verbatim, trimmed of fillers)

> *"right click each of the six shapes that build … the goblins … it's like a toggle … I could do like
> square toggle and like spiral toggle. And each time I have free space in the goblin tower because it
> can hold only 10 goblins … and if you have the shapes in your castle it actually builds the … shield
> goblin and … a spiral … bat goblin automatically … You can toggle all the shapes too … whenever
> there's a free shape, it builds … those goblins. And if the goblin tower can hold more goblins."*

What is HIS (built exactly): right-click a goblin-tower feed shape = toggle; several toggles at once;
whenever the tower has a free slot (10, or 20 under THE HORDE GROWS — canon §3e) AND the castle bank
holds that shape, the tower builds that goblin by itself.

What is MINE (flagged `⚠ MINE` at the constant / function, reported as owner questions): everything
in §2 marked MINE.

## 1 · What exists today (read, not assumed)

- `FEED_TOWER {playerId, spawnerId, sparkType}` (`state/goblinTowerFeed.ts`) — a client intent; five
  gates (tower exists + feedable recipe → owner → anchor standing → bank holds the shape → the goblin
  can be born: `underGoblinCaps`, which reads `goblinCapPerSpawner` = 10 / 20 under HORDE). Debits the
  bank only after the last gate (atomic). Not phase-gated. Bench: DENY. Elimination: DENY. Endgame
  lock (branch `s192/endgame`, unmerged): ALLOW (*"they can build more … goblins"*).
- The shape → goblin map is `GOBLIN_FEED_MAP` (Dot→sapper, Line→archer, Triangle→melee,
  Square→shield, Circle→hound, Spiral→bat).
- The live surface is the CHARACTER CARD (`render/characterSheet.ts`): the feed strip is six 32 px
  chips laid out by `layoutSheetActions` from `structureActionModel`'s buttons; the click path is
  `controls.handleSheetActionClick` (LMB only, `R190-G: LMB`). A disabled chip (no shape banked) is
  drawn dimmed and swallows a click with the refused cue.
- R190-G (S191): every `button === 2` site in `controls.ts` is tagged HAND or BOARD and counted
  (`controls.rightClickSurfaces.test.ts`, exactly six today). No right-click acts on a card control yet.
- The goblin tower's host-poll arm in `hostTick` is EMPTY by design (S152 A1: it emits nothing on a
  cadence; it is fed).
- Bots never feed goblin towers (`grep FEED_TOWER src/bots` → nothing).

## 2 · The design

### 2.1 The intent — `SET_AUTO_FEED { playerId, spawnerId, sparkType, on }` (new client intent → BUMP)

- **A SET, not a flip** (⚠ MINE). The client sends the state it wants, computed from the lit cue it
  can see. Idempotent: a duplicated or re-sent intent cannot undo itself, and a joiner clicking twice
  on a lagging view lands where its last click said, not at the parity of its clicks.
- Gates, every one before any mutation, no-op-never-throw: the spawner exists → its recipe is
  `'goblinTower'` (⚠ MINE: race towers are NOT toggleable — he said "the goblin tower"; question Q3) →
  the seat owns it → `sparkType` is an integer in 0..5 → `on` is a boolean. ⚠ The anchor-standing gate
  is NOT required here: a toggle on a tower that collapses this tick is harmless, the tower's record
  goes with it.
- **Phase: none** — FEED is not phase-gated, so neither is the toggle.
- **Bench: ALLOW** (a standing order, `SET_GATHERER_PREFERENCE`'s class — it acquires nothing). The
  FEEDS it causes are still bench-DENIED, because the runner dispatches `FEED_TOWER` (below), so a
  benched seat's toggles wait and resume when the bench lifts.
- **Elimination: DENY** (elimination denies standing orders; a dead seat has nothing to feed).
- **Endgame lock: ALLOW** — ⛔ merge seam: `ENDGAME_LOCK_INTENT_POLICY` on `s192/endgame` is
  exhaustive over `CLIENT_INTENT_TYPES`; the merge owner adds `SET_AUTO_FEED: 'allow'` there.

### 2.2 Where the state lives — per TOWER, on `CreatureSpawner` (four sites)

- `autoFeedMask?: number` — bit `1 << sparkType` per toggled shape; absent / 0 = nothing toggled.
  Factory (`makeSpawner` → 0) · serialize (disk + worker INIT + **the wire**, emitted only when ≠ 0 —
  the client needs it to draw the lit cue) · wide hash `:af` + the `SpawnerHashed` union + per-field
  contribution test · worker (rides `serializeSpawner`, which the worker INIT already uses).
- `autoFeedCursor?: number` — the round-robin cursor (§2.3). Disk + worker INIT, **trimmed off the
  wire** like the cadence fields (host-local; a client never simulates it). Wide-hashed `:ac`.
  ⚠ On a host migration the promoted client re-seeds it to 0 — at worst the next auto-built goblin is
  a different one of the toggled kinds. Never a wrong count, never a free goblin.
- **Per tower, not per seat** (his "in the goblin tower"). A tower that dies takes its toggles with
  it; a rebuilt tower starts with every toggle OFF (⚠ MINE, Q4).

### 2.3 Several toggles, one free slot — round-robin by shape order, persisted cursor (⚠ MINE)

On each auto-build poll for a tower, try the six shapes in `ALL_SPARK_TYPES` order STARTING AT the
cursor (wrapping); the first shape that is toggled AND banked is fed. After a successful feed of shape
`s`, `cursor = (s + 1) mod 6`. So Square + Spiral toggled with plenty of both alternate
shield, bat, shield, bat …; if Squares run out, the free slots go to bats. A total order over plain
integers, no `Map` iteration decides anything.

### 2.4 Cadence — never more than a manual FEED could do

- The runner **dispatches `FEED_TOWER`** for the seat (it does not call a private copy of the
  reducer), so every one of FEED's gates — ownership, anchor, bank, the 10 / 20 cap, bench,
  elimination, and the endgame lock when it merges — applies unchanged. Paid exactly like a click.
- **At most ONE goblin per tower per poll**, and the poll runs every `AUTO_FEED_POLL_TICKS` = **6**
  ticks (0.1 s), phase-spread by spawner id: `(world.tick + id) % 6 === 0` (⚠ MINE, Q2). A tower that
  frees one slot refills within 0.1 s; an empty tower with all ten slots free refills in 1 s, a HORDE
  tower in 2 s. Cheap: a tower with no toggles costs one integer test; the O(creatures) cap count runs
  only after the mask AND the bank say a feed is possible.
- Runs while `gameState === 'PLAYING'`, in BOTH phases (FEED works in both), host / worker only (it
  sits in `runHostTick`; the client never simulates spawners). Towers in ascending spawner-id order, so
  two towers of one seat competing for its last Square resolve the same way on host and worker.
- `spawnedCount` advances inside `applyFeedTower`, the same as a click.

### 2.5 What happens when …

| case | result |
|---|---|
| bank empty of every toggled shape | nothing; the toggles stay lit; building resumes the poll after a shape lands |
| tower full (10 / 20) | nothing (FEED's Gate 5); resumes the poll after a goblin dies |
| toggle off | that shape is never auto-fed again (manual LMB feed still works) |
| someone else's tower | `SET_AUTO_FEED` refused (owner gate); the runner feeds only as the tower's owner |
| tower dies | the spawner record — mask and cursor — is removed with it |
| seat benched | toggles allowed; the feeds they cause are refused until the bench lifts |
| seat eliminated | the toggle is refused; any feed is refused |
| race tower (t3) | not toggleable (⚠ MINE, Q3); a right-click on its chip plays the refused cue |

### 2.6 The gesture and the visual cue

- **Right-click a feed chip on the goblin tower's card** = `SET_AUTO_FEED` with `on = !lit`. Works on a
  DIMMED chip too (no shape banked yet) — a toggle is a standing order for shapes still to come.
- A seventh right-click site in `controls.ts`, tagged a NEW class **`R190-G: CONTROL`** (a card control
  owns the click; nothing under it acts), counted by `controls.rightClickSurfaces.test.ts` (6 → 7).
  It sits after the modal / castle-panel / draft-plate guards and in the card-buttons slot, ABOVE every
  world pick. ⚠ **A HAND put-back wins** (R190-G: the put-backs work over every opaque surface): with a
  Ra aim, a scorch aim or a held tower in hand, the right-click puts it back and toggles nothing.
- **The lit toggle**: a toggled chip draws a bright accent RING outside the chip plus a small filled
  "AUTO" pip in its top-right corner; an untoggled chip is unchanged. Readable on a dimmed chip.
  Drawn from the SAME laid-out slot the hit test reads (`autoFeed` carried on the slot), never a
  second layout. The slot field is `autoFeed?: boolean` — `undefined` = not toggleable (FIX, SCRAP, a
  race tower's chip), `true / false` = the tower's live bit.

### 2.7 Bots (⚠ MINE, Q5)

Bots do not use it. No bot feeds a goblin tower today; giving them auto-build is a bot-intelligence
change, and the `s193/bots` branch is open in parallel with its own file set.

## 3 · Tests owed

1. REACH through the real `runHostTick`: a built + ignited goblin tower, Square toggled, bank holds
   Squares → a shield goblin appears; kill one → the slot refills from the bank on the next poll.
2. Controls REACH: a right-click at a chip's centre, through the real `Controls.onDown` and the REAL
   `CharacterSheet` after a real `sync`, dispatches `SET_AUTO_FEED`; the chip slot is hit-tested.
3. Negatives: empty bank, full tower, toggle off, someone else's tower (refused intent AND the runner
   never feeds a tower of another seat), race tower refused, benched seat waits.
4. Round-robin order; determinism (same seed → same `hashWorldStateFull` over two runs; the worker
   INIT round-trip preserves mask + cursor).
5. Four sites: factory / serialize / wire trim / wide-hash contribution test for both fields.
6. Mutation-tested guard: a mechanical guard that FAILS when the runner stops dispatching `FEED_TOWER`
   (i.e. bypasses the gates) — verified by applying the mutation and watching it go red.

## 4 · Council ledger

(filled in below after the Grok + Gemini round)
