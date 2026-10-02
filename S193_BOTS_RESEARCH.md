# S193 — BOT PERSONALITIES: what the best RTS/TD games do (R193-AI research)

Owner, S193: *"make them different … same as in Red Alert or Command and Conquer … Age of Mythology, Age of
Empires … five personalities, and then per level … learn from games like Ruse."*

## 1 · What each game does

| Game | Personality axis | Difficulty axis | How they are combined |
|---|---|---|---|
| **C&C 3 / Kane's Wrath** | Five named personalities picked per AI seat: **Balanced** (mixes defence, expansion and assaults), **Rusher** (fast offensive strikes, little defence), **Turtle** (fortifies, expands to fortify, masses an army at home), **Guerrilla** (hit-and-run, diversion), **Steamroller** (constant assaults, or a beeline to top-tier units/superweapon) [1][2] | Easy / Medium / Hard / Brutal | Independent dropdowns: any personality at any difficulty. The personality picks WHAT and WHEN; difficulty picks how well and how much. |
| **Age of Mythology (incl. EE/Retold)** | Personalities **Attacker, Boomer, Rusher, Balanced, Defender** (later patches added more, up to 10 choices). Rusher attacks early and often and walls late; Protector/Builder build more towers and TCs early; Conqueror prefers to boom [3][4] | Easiest … Titan | Same model: personality is a lobby choice orthogonal to difficulty. AoM's personalities are, under the hood, *weights* on a small set of sliders (rush↔boom, military↔economy, offence↔defence) read by one script. |
| **Age of Empires II DE** | No lobby personality, but the stock AI **draws a strategy per match** from a weighted menu (Knight Rush medium chance, Monk Rush low, Boom low on closed maps, Castle Drop low …) and then adapts to what the enemy fields [5] | Easiest … Extreme | Strategy = a seeded weighted draw per match; difficulty = execution. Community demand to port AoM's selectable personalities into AoE II [4]. |
| **StarCraft II** | **AI Build** dropdown per seat: Any Build, Full Rush, Timing Attack, Aggressive Push, Economic Focus, Straight to Air (plus race-specific named builds) [6][7] | Very Easy … Elite, then Cheater 1 (vision), 2 (resources), 3 (insane) [7][8] | Build is orthogonal to difficulty, **but higher difficulties have access to a wider variety of build orders** [6]. Cheats are the only thing above Elite. |
| **R.U.S.E.** | A spread of AI profiles chosen per seat — e.g. an artillery-focused ally against two rush-focused enemies [9] | Easy … Hard | Profile = which unit family the AI leans on, and how early it commits. |
| **Legion TD 2** (the closest genre match) | Bots mirror the player's sending pattern; they "send mercenaries very often", builds are near-perfect [10] | — | A lesson more than a model: a TD bot that only *defends* perfectly feels unfair and samey; its identity is in what it SENDS and WHEN. |

