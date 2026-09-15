# S178 — OPEN QUESTIONS, in plain language

Rewritten S178 after the owner asked for these "in a more expanded but simple terms so I can
understand them." No jargon, no code names where a plain word works.

**Already answered by him this session** — recorded at the bottom, not repeated as questions.

---

## Q1 · VLAD vs THE WARLORD — the real problem is the ABILITIES, not the stats

**What you saw:** the Warlord barely scratched Vlad before dying.

**What I measured** (a real duel, run in the game's own engine, 12 times):

```
6.1 seconds.  Vlad wins every single time.
Vlad   takes 66% damage  →  ends at 46% damage   (he heals 20% back)
Warlord takes 80% damage →  dead
```

So the Warlord *did* hurt him — about two thirds — and then **Vlad healed it back**, which is why
his bar looked barely touched. Your read of the bar was right.

**Why it is unfair, in one line each:**

- **Vlad heals himself 3 times, 20% each.** That is +60% free health on top of his pool. Nothing is
  drained from anyone — it is a pure heal.
- **The Warlord's "rage" only starts when he drops below 25% health.** But Vlad hits so hard that
  the Warlord jumps from 60% straight to 20% in one blow — **he skips over his own rage window and
  dies.** He has an ability that, against Vlad, basically never happens.

**THE QUESTION — pick one (or say something else):**

- **(a)** Give the Warlord's rage a bigger window so it can actually fire (trigger at 50% instead of 25%).
- **(b)** Cut Vlad's healing (2 uses instead of 3, or 10% instead of 20%).
- **(c)** Give the Warlord his own survival ability so both bosses have one that matters.
- **(d)** Leave it — Vlad is meant to be the scary one.

⚠ Whatever you pick, **every boss should get the same audit.** Right now only two of the six have an
ability that changes a fight at all.

---

## Q5 · WHAT A "FALLOFF CURVE" IS

The Voltkin's lightning jumps from target to target — up to 6 things per bolt. **"Falloff" just means
each jump is weaker than the last.** The "curve" is how fast it weakens.

I used **halving**:

```
1st thing hit: 33 damage
2nd:           16
3rd:            8
4th:            4
5th:            2
6th:            1
```

Before, all six took the full 33 — which is why one bolt wiped a whole tower.

**THE QUESTION:** is halving right, or should it fade slower? A slower fade would be e.g.
`33 → 24 → 18 → 13 → 10 → 7`, which still kills a lot. Halving means the bolt really only *hurts*
the first two or three things and tickles the rest.

*(One dial, one number. Say "halving is fine" or "make it slower" and it is a one-line change.)*

---

## Q9 · WHAT "PRIMITIVE_MAX_HP 1000 → 70" MEANS

A **primitive** is one placed shape — a single square, circle, triangle you put on the board.

It used to have **1000 health**, on a scale nothing else in the game used. In S177 you ruled
everything onto one scale, so a shape became **70** — which is your "six goblin swings kill a shape"
(a goblin swing is 12; six of them is 72).

**Here is the problem, and it is a multiplayer one.** The game only sends a shape's health over the
network *when it is damaged*. If it is undamaged, nothing is sent and each player's game fills in the
number from its own copy of the code.

So: if your brother has the game open in an old browser tab from before that change, **his tab still
thinks a full-health shape is 1000 while yours says 70.** His screen would draw your healthy towers
as wrecked ruins. The game has a version check that is supposed to refuse old tabs — but this change
didn't bump the version number, so **old tabs are still let in.**

**THE QUESTION:** shall I bump the version number so old tabs are refused outright? The only cost is
that anyone with a stale tab open has to refresh. **I recommend yes.**

---

## Q11 · THE "HURT" STATE

You asked in S177 whether creatures have a "damaged/hurt" look. They don't — a creature is only ever
*spawning, walking, attacking, or dying*.

**Here's the twist I found:** you already ruled (R152) that we must **not** add a fifth state to that
list — and the game has already solved this exact thing twice without one, for **stunned** and for
**poopy**. Both work the same simple way: stamp a "hurt until tick N" marker on the creature, and the
drawing code flashes it while the marker is live. It expires by itself, costs no network change, and
adds no new state.

**THE QUESTION:** do you want a hurt flash at all? If yes, it's a small piece of work using the
pattern that already exists. *(Not started — next session.)*

---

## Q7 · THE INVISIBLE WALL — how far in from the edge?

The game never actually had a boundary; creatures could walk off the screen forever. That's fixed —
there's now a wall **40 pixels in from the edge**.

40 is my number, not yours. Too small and a creature is half off-screen and unclickable; too big and
you lose playable ground.

**THE QUESTION:** is 40 fine, or do you want it tighter/looser? *(One constant.)*

**AND A SECOND, SEPARATE ONE:** when an archer gets backed up against that wall, it can't keep its
shooting distance any more — so **it ends up dragged into melee**. The alternative is that it
*slides sideways along the wall* to keep its range. Which do you want? You've ruled on archer
standoff behaviour twice before, so I didn't pick for you.

---

## Q8 · SHOULD A FULL STINK TOWER HIT HARDER, OR JUST WIDER?

When a stink tower dies it explodes. Its explosion was on the old broken scale — it was one-shotting
shapes. Fixed: it now deals your own ruled number (1 attack / 4 pierce).

Right now, **a tower full of bags makes a BIGGER explosion (wider radius), but not a STRONGER one.**

**THE QUESTION:** should a full tower also hit *harder*, not just wider? If yes I need a number from
you in attack/pierce terms, because "harder" has to be on the ladder like everything else.

---

## Q10 · THE FAKE DAMAGE NUMBERS WHEN YOU SCRAP

When you press SCRAP on your own building, you get **your shapes refunded** — but the game pops red
damage numbers over them as if they'd been destroyed. Nine shapes = nine red "70"s over your own base
for something that cost you nothing. (Same when a tier-9 boss is released and when a lightning hub
self-destructs.)

I did not guess at a fix. The game currently can't tell "destroyed by an enemy" from "dismantled on
purpose" — they go through the same code. Telling them apart means threading a reason through it,
which touches the network layer, so it's your call whether that's worth it.

**THE QUESTION:** worth fixing, or live with it? *(Not started — next session.)*

---

## Q12 · CHARACTER SHEETS — **ANSWERED: not this session.**

Carried to next session. When we do it, I need two things from you:
1. **which things get a sheet first** — creatures, towers, structures, castles?
2. **may the enemy's sheet show their LIVE health?** If yes it may need new network data (and a
   version bump). If "just their stats, not live health", it's much cheaper.

