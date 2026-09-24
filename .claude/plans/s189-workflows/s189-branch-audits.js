export const meta = {
  name: 's189-branch-audits',
  description: 'Read-only audits of the carried S188 branches (input-layer, wrath, swarm: two lenses each; ra-vfx, draft-atk, canon: triage) with adversarial verification of every HIGH/MED finding',
  phases: [
    { title: 'Audit', detail: 'two independent lenses per COMPLETE branch; triage per WIP branch' },
    { title: 'Verify', detail: 'one skeptic per HIGH/MED finding, default refuted' },
  ],
}

const MAIN = 'C:\\Users\\onesh\\OneDrive\\Desktop\\Claude\\Founder DNA\\Extension Projects\\The Spark'
const WT = (b) => `${MAIN}\\.claude\\worktrees\\s188-${b}`

const COMMON = `You are auditing ONE unmerged branch of SPARK (TypeScript / Vite / Pixi / Trystero, deterministic host-authoritative multiplayer; live at spark-online.space). The main session is the MERGE OWNER: it will merge branches into master ONE AT A TIME with gates between. Your audit decides what must be fixed before this branch merges. A branch that reported "done, gates green" has, in every audit this project has run (S182, S188), still carried 2-4 real defects — find them.

WHERE THINGS ARE (read-only):
- master (= deploy #2 15035b9, LIVE, PROTOCOL_VERSION 50): ${MAIN}  (branch master @ 441c832; deploy #2 = deploy #1 5c6615f + the racial-a/racial-d fix rounds, merged from s188/deploy2-candidate, which is now DELETED — do not look for it)
- this branch's worktree: given below. Its progress file: <worktree>\\.claude\\plans\\S188_PROGRESS_<name>.md — read it IN FULL first.
- the batch PDR with the owner's verbatim rulings for every racial and the common brief rules: ${MAIN}\\.claude\\plans\\2026-09-23_S188_BATCH_PDR.md (sections 0-8 and "THE BRIEFS" common rules)
- the canon: ${MAIN}\\SPARK_CANON.md (section 2 stat ladder, 3d draft, 6 wire). ⚠ its section 3d is STALE: it says no racial is built — all twelve level-0/5 racials ARE live on master.
- project rules are in the CLAUDE.md you were given (four-sites warning, stat ladder, determinism, the S182 lessons — especially: a source-text tripwire proves a line EXISTS not that it is REACHED; a tolerant default: arm is where a new union value hides; two branches can each be right against master and wrong together).

RULES: strictly read-only — never edit, create, move or delete files anywhere; never commit; never git checkout / switch / stash / reset / merge into a real branch. You MAY run: git log / show / diff / merge-base, and \`git -C "${MAIN}" merge-tree --write-tree master <branch>\` (it writes only unreferenced objects) to predict conflicts; and at most a FEW targeted \`npx vitest run <file>\` inside THIS branch's worktree when that is the cheapest way to prove a claim (report the captured exit code). Four worktree agents are running their own gates on this machine right now and the e2e lanes are load-sensitive: do NOT run the full vitest suite, Playwright, a dev server, or a build. Every finding needs file:line evidence you opened, a concrete failure scenario (inputs/state -> wrong result), and a fix shape. Distinguish: a defect ON the branch; a defect that only appears WHEN MERGED onto current master (drift / conflict / a master-side change the branch does not know about); and a merge-owner chore (stale comment, doc, re-pin). Never call something verified that you did not open.

⭐ PROTOCOL FACT THAT APPLIES TO EVERY BRANCH: PROTOCOL_VERSION 50 is LIVE (deploy #1 and deploy #2 — #2 added only the additive-optional Creature.attackCycleRaged, no bump). Any change a live v50 peer and a post-merge peer would disagree about — a new or reshaped serialized field, a new discriminant value, a new CreatureType, a changed rule both peers compute — means the merged build must be 51, not 50 (the S186 lesson: "can two builds that will shake hands disagree about anything either computes?"). Say exactly what, if anything, this branch changes on the wire or in shared rules, with file:line, and whether it therefore owes 50 -> 51.`