Supporting engineering references:
- **Lockstep determinism.** RTS sims (AoE's "1500 Archers") run the whole simulation identically on every machine
  from the same commands, so any AI that decides from a seeded stream and synced state is free [11][12]. SPARK is
  host-authoritative rather than lockstep, but the worker sim (`?worker=1`) rebuilds the bots from `(difficulties,
  matchSeed)` and must make the SAME decisions — the same constraint in miniature.
- **Utility / data-driven AI (Dave Mark, IAUS, GDC 2015).** Personality is best expressed as DATA — weights read by
  one decision function — not as five code paths [13]. That is exactly the shape `botConfig.ts` already has.

## 2 · The knobs those games vary, and which ones SPARK has

| Knob (literature) | Who uses it | SPARK equivalent today | Free to vary? |
|---|---|---|---|
| Build order / unit family | all of them | `chooseTargetBlueprint` rung order (cheapest-unowned) | ✅ yes — reorder within the tier's reachable rungs |
| Army vs static defence | C&C Turtle, AoM Defender, RUSE | tower roles: ARMY (race tower, goblin tower, pentagram, lightning hub, voltkin) vs DEFENCE (stink tower, laser turret, Helga) — canon §5 | ✅ yes |
| "Send" pressure / unit spending | Legion TD 2, SC2 Full Rush | `FEED_TOWER` — **no bot has ever fed a tower** (grep: zero bot dispatches) | ✅ yes — §10 Q4 *asked* for it at IMBA |
| Economy greed / boom | AoM Boomer, SC2 Economic Focus | save duty cycle (`SAVE_HOLD_TICKS`), loose-build tempo | ✅ yes (bounded) |
| Gatherer investment | AoE boom | `upgradesGatherer` / `buysSecondGatherer` | ⛔ NO — tier-ruled (§10 Q1, S154 amendment A) |
| Aggression timing / rate | C&C Rusher, SC2 Full Rush | `severChance`, raid concurrency | ⛔ NO — §10 Q2 *"dont change raid rate or number of allowed raids"* |
| Target selection | C&C Guerrilla, AoM Attacker | raid ladder (one rung up) — owner S156: *"the leader OR the nearest enemy whose score sits closest above"* | ✅ yes, between those TWO ruled options only |
| Spell aim (offence vs home defence) | — | `botRa.ts` tie-break "nearer own castle" | ✅ yes |
| Scouting | SC2 | `scoutsWhileIdle` | ⛔ tier-owned (S156 P2 ruling) |
| Cheats (vision/resources) | SC2 Cheater 1–3 | none; fog applies to bots (S155 P7, owner: *"not fair if bots see everything"*) | ⛔ never |

## 3 · Lessons adopted

1. **Two orthogonal dropdowns** (C&C, AoM, SC2): difficulty = *how well*, personality = *what and when*. A
   personality never grants a capability its tier lacks — so IMBA-Rusher and HARD-Rusher differ automatically, and
   no personality can smuggle a ruled tier gate (gatherer, first-tower rush, scouting) across tiers.
2. **Wider repertoire at higher difficulty** (SC2): a tier's reachable rungs already widen MID → HARD → IMBA, so a
   personality's build order shows MORE of itself the higher the tier. That is the owner's "IMBA offensive differs
   from HARD offensive", for free.
3. **Data, not code paths** (IAUS): one knob table, one brain. The fifth personality (BALANCED) is the existing bot,
   byte-for-byte, so the 4 500-test suite is the regression oracle for everything that is not new.
4. **Random = a seeded draw per match** (AoE II): resolved from `(matchSeed, seat)` by a pure integer hash that
   never touches the bot's own mulberry32 stream, so the host and the worker resolve it identically.
5. **Identity lives in what a bot BUILDS and SENDS** (Legion TD 2, RUSE): with the raid rate frozen by ruling, the
   visible difference is tower mix, the goblin army, and where RA lands — which is also what a player reads first.
6. **No cheats** (owner S155). Difficulty stays honest.

## Sources
1. [C&C 3 Tiberium Wars — AI personalities (SuperCheats wiki)](https://www.supercheats.com/command-and-conquer-3-tiberium-wars/wiki/ai-personalities)
2. [C&C 3: Kane's Wrath — Steam discussion on AI personality behaviour](https://steamcommunity.com/app/24810/discussions/0/4149455258727252632)
3. [Age of Mythology EE — patch changelog (personalities)](https://steamcommunity.com/sharedfiles/filedetails/changelog/519097480?p=3)
4. [AoM AI Personalities for AoE II — official forum](https://forums.ageofempires.com/t/aom-ai-personalities-for-aoe-ii/275377)
5. [Age of Empires II (2013) — AI strategy changelog](https://steamcommunity.com/sharedfiles/filedetails/changelog/473358292?p=3)
6. [Liquipedia — StarCraft II Artificial Intelligence](https://liquipedia.net/starcraft2/Artificial_Intelligence)
7. [StarCraft Wiki — AI script](https://starcraft.fandom.com/wiki/AI_script)
8. [TStarBots: Defeating the Cheating Level Builtin AI in StarCraft II (arXiv 1809.07193)](https://export.arxiv.org/abs/1809.07193)
9. [R.U.S.E. PC review — Worthplaying](https://worthplaying.com/article/2010/9/24/reviews/77117-pc-review-ruse/)
10. [Legion TD 2 — Steam discussions on bot behaviour](https://steamcommunity.com/app/469600/discussions/0/5406000785145618389)
11. [1500 Archers on a 28.8: Network Programming in Age of Empires and Beyond (Bettner & Terrano, GDC 2001)](https://web.cs.wpi.edu/%7Eclaypool/courses/4513-B03/papers/games/aoe.pdf)
12. [Synchronous RTS Engines 2: Sync Harder — Forrest Smith](https://www.forrestthewoods.com/blog/synchronous_rts_engines_2_sync_harder/)
13. [Infinite Axis Utility System — Dave Mark](https://gameai.com/iaus.php)

⚠ Two sources (SuperCheats, Liquipedia) returned HTTP 403 to a direct fetch; their content above is from search
excerpts, not a full read.
