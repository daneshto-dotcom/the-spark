# BRANCH 2 — `s182/mp-identity`

Four items. Two are multiplayer defects a stranger would hit in their first minute; two are card polish.

---

## ITEM 1 ⛔⛔ — "WHO THE FUCK IS PLAYER ONE" — **RE-RESEARCH REQUIRED FIRST**

> *"When you do a quick match, the host, player one, player two, is very inconsistent. I started the
> game and I'm player one, and then he joins in — he's player one. And then I'm player two. Sometimes
> it gives me player one, sometimes it doesn't."*

### ⛔ READ THIS BEFORE YOU START. THE OBVIOUS ANSWER IS NOT HIS BUG.

A research pass found a real defect (below) and presented it to the owner. **He rejected it as the
explanation**, and he was right to:

> *"B2 is inherently wrong because it's not when you hit quick match at the same moment. It's
> literally like a minute apart. I put quick match, I go into the server. My brother comes on like
> three minutes later, and he goes into the server. For him it shows that he's P1. For me it shows
> that I'm P1."*

**So your FIRST job is to find the mechanism for HIS repro: a host established, a joiner arriving
1–3 minutes later, and both peers showing P1.** Do not start from the finding below and try to make
it fit. Reproduce his sequence in the lobby state machine and follow the data.

### The finding that exists (real, but probably a SECOND bug)

Verified in code and confirmed by an adversarial pass — worth fixing either way:

- `src/net/quickmatch.ts:97-105` — two seekers can both self-promote (`qmPromoteDelayMs` is a
  2000–3500 ms jitter, `ANNOUNCE_INTERVAL_MS` is 2000). `decideQuickmatch` returns `{kind:'join'}`
  for whichever code sorts LARGER → demote-then-join.
- `quickmatch.ts:223-227` `tick()` calls `teardownHost()` then `joinCode(code)`.
- `main.ts:1682-1686` `joinCode` calls `lobbyScreen.applyQuickmatchJoining(code)`.
- `render/lobbyScreen.ts:1034-1038` dispatches `{type:'JOIN_ATTEMPT'}`.
- ⛔ `render/lobbyStateMachine.ts:186,195` — `case 'JOIN_ATTEMPT': if (state.mode !== 'select') return state;`
  At demote time `mode` is `'hosting'`. **THE TRANSITION IS SILENTLY SWALLOWED, SAME-REF.**

The guard is not itself wrong — S65 P2 added it because the dimmed join button stays click-reachable
while hosting, and `lobbyStateMachine.test.ts:187` pins it. **S87 P4 reused that user-input event for
a machine-driven demote and walked into it.**

Consequence: `lobbyStateMachine.ts:399` — `isYou: state.mode === 'hosting' && i === 0`. A stranded
peer still resolves seat 0 as itself and prints **"P1 HOST"**.

### ⭐ THE STRUCTURAL LEAD THAT PROBABLY EXPLAINS HIS ACTUAL REPRO

`lobbyView` has **two branches**, and they derive the label from different things:

- `presenceRoster !== null` → cell index **is** the host-assigned synced seat (`bySeat.get(i)`) — correct.
- `presenceRoster === null` → the same label string comes from **LOCAL MODE**
  (`state.mode === 'hosting' && i === 0`) and knows nothing about any peer.

**So any path that leaves a peer in the local branch while it is in fact in someone else's room
prints P1.** Find every such path — not just the demote. Ask specifically: *for a joiner arriving
three minutes later, when does `presenceRoster` first become non-null, and what does it show before
then?*

### What is already SOUND — do not "fix" it

- Seat assignment: `net/lobbyRoster.ts:60-87` `reconcileLobbySeats` holds a persistent peerId→seat
  Map, host always seat 0, lowest free seat to each new peer. No `Math.random`, no `Date`, no
  Map-iteration ordering decision.
- In-game identity is already one synced id. `applyStartGame` does NOT write `localPlayerId`; the
  joiner adopts its seat from the authoritative roster at `net/clientHandlers.ts:394-396`. The
  leaderboard and win banner are consistent across peers. **THE DEFECT IS LOBBY-ONLY.**

### The fix shape

One authoritative transition for the demote (a dedicated `QM_JOIN_START` event whose arm is the body
`JOIN_ATTEMPT` produces on success), **and a UI that never claims a seat it was not told.** The
count-based fallback asserting `isYou` from local mode is the thing to kill.

⚠ **Do not tighten `lobbyStateMachine.ts:266`** (the `PRESENCE` arm) — it is what eventually heals
the display today.

**No `PROTOCOL_VERSION` bump.** Render-layer only.

**Tests owed:** a lobby-state test for the owner's ACTUAL repro (host established, joiner 3 min
later, assert exactly one peer claims seat 0); a source-text tripwire that no label is derived from
`state.mode === 'hosting'`; and keep `lobbyStateMachine.test.ts:187` green.

---

## ITEM 2 — PLAYER 2 SOMETIMES CANNOT OPEN A STAT SHEET

