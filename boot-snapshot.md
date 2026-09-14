# Boot Snapshot (auto-generated at handoff)
Generated: 2026-09-14 | Session: S176 | Commit: f75c8ed | LIVE + verified 4/4 | e2e:gating 65 passed

## Next Steps

1. ⛔ **ASK HIM FOR THE ~6 BUGS FIRST.** He is holding a list and deliberately did not send it —
   *"I won't tell you, because you're gonna start researching them and using more tokens from the
   weekly."* That list is the session. Do not pick anything else before hearing it.
2. **HE HAS NOT PLAYED ANY OF THIS.** Everything S176 shipped landed after his last playtest, and
   S175's P9/P10 were already unplayed before that. Expect corrections on, in likelihood order:
   - **the WALK row is a QUADRUPED** — idle/attack/die are upright biped, the walk clip generates
     him running on all fours (plus yellow speckle debris in the source). It is HIS art and it is
     dynamic, so it shipped. Re-rolling walk framed upright costs ~$3.10 **and** would drop cellW
     from 380 toward 256 — which buys **32 frames** per state inside the same texture ceiling.
   - **the attack has no drawn lightning** — deliberate. The engine emits one ARC_FLASH per
     CREATURE_ATTACK; baking bolts in halved him. One-line revert is at the spec's `attack._why`.
   - **the brake is 4.9x, he asked for 2x** (S175, still unplayed). Options at `CREATURE_BRAKE_DAMPING`.
3. **THE 5 WAIVED ATLASES** need regenerated art — only he can make it.
   `assets-source/atlas-size-waivers.json`; delete a line when its art is redone.
4. **GENERAL / GOBLIN TOWER ART** — his to generate, then ONE `markTowerCover` call each.
5. R173-B (RULED S173, never implemented) · B8 powers · Pharaoh stances + Ra · Vlad life-sap ·
   NONET stages (8 questions open).

## Blockers

- ⛔ Art only he can make: the 5 waived sheets, the general/goblin tower buildings, and a re-rolled
  upright walk clip if he wants the Voltkin coherent between stances.
- NONET stages: an in-match ladder needs a wire field ⇒ PROTOCOL 46 → 47; arcade-only costs no bump.

## Pending Backlog

(no unchecked items — the forward plan is prose sections in BACKLOG.md § QUEUED)

## Recent Reflexion (last 2 sessions)

## S176 (2026-09-14) — two priorities, $0.00 of art: the Voltkin finally drawn from a sheet instead
of a procedural puppet under two stills, at 20 frames a state (his ruling), and his TV given the
emergence and destruction SEQUENCES it never had. Every A.0 agent died to the spend limit and every
finding came from a hand-run. Also found: a CI failure four commits old the previous handoff called green.

- P0 #the-hunt-returned-nothing-and-the-rule-held — all four A.0 lanes died to the spend limit and
  were re-run BY HAND rather than filed as "the sweep produced nothing".
- P1 #the-validator-passed-the-clip-it-could-not-see — check-clip tests bar PRESENCE, never WIDTH.
- P1b #the-bolts-were-counted-as-the-body — normaliseStateScale sees a bolt as subject, so the
  discharge window packed him at half size.
- P1c #a-cell-is-not-a-character — spriteBoxOf reported the padded cell; the bar would have floated.
- P2 #it-was-not-stuck-it-was-the-only-frame — framesPerState:1 held 60 ticks. Nothing regressed.
- P2b #the-art-answered-the-ruling — tv-1-intact is ALREADY broken-but-undamaged.
- SESSION #the-gate-was-read-at-boot-and-called-green-at-close — CI e2e red since S175.
- SESSION #i-walked-into-the-trap-this-repo-names-in-bold — `| tail` ate an exit code again.

## S175 (2026-09-13/14) — ten priorities from a batch PDR that Phase A.0 rewrote before a line was
typed. Six self-inflicted faults, every one caught by looking rather than by a gate.

## Muscle memory (auto) [Vigil]

- Traces: `C:\Users\onesh\.claude\traces\2026-09-14\The-Spark.jsonl`
- Last decisions:
  - **A hunt that returns nothing is not a completed hunt.** 4/4 agent lanes died to the spend
    limit; every PDR fact came from re-running them by hand. Third session to meet this rule.
  - **Name the property a gate measures before trusting its verdict.** check-clip PASSES a clip
    whose bars ramp, because it only ever tested whether bars were PRESENT.
  - **Turn an aesthetic argument into an arithmetic one.** Body-vs-bolt height separation decided
    the attack window; "which looks more like an attack" never would have.
  - **Look at the picture.** The owner's "broken but not damaged" ruling was settled by opening
    six PNGs, and needed no code at all.
  - **A gate read at BOOT measures the previous session.** Re-read every gate at CLOSE.
  - ⛔ **Read exit codes from a captured `$?`** — `| tail` ate one again this session.
- CLAUDE_LOOP: **closed** (no agentic loop; the one fan-out returned 0/4 and was hand-run)
- Shared bundle checklist:
  - [x] boot-snapshot.md (this file)
  - [x] latest HANDOFF: `HANDOFF_S176_2026-09-14.md`
  - [x] LOCKED_DECISIONS.md (repo root)
  - [x] traces jsonl path above
