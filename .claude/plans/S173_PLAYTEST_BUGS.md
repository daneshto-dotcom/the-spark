# S173 — OWNER PLAYTEST, live 2-player over the internet (Romania)

**STATUS: CAPTURED — NOT YET TRIAGED AGAINST THE CODE.** Nine items, recorded verbatim the moment
he reported them so nothing is lost to a context window or a usage limit. Line-level diagnosis is
owed on each; where I already know something from this session's work it is marked ⭐.

> Context, in his words: *"I just played the game with a friend of Romania across the Internet. And
> we found a few bugs."*

---

## B1 — THE MULTIPLAYER LOBBY SHOWS ONLY PLAYER ONE'S BACKGROUND

> *"the multiplayer lobby only shows player one background. This doesn't show player two or any
> other player's background. However many people are in the lobby has to split the background into
> the zones or quadrants just like the game has. So if there's just two players, you will have
> player one's side and player two's side with his class, whatever background he chose. And then if
> there's more joining, then it splits into four. Right? Up to four."*

The lobby backdrop must be **partitioned by seat count**, the same way the BOARD already is: 2
players ⇒ two halves; 3–4 ⇒ quadrants. Each region shows **that seat's own chosen race backdrop**.

⭐ The per-race backdrops exist and shipped in S165 (twelve of them, portrait + landscape per race,
plus a settings toggle) — so this is a LOBBY composition problem, not new art.

## B2 — "UP TO SIX" IS A LIE; THE GAME IS UP TO FOUR

> *"it still says in the home page or whatever that it's up to six, but it's only up to four. Yes,
> we have six colors. But... make sure that's consistent and coherent with what's supposed to be."*

Six **colours/races** exist; the match is **four seats**. Find every player-facing claim of six and
make it say what the game does. ⚠ Do NOT "fix" this by widening the game to six — he is asking for
COHERENCE, and the seat count is a board-geometry decision (quadrants), not a copy edit.

## B3 — ONLY THE CASTLE HAS A BUILDING HP BAR, AND ONLY AFTER IT IS HIT  ⭐ TOUCHES P1

> *"the Castle HP, it shows like a green HP bar, right? But only once it's attacked. All the other
> buildings still don't have HP bars, even though I thought we've already done that. Let's make sure
> all the buildings have an HP bar just like the castle has, a green one, exactly the same. While
> spawn and creatures have the red HP bars."*

**THE COLOUR IS A RULING, AND IT CHANGES WHAT P1 SHIPPED THIS SESSION:**
- **BUILDINGS → GREEN**, identical to the castle's bar.
- **CREATURES / SPAWN → RED**, as they are.

⭐ P1 this session gave every tower a connector-derived bar but drew it in `FILL_TINT = 0xe0342f`
(red) — so it is the right bar in the wrong colour. Needs a building/creature colour split.

⭐ AND THE "ONLY ONCE IT'S ATTACKED" HALF IS A KNOWN, ALREADY-DOCUMENTED DEFECT. `healthBar.ts`'s
own docblock says it: *"The castle bar (`gathererRenderer.drawKeep`) still carries fault 1 — noted,
not touched here."* Fault 1 is `if (remaining >= hpPoints) return; // undamaged: no clutter` — the
hide-while-full behaviour the owner rejected for creatures in S171 and is now rejecting again for
the castle. It was written down and left. This is the second time he has reported it.

⚠ OPEN QUESTION FOR HIM: does "all the buildings" mean the tower bar should now be GREEN *and*
always-visible — i.e. does a full-health tower show a full green bar? His castle sentence implies
yes (always visible). Assume YES unless corrected; it matches R171-E for creatures.

## B4 — THE SCARAB: WHITE EDGES, AND IT INFLATES WHEN IT ATTACKS  ⭐ TOUCHES P2

> *"the scarab video loop looks retarded. You still have the white edges. Just cut it out shorter.
> Like, you don't have to cut the whole square of how it looks. There's the scarab, there's black
> around it, and then the edges, there's still those white corners that we still didn't get rid of.
> Just get rid of it once and for all. Come on. And also it still gets like inflated and weird when
> it attacks. So it moves fine, but when it moves it has the white edges. And when it attacks, it
> like gets two times bigger. We'll probably have to regenerate it if you can't make it right."*

TWO SEPARATE DEFECTS IN ONE ASSET, and this session already measured both:
- **The white fringe** — `check:atlas` check 3/3 reports `t3-mummies-scarab` with the largest
  near-white pocket of any unit atlas (47 px). It is a MATTE problem; the guard's own advice is to
  re-matte with a tighter edge rather than re-roll.