const BRANCHES = [
  {
    name: 'input-layer', kind: 'complete', base: '3b63c92',
    brief: `Scope amendment SA2 (owner-approved S188). Owner verbatim: "the arrow that takes down the footer ... reads more important than the tower above it ... it'd be one layer below ... Send a different agent to do it." Scope: the footer collapse arrow sits one layer BELOW an open tower menu; plus audit F1 (clicks through the draft panel reach the board). Branch s188/input-layer off s188/racial-c's tip 3b63c92. Its progress file records one known draftOverlay.ts conflict with master and its resolution.`,
    lenses: [
      { key: 'routing', text: `LENS 1 — INPUT ROUTING CORRECTNESS. Walk Controls' onDown / onMove / onUp / onRightClick (src/input/controls.ts) in order on the branch and list every handler in precedence order. For each of the two bugs, prove from the code that (a) the click, (b) the cursor and (c) the placement-refusal predicate all agree at every point of the measured geometry the progress file records (footer tab x 922-998 y 976-996 under each tier's card row; the draft plate + tiles + hover-tip plate). Hunt the gaps: a handler ABOVE the new guard that can still act through the panel/card; a key or right-click path; drag-release (onUp) after a press that began outside; the draft panel's hover tip that is drawn only on some frames; the collapsed-footer state; the seam between two cards; the Power of Ra aiming mode (master has POWER OF RA live — does the branch's guard order interact with RA aim clicks, and with master's CURRENT onDown, which may have moved since 3b63c92?). Check the tests really drive the real Controls + real FooterBand/DraftOverlay and would fail on the bug (read them; spot-check a mutation claim by reading the assertion).` },
      { key: 'merge', text: `LENS 2 — MERGE ONTO CURRENT MASTER. Run git -C "${MAIN}" merge-tree --write-tree master s188/input-layer and list every conflicted file. For each conflicted AND each cleanly-merged file this branch touches, read master's version (master is 96 commits ahead of the merge-base 3b63c92, including the six racial branches, the cards branch that rewrote src/render/draftOverlay.ts, the castle-button branch that added opaque plates to the castle panel, and the deploy #1 and deploy #2 fix rounds). Find semantic drift: a predicate the branch reads that master renamed or changed; an opaque plate / tile / button master ADDED that the new isOver/containsPoint logic does not cover (the racial tile is now CHOOSABLE on master — is it in the click-through guard?); the S182 fill enumeration counts on master vs branch; castle panel buttons (HP/ATK/DEF/PEN) and the Power of Ra footer slot — do they need the same layering treatment? State the exact resolution for each conflict hunk the merge owner will face.` },
    ],
  },
  {
    name: 'wrath', kind: 'complete', base: '3b63c92',
    brief: `Scope amendment SA3 (owner-approved S188). Owner verbatim: "at level 10, they will have the power of Ra, but times three. So you can use it three times per fight phase, just by clicking the skill on the bottom left ... the skill has to have the art of the picture, just like a lot smaller, it's like a little square ... think World of Warcraft ... it's only if you've chosen Power of Ra level zero, you can upgrade it to Power of Ra level three ... and if the mummies did not choose Power of Ra level zero then instead at level 10 they will receive ... a sandworm ... Just record it for now and don't implement that part yet." Scope: WRATH OF RA (mummies.l10, offered ONLY to a seat holding mummies.l0): 3 casts per FIGHT, the same aimed 5-column strike; the skill button becomes a WoW-style square icon cut from the card art; bots cast Ra; racial-c audit fixes F1 (sever via applySeverBond so a benched caster's strike still severs) and F4 (RA aim click below the sheet-action click). SANDWORM (the other mummies L10, for seats WITHOUT mummies.l0) is ruled and must NOT be built — only recorded. Branch s188/wrath off s188/racial-c's tip 3b63c92; it SUPERSEDES racial-c, which is already merged and live on master. Player.raStrike became Player.raStrikes: RaStrike[] (a wire/hash reshape).`,
    lenses: [
      { key: 'sim', text: `LENS 1 — SIM, WIRE, DETERMINISM. Audit every sim-side change: racialPerks registry (RACIAL_PERK_REQUIRES, perkDraftIndex generalisation — does it change the index/offer for ANY existing L0/L5 perk or for a seat of another race?), draftEvent offer/deadline/validation with the new picks parameter (an unoffered pick must still be refused — the P1 fix), raChargesFor / raCastsInWave / raChargesLeft, the reducer (prune earlier-wave strikes, append; NaN/Infinity/off-canvas no-op per amendment A1; cast only during FIGHT; benched/eliminated), strikes overlapping in one wave, the charge-indexed pattern seed (determinism: total order, no Map order, no float), the four sites for raStrikes (factory, reset between matches, serialize/deserialize with validation and a CAP on array length from the wire, hash union + projection + contribution test, worker mirror), host migration (a promoted successor inherits raStrikes), bots casting Ra (src/bots/botRa.ts — deterministic? host-only? uses the same reducer path?), and the sever path now calling applySeverBond directly (does that bypass anything besides the actor gate that SHOULD still apply — ownership of the target bond, the S157 own-shapes exemption, BOND_SEVERED cause, effects/toasts?). And the protocol: raStrike -> raStrikes means a live v50 peer and this build cannot interoperate — confirm and state the bump owed. SANDWORM must not be reachable in any form.` },
      { key: 'ui-merge', text: `LENS 2 — UI REACH, BRIEF, AND MERGE ONTO MASTER. (a) The footer skill slot: 46 px square Sprite + overlay Graphics + pips; the S182 fill enumeration went 8 -> 9 — is every new opaque fill hit-tested or declared decorative, and does the click target match the drawn square in expanded AND collapsed footer states? Texture lazy-load and fallback (a missing /art/upgrade-cards/l10-mummies.webp — ra-vfx ships it, this branch does not); refused/disabled states SAY WHY. (b) Brief compliance against the owner's words above: 3 casts per FIGHT, offered only with mummies.l0, the icon from the card art, bots cast it. (c) Run git -C "${MAIN}" merge-tree --write-tree master s188/wrath; list conflicts; read master's versions of every touched file (master is 96 commits ahead of 3b63c92: the cards branch rewrote draftOverlay.ts, the castle branch added castle-panel plates, racial-c's own code on master may have been changed by later merges or the deploy #1 / deploy #2 fix rounds). Find drift: master-side code that still reads Player.raStrike (singular) and would not compile or would silently read undefined after the merge; tests on master that pin raStrike; the 16-card test; RACIAL_PERK_BUILT blocks. Give the exact resolution per conflict.` },
    ],
  },
  {
    name: 'swarm', kind: 'complete', base: '4b52fdd',
    brief: `Scope amendment SA1 (owner-approved S188). Owner verbatim: "the swarm, you better build them in an external agent, not yourself, because we've already defined it. We have the even the art for the upgrade. So there's no reason not to build it. Do it this session." Scope: THE SWARM (vampires.l10): the vampire seat's tier-3 bat tower emits a bat swarm at x6 bat stats, its own atlas, its card on the level-10 tile. Branch s188/swarm off s188/racial-d's tip 4b52fdd. ⚠ Open owner number: damage is ATK x (5 + PEN) on the ladder, so multiplying BOTH ATK and PEN by 6 makes the bite x11 relative to the bat, not x6 — record what the branch actually computes, from the constants, with the arithmetic.`,
    lenses: [
      { key: 'sim', text: `LENS 1 — SIM, WIRE, DETERMINISM, FOUR SITES. New CreatureType 't3BatSwarm': every exhaustive Record/switch tsc forces AND every consumer with a tolerant default: arm or an if-chain on 't3Bat' / race tier-3 types that the swarm must also satisfy (grep 't3Bat' and 'raceTier3' / tower-unit helpers across src, excluding tests) — targeting, retaliation (NEVER_RETALIATES), flying/pathing, stun gates, lifesteal (BLOOD DEBT/CRIMSON TIDE apply to swarm hits?), damage numbers, the character sheet, bots, hash/serialize/worker allowlists, creature-type validation in the deserializer, atlas/renderer mapping. The promotion in towerUnitForSeat: only for a seat holding vampires.l10, only from then on (already-born bats unchanged), deterministic. perkDraftIndex generalisation — does it change any existing L0/L5 perk's index? The stat multiply: x6 on which stats, pool via unitPoolFifths and damage via attackFifths — compute the actual numbers from the constants and state them. The one-live-per-(owner,type) latch and the spawner cap. Protocol: a new CreatureType owes 50 -> 51.` },
      { key: 'art-merge', text: `LENS 2 — ART, UI, BRIEF, AND MERGE ONTO MASTER. (a) The atlas t3-vampires-bat-swarm (fly/attack/die), the build-scattered-sheet-atlas.mjs change (claimed byte-identical for elite piranha + corpse eater — check the claim's method), the renderer fallback to the bat sheet at 2x when the swarm sheet is missing, the l10-vampires.webp card on the level-10 tile (master's draft overlay draws which tiles for which wave? is a level-10 tile even reachable on master — draft index 2, wave 11?). (b) Brief compliance. (c) Run git -C "${MAIN}" merge-tree --write-tree master s188/swarm; list conflicts; read master's versions of every touched file (master is 93 commits ahead of 4b52fdd, INCLUDING the racial-d fix round, which shipped in deploy #2 — check whether swarm touches any file that fix round changed: git -C "${MAIN}" diff --stat 5c6615f 15035b9 -- src). The progress file lists "merge-owner reconciliation owed" items — verify each and give exact resolutions (build-upgrade-cards.py, the 16-card test, RACIAL_PERK_BUILT blocks, canon notes).` },
    ],
  },
  {
    name: 'ra-vfx', kind: 'wip', base: 'b5c9fc9',
    brief: `Brief: the owner's new ART for the Ra sky strike (the Pharaoh ritual and POWER OF RA share drawRaColumns) and the WRATH OF RA upgrade card (l10-mummies). MECHANICS DO NOT CHANGE. Status per its progress file: STOPPED on the coordinator's session-close order — art, card and renderer wiring committed and compiling; the dedicated tests (raStrikeArt.test.ts) and the full gate run NOT done; the progress file lists exactly what the next session must do.`,
    lenses: [ { key: 'triage', text: `TRIAGE (this branch is unfinished — the goal is an accurate work list, not a verdict). (1) What is committed vs what the progress file says is done — verify each DONE claim against the tree. (2) Is the mechanics-unchanged claim true (git diff b5c9fc9 s188/ra-vfx -- src/state src/net src/bots should be empty or render-only)? (3) The runtime cost: a 1,680 KB strike atlas loaded when — at boot, or lazily on first strike? blocking anything? fallback when missing? (4) Real defects in the committed renderer code (raStrikeArt.ts, the bossAuras.ts wiring): frame timeline vs RA_COLUMN_TICKS, per-frame derivation from synced state (never a one-shot effect), a drawer that allocates per frame, texture use before load. (5) merge-tree against master and against s188/wrath (both touch the Ra drawing path and the l10-mummies card — which merge order is cheaper, and what is the conflict?). (6) The exact remaining work list with an effort estimate per item.` } ],
  },
  {
    name: 'draft-atk', kind: 'wip', base: '2703365',
    brief: `Brief (merge owner's dispatch, S188): the draft ATK and PEN picks do nothing — a drafted attack upgrade never reaches a creature's strike; and the HELLSPAWN card shows 7/5 while the sim deals 3 and holds 2. Plan: bake Creature.atkFifths? at birth in makeCreature (only when it differs) + a creatureAttackFifths(c) accessor; four sites; every creature strike site reads the accessor (creatureAttack x6, voltkin chain, suicide blast, drone blast, CORPSE EATER fallback); HELLSPAWN child inherits the parent's baked strike; card strings read the creature; tests. Status: SALVAGED at the spend-limit stop — the last commit holds in-flight files, UNVERIFIED; every plan row is still 'pending' in the progress file.`,
    lenses: [ { key: 'triage', text: `TRIAGE (unfinished, salvaged mid-flight — the goal is an accurate work list). (1) First CONFIRM THE BUG on master from the code: does a drafted ATK or PEN pick change any creature's strike amount today? Trace applyDraftPercent / the draft buff application to where creature damage is computed (attackFifths call sites for creatures) and show the exact line where the buff is or is not read. Same for the HELLSPAWN card 7/5 vs 3/2 claim. (2) What exactly is in the salvage commit (git show --stat s188/draft-atk; read each changed hunk): which plan rows are actually implemented, which are half-done, which would not compile (you may run npx tsc --noEmit -p . in the worktree ONLY if it is cheap — otherwise reason from the code). (3) Enumerate EVERY production creature strike site on master (grep attackFifths( and damageEntity( in src excluding tests) — the plan lists 10; find the ones it missed. (4) Wire: a new optional Creature.atkFifths is a new serialized field that changes a rule both peers compute (strike damage) — 50 -> 51. (5) The exact remaining work list with effort per item, and whether finishing the salvage is cheaper than restarting from master.` } ],
  },
  {
    name: 'canon', kind: 'wip', base: '2703365',
    brief: `Brief: land the S188 canon text (section 3d says no racial is built — stale; new 3e for the racials; section 3 castle buttons; section 6 PROTOCOL 50; 3b) with its assertions in src/canon.test.ts in the SAME commit (project rule: a number goes into the canon only with its constant and its assertion). Status: the TEXT is committed; the canon.test.ts assertions are NOT written. No progress file exists for this branch.`,
    lenses: [ { key: 'triage', text: `TRIAGE. (1) Read the branch's diff of SPARK_CANON.md (git diff 2703365 s188/canon) IN FULL. For EVERY number and every "the code does X" claim in the new text, find the constant / code on master (it must match master, which is live deploy #2 — the deploy-#2 fix rounds are already ON master; note where s188/wrath, s188/swarm or s188/draft-atk would change it after merge). List each claim with: text, the constant + file:line, match / MISMATCH, and the canon.test.ts assertion that should pin it. (2) Read src/canon.test.ts to see the house style for those assertions (it pins numbers AND source-text facts). (3) Claims in the new text that are the session's decisions rather than the owner's — are they flagged as MINE? Anything that contradicts an owner ruling quoted elsewhere in the canon or the S188 PDR section 2? (4) The exact remaining work list.` } ],
  },
]

