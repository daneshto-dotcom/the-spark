export const meta = {
  name: 's190-branch-audit',
  description: 'Read-only independent audit of ONE finished S189/S190 worktree branch (lenses from args) with adversarial verification of every HIGH/MED finding',
  phases: [
    { title: 'Audit', detail: 'independent lenses over one branch' },
    { title: 'Verify', detail: 'one skeptic per HIGH/MED finding, default refuted' },
  ],
}

// args: { branch, worktree, base, brief, lenses: [{ key, text }] }
const MAIN = 'C:\\Users\\onesh\\OneDrive\\Desktop\\Claude\\Founder DNA\\Extension Projects\\The Spark'
const A = args || {}
if (!A.branch || !Array.isArray(A.lenses) || !A.lenses.length) throw new Error('args.branch and args.lenses are required')

const COMMON = `You are auditing ONE finished branch of SPARK (TypeScript / Vite / Pixi / Trystero, deterministic host-authoritative multiplayer builder game; live at spark-online.space). You did NOT write it. The main session is the MERGE OWNER and merges branches into master one at a time with gates between; your audit decides what must be fixed before this branch merges. In every audit this project has run (S182, S188, S190) a branch that reported "done, gates green" still carried 2-4 real defects — find them.

WHERE THINGS ARE (read-only):
- master (= live deploy #2 src, PROTOCOL_VERSION 50): ${MAIN} (local branch \`master\`).
- this branch: \`${A.branch}\`, worktree ${A.worktree}, forked from ${A.base}. Its progress file and canon notes are under <worktree>\\.claude\\plans\\ (S189_PROGRESS_*.md / S190_PROGRESS_*.md, *_CANON_NOTES_*.md) — read them IN FULL first, then verify every DONE claim against the tree.
- the batch PDR with the owner's verbatim words for every item: ${MAIN}\\.claude\\plans\\2026-09-24_S189_BATCH_PDR.md (§1 his ten corrections, §4 the rules every brief inherits, §5 the briefs).
- the canon: ${MAIN}\\SPARK_CANON.md. Owner rulings quoted there are the specification (e.g. §7b R185-A/B welding, R183-G z-order, §9b retaliation, §9c R185-C/D, §9d). A change that reverses a ruling is a defect even if it "fixes" something.
- sibling branches still unmerged (their files may conflict with this one): s188/input-layer, s188/wrath, s188/swarm, s188/ra-vfx, s188/draft-atk, s188/canon, s189/net, s189/units, s189/weld, s189/render, s190/perf.

THE BRIEF THIS BRANCH WAS GIVEN:
${A.brief}

RULES: strictly read-only — never edit, create, move or delete files anywhere; never commit; never git checkout / switch / stash / reset / merge into a real branch. You MAY run git log / show / diff / merge-base and \`git -C "${MAIN}" merge-tree --write-tree <a> <b>\` (unreferenced objects only), and at most a FEW targeted \`npx vitest run <file>\` inside THIS branch's worktree when that is the cheapest proof (report the captured exit code). Many agents share this machine: do NOT run the full vitest suite, Playwright, a dev server, or a build. Every finding needs file:line evidence you opened, a concrete failure scenario (inputs/state -> wrong result), and a fix shape. Distinguish: a defect ON the branch; a defect that appears only WHEN MERGED (onto master, or together with a named sibling); a merge-owner chore (stale comment, doc, re-pin); a wire/protocol bump owed ("can two builds that will shake hands disagree about anything either computes?"); an owner question. Check the TESTS the branch added: would each actually fail on the bug (read the assertion; spot-check a mutation claim)? A source-text guard proves a line EXISTS, not that it is REACHED. A tolerant default: arm is where a new value hides. Never call something verified that you did not open.`

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
    lens: { type: 'string' },
    findings: { type: 'array', items: FINDING },
    conflicts: { type: 'array', items: { type: 'object', properties: { with: { type: 'string' }, file: { type: 'string' }, resolution: { type: 'string' } }, required: ['with', 'file', 'resolution'] } },
    wire_changes: { type: 'array', items: { type: 'string' } },
    protocol_bump_owed: { type: 'boolean' },
    claims_checked_ok: { type: 'array', items: { type: 'string' } },
    not_checked: { type: 'array', items: { type: 'string' } },
  },
  required: ['lens', 'findings', 'conflicts', 'wire_changes', 'protocol_bump_owed', 'claims_checked_ok', 'not_checked'],
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

phase('Audit')
const results = await pipeline(
  A.lenses,
  (lens) => agent(`${COMMON}\n\n${lens.text}`, { label: `audit:${A.branch}:${lens.key}`, phase: 'Audit', schema: AUDIT }),
  (res, lens) => {
    if (!res) return { lens: lens.key, dead: true }
    const hi = res.findings.filter((f) => f.severity !== 'LOW' && f.class !== 'merge-owner-chore' && f.class !== 'owner-question')
    return parallel(hi.map((f) => () =>
      agent(`${COMMON}\n\nYOUR JOB: adversarially VERIFY one audit finding. Default to REFUTED unless you confirm it from the code yourself. Open every cited file:line and check the quote is really there (auditors in this project have cited symbols that do not exist). Walk the failure scenario on the real code — for a 'defect-when-merged' finding, check master's / the sibling's actual version. Name the first link that breaks, or confirm and sharpen the fix shape.\n\nFINDING:\n${JSON.stringify(f, null, 2)}`,
        { label: `verify:${A.branch}:${f.id}`, phase: 'Verify', schema: VERDICT })
        .then((v) => ({ ...f, verification: v }))
    )).then((verified) => ({ ...res, verified: verified.filter(Boolean) }))
  },
)
const dead = results.filter((r) => !r || r.dead)
if (dead.length) log(`LENSES THAT RETURNED NOTHING (run by hand or re-run): ${dead.map((r) => (r ? r.lens : '?')).join(', ')}`)
const low = results.filter((r) => r && !r.dead).reduce((n, r) => n + r.findings.filter((f) => f.severity === 'LOW' || f.class === 'merge-owner-chore' || f.class === 'owner-question').length, 0)
if (low) log(`${low} LOW / chore / owner-question item(s) reported but NOT adversarially verified`)
return { branch: A.branch, results: results.filter((r) => r && !r.dead), dead: dead.map((r) => (r ? r.lens : '?')) }
