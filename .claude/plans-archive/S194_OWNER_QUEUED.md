# S194 — OWNER-QUEUED PRIORITIES (recorded S193, 2026-10-02, verbatim) — NEXT SESSION, NOT S193

Owner: *"We'll have to tweak that next session, okay? So log that as one of the priorities … We're not gonna do it now."*

## Q1 · Rework the building aura (the "background" around a tower) — visuals, own worktree
*"I really like the little pixie graphics you made when you just built the towers and it shows like they're they're
connections like and those little fireflies around … before they disappear and the tower is built. But then we did not
rework yet the … tower background. So you know that like for example the zombies, the green little bubbly … goo
background that's around the tower supposedly. That kind of still looks like shit. And it's not really around the tower,
it's behind it."*
→ The S192 V03 aura (`spawnerZoneRenderer.ts`, the owner-tinted ground pool + embers) and the race-ground decal read as a
flat disc BEHIND the tower, not around it. Rework so it wraps the footprint (ground-level ring/halo at the base, motes
rising around the silhouette), per race. Keep what he likes: the build-time V20 connection sparkle + fireflies.

## Q2 · "Anthropic tax" — entropy that rises with structure complexity — RESEARCH first, own worktree
*"the idea of a … tax is the more complex your … structure is. The more chances it has to be destroyed or to just break
down. So I see some players, you know, especially AI, they just build like really small structures with many shapes and
many connectors. And it's like super hard to destroy them because they have like what, twenty thousand HP from a hundred
forty-five connectors and sixty-five shapes … or like here, fifty-four connectors, twenty-four shapes is three thousand one
hundred … with higher complexity of a structure, then more likely … some of the connectors to disintegrate … or maybe whole
parts of it … based on complexity … I have like freaking twenty units trying to destroy this twenty thousand HP structure.
And they can't even destroy one connector … with raised complexity, there's raised entropy. That way … players will have to
decide, oh, do I keep … building onto this tower to increase his … HP … Or do I … build more structures … every connection
you make something will … break and the … likelihood of it to break … raises with the complexity of the structure."*
(He referenced the same idea in his Project Genesis.)
→ Research: the component pool is `structureDefenceFifths(n)` over the whole component (welded lattices: 145 connectors →
~20 000); damage banks structure-wide and a sever costs one connector's re-formed pool. Design a DETERMINISTIC entropy rule
(seeded by match seed + structure + tick, no Math.random): a per-FIGHT (or per-tick-window) chance that a connector decays,
rising with complexity (connector count / shapes / weld count); and/or diminishing pool returns past a size. Bring 2–3
options with arithmetic and his two examples (145c/65s ≈ 20 000; 54c/24s ≈ 3 100) to him; build after he picks. Shared
rule → protocol bump.

## Q3 · UPGRADE EVERY CLICKABLE SURFACE AND THE HOME SCREEN — own worktree (S193 close, verbatim)
*"now that we're already working on the visuals aspect … let's upgrade all the buttons too. So like the tier buttons with the
towers, and the castle tower … buttons where you upgrade the castle stats … The tower buttons that we click on the shapes to build
more units. The goblin tower. Everything. Let's … look at all the clickable surfaces … within towers, characters, stuff like that.
And … UIs, UX, and see how we can upgrade it … make it like pop out more, make it … little graphics … more interesting, more
awesome looking. Also in the home screen … can be improved upon too. So that will be next session too in its own … work tree.
Now that we're using a upgraded Pixie … visual, mechanics and … graphics, then we might as well do that too."*

## Q4 · (he will tell us) — "one more thing … I don't remember right now … I'll tell you."