const FINDING = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    severity: { type: 'string', enum: ['HIGH', 'MED', 'LOW'] },
    class: { type: 'string', enum: ['defect-on-branch', 'defect-when-merged', 'merge-owner-chore', 'wire-bump-owed', 'owner-question'] },
    failure_scenario: { type: 'string' },
    evidence: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, line: { type: 'integer' }, quote: { type: 'string' } }, required: ['file', 'line', 'quote'] } },
    fix_shape: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: ['id', 'title', 'severity', 'class', 'failure_scenario', 'evidence', 'fix_shape', 'confidence'],
}

const AUDIT = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    lens: { type: 'string' },
    findings: { type: 'array', items: FINDING },
    conflicts: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, resolution: { type: 'string' } }, required: ['file', 'resolution'] } },
    wire_changes: { type: 'array', items: { type: 'string' } },
    protocol_bump_owed: { type: 'boolean' },
    remaining_work: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, effort: { type: 'string' } }, required: ['item', 'effort'] } },
    claims_checked_ok: { type: 'array', items: { type: 'string' } },
    not_checked: { type: 'array', items: { type: 'string' } },
  },
  required: ['branch', 'lens', 'findings', 'conflicts', 'wire_changes', 'protocol_bump_owed', 'remaining_work', 'claims_checked_ok', 'not_checked'],
}