> *"Sometimes player two can't click and see the stat sheets, either of his own characters or of the
> enemies. That's an unfinished pathway or a bug."*

Repro verdict: **PARTIAL** — the structural defect is real and confirmed by reading; the
"sometimes" has not been fully explained.

**The structural defect.** `src/input/controls.ts:976` opens
`if (player?.kind === 'Idle' && player.carriedPotatoId === undefined) {` and the card's only open
gesture sits **inside** that block at `:1076` (`if (this.handleSheetSelect())`).

**Opening a card mutates nothing** — it is render-only selection. Gating it on the local player being
Idle and empty-handed means a player who is carrying, dragging or otherwise not-Idle cannot open any
card at all.

**The fix:** move `if (this.handleSheetSelect()) return;` **out** of the Idle arm and place it
immediately after that block closes — still inside `if (e.button === 0)` and still **last** of every
world pick. Add a comment stating why the card is exempt from the Idle gate.

⛔ **Then go further and find the asymmetry.** The fix above is player-agnostic; his complaint is
specifically about **player 2**. Before you close this item, check:
- every gate in the click→sheet path for anything keyed on `isHost`, `myPlayerId`, ownership or colour;
- **whether the data is even on the peer** — enumerate every field the sheet model reads and check
  each against what `save.ts` serializes and what `trimMirrorCreature` **strips**. A sheet needing a
  stripped field would fail only on the joiner, which is exactly his report.

**Tests owed:** a controls test that a non-Idle local player can still open a card; and a test per
sheet-model field that it survives the mirror trim.

---

## ITEM 3 — PORTRAITS STILL ON PLACEHOLDERS

**Five** placeholder cases, not three, and they split into two different problems. `characterSheet.ts:612`
is `word = castleFrame ? 'KEEP' : defenderFrame ? kind : '…'` — the fall-through draws **a literal
ellipsis**, byte-identical to the Voltkin TV defect S181 called *"an empty box with three dots"*.

**ART EXISTS — pure wiring:**
- **The landed stink bag.** Add `portraitTexture(): Texture | null { return this.frames?.[0] ?? null }`
  to `stinkCloudRenderer.ts` (copy the `stinkTowerRenderer.ts:83` docblock shape). Widen
  `characterSheetModel.ts:154` `namedBuildingFrame.building` to include `'stinkBag'` and emit it at
  `:1070`. Wire at `main.ts:1032`.
- **The Voltkin creature** (not the TV — the TV is out of scope this session, the owner is reworking it).

**NO ART EXISTS — the honest answer is the codex emblem, not an ellipsis:**
- **Helga's HUB.** ⚠ The carry-forward said "art exists but unwired" — **that is wrong.**
  `helga-atlas.png` is Helga *the character* and she is **already wired** (`main.ts:1051` →
  `princessRenderer.portraitTexture`). The hub **building** has no art.
- Laser turret, pentagram, goblin tower, lightning hub — procedural Graphics puppets.
  *(The lightning hub is getting art on branch 5. Leave its portrait alone — that branch owns it.)*

⛔ **THE FOUR-SITES HAZARD IN ITS USUAL SHAPE: five placeholder cases, one lane, and the project's
most repeated defect is fixing SOME of them.** `characterSheetModel.ts:564-565`'s own comment says
*"a third would be one line"* — enumerate all five and assert each.

---

## ITEM 4 — THE CASTLE'S FREE UNIT IS MISLABELLED

Context, because the owner half-remembers this one: a prior session told him the demon he saw walking
out of his castle was **not** the SOUL button — his castle emits one free unit every 30 s on its own,
and for demons that unit is an **imp**; the SOUL tower makes a **soul eater**. Both were working
correctly. **There is no emission bug** — verified for all six races, host and joiner.

What IS wrong is the adjacent copy: the card shows a generic label instead of that race's actual unit.

> ⛔ **GATE:** does the castle unit get a **per-race name** on its card, or stay generic
> "CASTLE UNIT"? R134 (`SPARK_RACES_SPEC.md:118-124`) already supplies six candidate names. **If the
> owner has not answered, fix only what is unambiguously wrong and report the naming question.**

---

## GATES

`typecheck` · `vitest` · `build` · **`e2e:gating` — required, items 1–3 move UI geometry and input.**

## FILE BOUNDARY

**Yours:** `render/lobbyStateMachine.ts` · `render/lobbyScreen.ts` · `render/seatRack.ts` ·
`net/quickmatch.ts` · `net/lobbyRoster.ts` · `input/controls.ts` · `render/characterSheet.ts` ·
`render/characterSheetModel.ts` · `render/stinkCloudRenderer.ts` · `render/codexPresentation.ts`

⚠ `src/main.ts` is shared with branches 1 and 5 — you own the **portrait wiring lines** (`:1032`,
`:1051`). Append only; never reorder imports.
⛔ **Do NOT touch the lightning hub's portrait** — branch 5 owns it.

## REPORT BACK

**Above all: what actually causes the owner's 3-minutes-apart P1 collision.** If you cannot find it,
say so plainly and list what you ruled out — a false "fixed" here is worse than an open item.