- **The attack row inflates** — `check:atlas` check 2/2 reports
  `idle=1.22w(WIDE) walk=0.73w(WIDE)`, a ~1.7× spread across rows.
  ⛔ **The scarab is the ONE atlas this session proved a repack cannot fix**: its PNG postdates the
  S171 packer fix (10:41 vs 10:39 on 2026-09-10) and still fails, and `normaliseStateScale`
  equalises HEIGHT only (`_subject_h`), so a WIDTH divergence survives it.
  ⇒ **His own conclusion is the correct one: the scarab clip needs REGENERATING.**

## B5 — ORCS, AFTER WAVE 3, THE CASTLE SPAWNS GOBLIN MELEES

> *"when you're playing as orcs, after wave three, the castle starts spawning the original shitty
> little goblin melees ... we already have the right orc spawn that the castle is supposed to spawn,
> the creature type, the little orc warriors. And then starting with wave three it's like taking us
> back thirty sessions when we had those goblin, like, the little tiny green. That's not correct. It
> should only generate the orcs."*

A REGRESSION with a precise trigger: **wave 3**, orcs, castle-spawned units revert to `goblinMelee`
instead of the race unit. Suspect a wave/tier ladder that falls through to a default creature type
past some index. This is the highest-value diagnosis of the nine because it is a wrong-output bug
with an exact reproduction, and it makes the race identity vanish mid-match.

## B6 — THE LASER TOWER SHOOTS TOO SLOWLY

> *"The laser tower needs to shoot twice as fast. So it needs to load and shoot like twice faster,
> because this is not good enough. It's like a tier six or seven. It does a lot of damage, but it
> needs a lot more speed. So two times faster."*

**A RULING, and it is a number: halve the laser turret's fire cadence.** Straightforward, but it
belongs to the untouched attack-speed dimension — record the constant as HIS, with the quote.

## B7 — DAMAGE NUMBERS MUST STACK, ONE PER HIT

> *"we have the damage showing in numbers, right? But it doesn't show every attack ... it should be
> stackable. You know what I mean? Like in MapleStory — if there's six enemies attacking a boss,
> it's only showing one of the damages every time. It doesn't show damage over it. But any new
> damage that's hitting the same target should just layer above. Like, boom boom boom boom. Damage,
> damage, damage. It should be as many damages as the unit receives. That's as much as it shows. It
> could show the actual total damage received by unit."*

⭐ S172 shipped floating damage numbers derived from `ehp` DELTAS between observations. That design
**coalesces by construction**: six simultaneous attackers produce ONE delta per sampling window, so
six hits render as one number. That is exactly what he is describing, and it is a consequence of the
derivation rather than a bug in the drawing.
⇒ Fixing it properly means either per-hit events (which the S171 research showed are lost ~5/6 of
the time on a peer — the reason the delta design was chosen) or a per-victim STACK that renders the
observed delta as a column of layered numbers. **Do not promise the MapleStory look before
re-reading that research** — `.claude/plans/S171_HUD_RESEARCH.md` §2 is where the constraint lives.

## B8 — POWERS TAKE DAMAGE SILENTLY

> *"powers don't show damage, but they should. You should also do this damage output — the red with
> the white outline font — on powers as well, not just on enemies. Not just on spawn."*

The floating-number treatment must extend beyond creatures to **powers** (structures/primitives).
⭐ The S171 research already flagged the coverage hole: the design *"covers 3 of `damageEntity`'s 5
arms — bonds and primitives are skipped."* This is that hole, reported from play.

## B9 — VOLTKIN REWORK — EXPLICITLY DEFERRED BY HIM

> *"obviously, rework Volt because he looks like shit, but we have that on priority down the line."*

Not for now, by his own scheduling. ⭐ Consistent with the standing memory note (new art supplied;
no death animation; no build cinematic).

---

## TRIAGE — my recommendation, for him to overrule

| | item | size | note |
|---|---|---|---|
| 1 | **B5** orcs→goblins after wave 3 | small–med | wrong output, exact repro, destroys race identity |
| 2 | **B3** building bars green + always-on | small | lands on P1, already half-built this session |
| 3 | **B6** laser tower ×2 fire rate | tiny | a number he ruled |
| 4 | **B2** "up to six" → four | tiny | copy + a consistency sweep |
| 5 | **B7/B8** damage stacking + powers | **large** | fights the S172 delta design; research first |
| 6 | **B1** lobby backdrop split | medium | composition, art already exists |
| 7 | **B4** scarab | art | needs a REGENERATED clip — measured, not guessed |
| 8 | **B9** Voltkin | deferred by him | |