const VERDICT = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['CONFIRMED', 'PLAUSIBLE', 'REFUTED'] },
    cited_lines_exist: { type: 'boolean' },
    broken_link: { type: 'string' },
    reasoning: { type: 'string' },
    corrected_fix_shape: { type: 'string' },
  },
  required: ['verdict', 'cited_lines_exist', 'broken_link', 'reasoning'],
}

// S190: args = an array of branch names runs only those (three separate runs, so one limit hit costs one group)
const ONLY = Array.isArray(args) && args.length ? args : null
if (ONLY) log(`running only: ${ONLY.join(', ')}`)
const JOBS = BRANCHES.filter((b) => !ONLY || ONLY.includes(b.name)).flatMap((b) => b.lenses.map((l) => ({ b, l })))

phase('Audit')
const results = await pipeline(
  JOBS,
  (job) => agent(`${COMMON}\n\nBRANCH: s188/${job.b.name}  (kind: ${job.b.kind})\nWORKTREE: ${WT(job.b.name)}\nMERGE-BASE WITH ITS PARENT: ${job.b.base}\nTHE BRIEF: ${job.b.brief}\n\n${job.l.text}`,
    { label: `audit:${job.b.name}:${job.l.key}`, phase: 'Audit', schema: AUDIT }),
  (res, job) => {
    if (!res) return { branch: job.b.name, lens: job.l.key, dead: true }
    const hi = res.findings.filter((f) => f.severity !== 'LOW' && f.class !== 'merge-owner-chore' && f.class !== 'owner-question')
    return parallel(hi.map((f) => () =>
      agent(`${COMMON}\n\nBRANCH: s188/${job.b.name}  WORKTREE: ${WT(job.b.name)}\nTHE BRIEF: ${job.b.brief}\n\nYOUR JOB: adversarially VERIFY one audit finding. Default to REFUTED unless you confirm it from the code yourself. Open every cited file:line and check the quote is really there (auditors in this project have cited symbols that do not exist). Walk the failure scenario on the real code — for a 'defect-when-merged' finding, check master's actual version of the file. Name the first link that breaks, or confirm and sharpen the fix shape.\n\nFINDING:\n${JSON.stringify(f, null, 2)}`,
        { label: `verify:${job.b.name}:${f.id}`, phase: 'Verify', schema: VERDICT })
        .then((v) => ({ ...f, verification: v }))
    )).then((verified) => ({ ...res, verified: verified.filter(Boolean) }))
  },
)

const dead = results.filter((r) => !r || r.dead)
if (dead.length) log(`AUDIT JOBS THAT RETURNED NOTHING (must be run by hand): ${dead.map((r) => (r ? `${r.branch}:${r.lens}` : '?')).join(', ')}`)
const lowCount = results.filter((r) => r && !r.dead).reduce((n, r) => n + r.findings.filter((f) => f.severity === 'LOW' || f.class === 'merge-owner-chore' || f.class === 'owner-question').length, 0)
if (lowCount) log(`${lowCount} LOW / chore / owner-question item(s) reported but NOT adversarially verified`)
return { results: results.filter((r) => r && !r.dead), dead: dead.map((r) => (r ? `${r.branch}:${r.lens}` : '?')) }
