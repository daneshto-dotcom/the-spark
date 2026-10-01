import io, sys

def sub(path, pairs):
    s = io.open(path, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in s else '\n'
    for a, b in pairs:
        a = a.replace('\n', nl); b = b.replace('\n', nl)
        n = s.count(a)
        if n != 1:
            print('MISS', path, n, repr(a[:100])); sys.exit(1)
        s = s.replace(a, b)
    io.open(path, 'w', encoding='utf-8', newline='').write(s)

sub('src/state/creatures/voltkin-config.ts', [
(""" * ⭐⭐ S192 (owner) — **×3 → ×9.** *"the Piranha, when it's upgraded … the Nagas get the Piranha upgrade,
 * it should be stronger … I think it should be times nine."* Still every stat from the base (R190-D).
 */
export const APEX_PREDATOR_STAT_MUL = 9;""",
""" * ⭐⭐ S192 (owner) — **×3 → ×6, "LIKE THE BAT SWARM".** He first said *"the Piranha, when it's upgraded
 * … the Nagas get the Piranha upgrade, it should be stronger … I think it should be times nine"*, then,
 * shown what ×9 does on the ladder (bite 252, ×21), CHOSE ×6 — the same multiplier as THE SWARM — from the
 * options he was given. Still every stat from the base (R190-D). ⛔ Equal to `THE_SWARM_STAT_MUL` BY
 * RULING, NOT BY COUPLING: each is its own literal, so a future retune of one never moves the other.
 */
export const APEX_PREDATOR_STAT_MUL = 6;"""),
(" * ⛔ THE FOUR LADDER STATS ARE MULTIPLIED (×9 since S192; tripled S188–S191), AND ONLY THEY ARE.",
 " * ⛔ THE FOUR LADDER STATS ARE MULTIPLIED (×6 since S192; tripled S188–S191), AND ONLY THEY ARE."),
(""" * `hp × (5 + def)`, and the piranha (3/0/2/1) has 0 DEF, so the pool is exactly ×9 (15 → 135). Damage
 * is `atk × (5 + pen)` and the PEN is ×9 too, so a bite goes 12 → 18 × 14 = 252 — **×21** (at S188's
 * ×3 it was 45 and 48, ×4). One elite bite is more than a whole 5-connector tower level (130). That is""",
""" * `hp × (5 + def)`, and the piranha (3/0/2/1) has 0 DEF, so the pool is exactly ×6 (15 → 90). Damage
 * is `atk × (5 + pen)` and the PEN is ×6 too, so a bite goes 12 → 12 × 11 = 132 — **×11**, the swarm's
 * exact bite (at S188's ×3 it was 45 and 48, ×4). One elite bite is more than a whole 5-connector tower
 * level (130). That is"""),
(""" * ⛔⛔ S192 — **DECOUPLED: A LITERAL 6.** Until S192 this read `2 × APEX_PREDATOR_STAT_MUL`, the
 * derivation above. The owner then raised APEX PREDATOR to ×9 (S192) while his R190-D ruling fixes the
 * swarm at six: *"a bat 1/1/1/1 → 6/6/6/6"*. Left derived, his piranha retune would have silently made
 * the swarm ×18. `theSwarm.test.ts` pins 6 and pins that the two no longer move together.""",
""" * ⛔⛔ S192 — **DECOUPLED: A LITERAL 6.** Until S192 this read `2 × APEX_PREDATOR_STAT_MUL`, the
 * derivation above. The owner then retuned APEX PREDATOR (S192: ×9 proposed, ×6 chosen) while his R190-D
 * ruling fixes the swarm at six: *"a bat 1/1/1/1 → 6/6/6/6"*. Left derived, ×6 would have made the swarm
 * ×12. The two are now EQUAL (6 and 6) by two rulings, not by a formula; `theSwarm.test.ts` pins 6 and
 * pins that this constant is written as a literal."""),
("// ⭐ S188 APEX PREDATOR — the piranha ×APEX_PREDATOR_STAT_MUL (9 since S192), see",
 "// ⭐ S188 APEX PREDATOR — the piranha ×APEX_PREDATOR_STAT_MUL (6 since S192), see"),
])
sub('src/state/stats.ts', [("×APEX_PREDATOR_STAT_MUL stats (9 since S192)", "×APEX_PREDATOR_STAT_MUL stats (6 since S192)")])
sub('src/state/racialPerks.ts', [("twice the size, nine times the stats.'", "twice the size, six times the stats.'")])

sub('src/state/racial/apexPredator.test.ts', [
("describe('S188 → S192 APEX PREDATOR — the stat line is the piranha ×9, derived', () => {",
 "describe('S188 → S192 APEX PREDATOR — the stat line is the piranha ×6, derived', () => {"),
("""  it('⭐⭐ HP / DEF / ATK / PEN are each exactly 9× the piranha’s — read off its config, never literals', () => {
    // S192 re-pin (owner: "I think it should be times nine") — was 3 (S188).
    expect(APEX_PREDATOR_STAT_MUL).toBe(9);""",
"""  it('⭐⭐ HP / DEF / ATK / PEN are each exactly 6× the piranha’s — read off its config, never literals', () => {
    // S192 re-pin (owner chose ×6, "like the bat swarm"; ×9 was proposed first) — was 3 (S188).
    expect(APEX_PREDATOR_STAT_MUL).toBe(6);"""),
("""  it('⚠ on the ladder: the pool is ×9 (DEF 0) and the bite is ×21 (PEN is ×9 too) — reported, not hidden', () => {""",
 """  it('⚠ on the ladder: the pool is ×6 (DEF 0) and the bite is ×11 (PEN is ×6 too) — reported, not hidden', () => {"""),
("    expect(unitPoolFifths(elite.hp, elite.def)).toBe(135);", "    expect(unitPoolFifths(elite.hp, elite.def)).toBe(90);"),
("    expect(attackFifths(elite.atk, elite.pen)).toBe(252);", "    expect(attackFifths(elite.atk, elite.pen)).toBe(132);"),
("    expect(attackFifths(elite.atk, elite.pen) / attackFifths(base.atk, base.pen)).toBe(21);",
 "    expect(attackFifths(elite.atk, elite.pen) / attackFifths(base.atk, base.pen)).toBe(11);"),
("""    // ⭐ S192 REACH — the ×9 line is what the real emission carries. This seat also took the 'hp'
    // general (148 measured = 135 + the pick), so the bound is the ×9 pool from below and twice the
    // old ×3 pool (45) — which an S188-strength elite plus that pick cannot reach.""",
"""    // ⭐ S192 REACH — the ×6 line is what the real emission carries. This seat also took the 'hp'
    // general (it adds to the pool), so the bound is the ×6 pool from below and twice the old ×3 pool
    // (45) — which an S188-strength elite plus that pick cannot reach."""),
])

sub('src/state/racial/theSwarm.test.ts', [
("""     * S192 re-pin — was `toBe(2 * APEX_PREDATOR_STAT_MUL)` ("whatever we did for the piranha, we double
     * that", S188). The owner then made APEX PREDATOR ×9 while R190-D keeps the swarm at 6, so the two""",
"""     * S192 re-pin — was `toBe(2 * APEX_PREDATOR_STAT_MUL)` ("whatever we did for the piranha, we double
     * that", S188). The owner then made APEX PREDATOR ×6 while R190-D keeps the swarm at 6, so the two"""),
("""    expect(APEX_PREDATOR_STAT_MUL).toBe(9);
    expect(THE_SWARM_STAT_MUL).not.toBe(2 * APEX_PREDATOR_STAT_MUL);""",
"""    expect(APEX_PREDATOR_STAT_MUL).toBe(6); // equal BY RULING (S192 "like the bat swarm")…
    // …not by coupling: both are written as LITERALS, so retuning one can never move the other.
    const src = readFileSync(new URL('../creatures/voltkin-config.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/export const THE_SWARM_STAT_MUL = 6;/);
    expect(src).toMatch(/export const APEX_PREDATOR_STAT_MUL = 6;/);"""),
])

sub('src/state/statsLadder.test.ts', [
(""" * ⭐ S192 (owner) — THE ELITE PIRANHA GETS ITS OWN, DERIVED LANE. *"I think it should be times nine."*
 * APEX PREDATOR multiplies every piranha stat by `APEX_PREDATOR_STAT_MUL` (R190-D, from the base), so
 * at ×9 its HP 27 and ATK 18 sit off the 1..12 point ladder by HIS ruling, not by drift. Same pattern""",
""" * ⭐ S192 (owner) — THE ELITE PIRANHA GETS ITS OWN, DERIVED LANE. He chose ×6 ("like the bat swarm").
 * APEX PREDATOR multiplies every piranha stat by `APEX_PREDATOR_STAT_MUL` (R190-D, from the base), so
 * at ×6 its HP 18 sits off the 1..12 point ladder by HIS ruling, not by drift (ATK 12 is on it). Same pattern"""),
])

sub('SPARK_CANON.md', [
("| **APEX PREDATOR** | nagas · 5 | the seat's piranha tower emits the ELITE piranha from now on — every stat ×9 (S192; tripled S188–S191), drawn twice the size | `APEX_PREDATOR_STAT_MUL` = **9** → **27 / 0 / 18 / 9** · `PIRANHA_ELITE_SPRITE_SCALE_MUL` = **2** | its speed is the piranha's |",
 "| **APEX PREDATOR** | nagas · 5 | the seat's piranha tower emits the ELITE piranha from now on — every stat ×6, like the bat swarm (S192; tripled S188–S191), drawn twice the size | `APEX_PREDATOR_STAT_MUL` = **6** → **18 / 0 / 12 / 6** · `PIRANHA_ELITE_SPRITE_SCALE_MUL` = **2** | its speed is the piranha's |"),
("""  than the current piranha"*. Then S192: *"the Piranha, when it's upgraded … the Nagas get the Piranha
  upgrade, it should be stronger … I think it should be times nine."*""",
"""  than the current piranha"*. Then S192: *"the Piranha, when it's upgraded … the Nagas get the Piranha
  upgrade, it should be stronger … I think it should be times nine."* — and, shown the ×9 arithmetic, he
  chose **×6, like the bat swarm**."""),
("""⚠ **APEX PREDATOR: "×9 EVERY STAT" IS ×9 HEALTH BUT ×21 BITE — HIS NUMBER (S192), THE LADDER'S
ARITHMETIC (R190-D).** The ladder multiplies ATK by (5 + PEN), and both are ×9: pool **15 → 135**, bite
**12 → 252** — 18 × (5 + 9) against the piranha's 2 × (5 + 1). One elite bite is more than a whole
5-connector tower, every level of it. Its HP 27 and ATK 18 sit OFF the 1..12 point ladder by his ruling;
`statsLadder.test.ts` gives the elite its own lane, pinned to exactly piranha × `APEX_PREDATOR_STAT_MUL`.
(S188–S191 it was ×3: pool 45, bite 48.)""",
"""⚠ **APEX PREDATOR: "×6 EVERY STAT" IS ×6 HEALTH BUT ×11 BITE — HIS CHOICE (S192, "like the bat
swarm"), THE LADDER'S ARITHMETIC (R190-D).** The ladder multiplies ATK by (5 + PEN), and both are ×6: pool
**15 → 90**, bite **12 → 132** — 12 × (5 + 6) against the piranha's 2 × (5 + 1), the swarm's bite exactly.
One elite bite is more than a whole 5-connector tower, every level of it. Its HP 18 sits OFF the 1..12
point ladder by his ruling; `statsLadder.test.ts` gives the elite its own lane, pinned to exactly piranha ×
`APEX_PREDATOR_STAT_MUL`. ⛔ Equal to THE SWARM's 6 by ruling, not by coupling — both are literals. (S188–S191
it was ×3: pool 45, bite 48; ×9 was proposed in S192 and not chosen.)"""),
("""⛔ Since S192 `THE_SWARM_STAT_MUL` is a LITERAL 6, decoupled from `APEX_PREDATOR_STAT_MUL`: left as
`2 × APEX` the owner's ×9 piranha would have silently made the swarm ×18.""",
"""⛔ Since S192 `THE_SWARM_STAT_MUL` is a LITERAL 6, decoupled from `APEX_PREDATOR_STAT_MUL`: left as
`2 × APEX` the owner's ×6 piranha would have silently made the swarm ×12."""),
("""the swarm's ATK was then the roster's largest; render-only, left as is on the S190 call), and rose again
**12 → 18** with the ×9 elite piranha (S192) — whose HP 27, PEN 9 and bite 252 also become the radar's
HP / PEN / SHOT ceilings, so every other unit's radar draws smaller. Render-only, reported, not changed.""",
"""the swarm's ATK was then the roster's largest; render-only, left as is on the S190 call). The ×6 elite
piranha (S192) ties it — ATK **12**, PEN 6, bite 132 — and moves NO radar ceiling (HP 18 is under the
bosses' 24; the SHOT ceiling stays Vlad's 150)."""),
])

sub('src/canon.test.ts', [
("""  it('⭐ §3e — the nagas: APEX PREDATOR is every STAT ×9 (S192), which is ×9 health but ×21 bite', () => {
    expect(APEX_PREDATOR_STAT_MUL).toBe(9); // his "I think it should be times nine\"""",
"""  it('⭐ §3e — the nagas: APEX PREDATOR is every STAT ×6 (S192, "like the bat swarm"), which is ×6 health but ×11 bite', () => {
    expect(APEX_PREDATOR_STAT_MUL).toBe(6); // his S192 choice"""),
("""    // The radar's ATK ceiling: the swarm's ATK in S190, the ×9 elite piranha's since S192 — noted, left as is.
    expect(RADAR_MAX_ATK).toBe(Math.max(swarm.atk, T3_PIRANHA_ELITE_STATS.atk));
    expect(canonSays(`ATK ceiling rose **10 → ${swarm.atk}**`)).toBe(true);
    expect(canonSays(`**${swarm.atk} → ${RADAR_MAX_ATK}** with the ×9 elite piranha (S192)`)).toBe(true);""",
"""    // The radar's ATK ceiling is the swarm's ATK, and the ×6 elite piranha (S192) only ties it.
    expect(RADAR_MAX_ATK).toBe(swarm.atk);
    expect(T3_PIRANHA_ELITE_STATS.atk).toBe(swarm.atk);
    expect(canonSays(`ATK ceiling rose **10 → ${RADAR_MAX_ATK}**`)).toBe(true);
    expect(canonSays(`ties it — ATK **${T3_PIRANHA_ELITE_STATS.atk}**`)).toBe(true);"""),
])
print('OK')
