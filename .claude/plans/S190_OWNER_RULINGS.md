# S190 — OWNER RULINGS (2026-09-24). Folded into SPARK_CANON.md with the train that builds each one.

⛔ These are ANSWERED. Do not re-ask any of them. Quotes are his words (voice transcript, lightly trimmed).

| id | question | ruling | when built |
|---|---|---|---|
| R190-A | What happened at the wave-5 disconnect? | **Both players saw CONNECTION LOST, both were still in the game, and it was "lagging very hard right before".** Before wave 5 ended. → the hunt's lag → transport drop → broken auto-reconnect path (not the double-Escape, not a background tab). | s189/net, this session |
| R190-B | Deploys #1/#2 both say protocol 50 | *"It's not a question."* → nothing to do; train B's 51 refuses both old builds. CLOSED. | — |
| R190-C | Castle regen after HP upgrades | % of the **upgraded total** (*"your regen is based on the current health … upgraded total"*). Matches the PDR. | s189/units, this session |
| R190-D | "Triple all stats" / "×6" | **Every stat is multiplied from the base**: *"a bat 1/1/1/1 → 6/6/6/6"*. The bite multiple is whatever the ladder gives (elite piranha ×4, swarm ×11) — correct, not a question. | as built |
| R190-E | Does a drafted ATK pick buff boss skills / Helga? | **No.** It buffs physical melee/ranged hits only. *"The Ra column is considered a MAGIC attack."* | as built |
| R190-F | Footer arrow in the 10 px seam on the two-card tiers | **B — keep as is**: *"if you can still see the arrow … you should be able to use it."* | as built (s188/input-layer pins it) |
| R190-G | Right-click raids through the footer cards / unit card | *"Yeah, we'll keep seven as is for your recommendation"* — read as: do the recommendation → **opaque panels swallow right-clicks too**. ⚠ Reading flagged to him; reverse on his word. | input-layer follow-up after deploy #3 |
| R190-H | Ra strike drawn under units | **Draw it ON TOP of units.** | render follow-up after ra-vfx is on master |
| R190-I | A same-tick heal hidden inside a net damage number | **Show every hit and every heal separately, in different colours, stacking** (*"it shows every single hit or heal … it looks sick"*). | s189/render, this session (it is the S189 PDR's render LOW (a)) |
| R190-J | A welded Helga hall cannot re-summon Helga | **Wrong — she comes back every fight as long as her tower stands**, welded or not. | s189/weld, this session |
| R190-K | A2 — the session-state race + lock litter | **Approved**: fix the hook writers and delete only provably-dead litter; *"I don't want us to waste inefficiency over this."* | p10-infra, this session |
| R190-L | A1 — CI e2e red since S187 (CI timing) | **Later** — *"we can do it tonight … next session or whatever."* | after the batch, else next session |
| R190-M | Deploy cadence | *"Whenever something is done and provably landed correctly and works, merge it to main, push it and deploy it. I want to see the game."* | every train |

## Recorded for NEXT session (add-ons he raised — not this batch)

- **Orc rage duration — 25 seconds.** *"let's do it like 25 seconds"* (today: the Warlord rages while below
  `WARLORD_RAGE_TRIGGER_PCT` 50 % and calms above `WARLORD_RAGE_CLEAR_PCT` 50 %). Open detail to settle when it is
  built: may it re-trigger if he is still below 50 % when the 25 s end? ⚠ Needs a rage-start field (four sites) →
  a protocol bump. And *"all other orc characters turning red too"* — BLOOD FRENZY already writes `enraged` on the
  seat's orc racial units and the tint follows `enraged` (`goblinRenderer.ts:268`), so this is a LOOK-at-it
  check after the next deploy, not code.
- **A magic-attack damage class.** Ra's column is magic; auras may be too; "a whole different spectrum". To be
  discussed and designed with him. Until then R190-E holds.
- **Alt toggles the footer while a tower is armed** — hold/press Alt to drop the footer so you can place where it
  was, Alt again to raise it.
- **A1 CI fix** if it does not land tonight (R190-L).