---

# ✅ RULINGS YOU GAVE THIS SESSION — recorded, not questions

**THE SPINDLE — "you should just unwire the mechanic that pulls shapes to it."**
✅ **Already exactly what shipped.** The spinning spiral you see is drawn by a completely separate
piece of code (`bondVisualRenderer` → `drawSpindle`) that never touched the pulling. I only removed
the pull. Verified: no renderer references the pull functions at all. **The spiral still spins.**

**THE TV ART — the stills are by design; what's missing is the video BETWEEN states.**
✅ Corrected my finding. Not "four rows are broken stills" — the stills ARE the states, from your own
images. What's missing is **two transition videos**:
1. **The TV appearing** — electricity in the background, the TV appears/breaks open, **Voltkin climbs
   out**, then he stands idle beside it. *(You have a still of him climbing out — we wire that in.)*
2. **Damaged → destroyed** — the explosion.

No video needed between intact→damaged (that's just a state swap). Estimated ~€20. **Not started —
next session**, per your instruction that unstarted work carries forward.

**CHARACTER SHEETS — not this session.** ✅

---

# ⚠ THINGS ALREADY SHIPPED THAT YOU SHOULD KNOW

1. **Clicking a whole building has no automated test** — it's a pure add-on that can't break any
   click that already worked, but the geometry rests on my review, not a test.
2. **Helga and the hunter** still use the old unbounded movement code. Neither can actually reach an
   edge today (she's leashed to her hub; he's bounded by his own AI), so it's harmless — but it's
   recorded so nobody "finishes the job" without thinking.

# ⛔ FIVE SEARCHES WERE NEVER RUN

The overnight agent budget ran out and killed 15 of 20 search lanes. Eleven I re-ran by hand. **Five
were never run at all** and still owe an answer: determinism, the four-sites check, creature
lifecycle, the network protocol, and host-migration. Named here rather than quietly dropped.
