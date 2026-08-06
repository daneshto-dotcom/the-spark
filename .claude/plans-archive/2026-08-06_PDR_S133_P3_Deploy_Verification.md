# PDR S133 P3 — deploy verification: "push = deployed" is FALSIFIED

**Tier:** Micro (1 new script + 3 doc edits; no src/, no wire, no reducer)
**STATUS: COMPLETED — verifier shipped, mutation matrix 5/5, deploy verified 4/4 carriers**
**Priority id:** `P3-deploy-verification` (dot-free)
**Deliberation:** waived on the user path (`pdr_approved` + `unlock_source: user`), Rule 17 Micro opt-in.
**Budget posture:** context at scoping was **524K / 1M = YELLOW**, so scope is deliberately tightened
to the smallest change that removes the hazard. No new src/ surface, no Standard-tier work.
**Approval:** user granted a full-batch + future-PDR + autonomous run for this session.

---

## §A.0 — STATE-DISCOVERY (empirical, this session, all verified)

The owner pushed 45 commits (`f0b8144..d2d1c34`) at 22:10:08Z after six sessions of blocked auth.

| Probe | Command | Result |
|---|---|---|
| Push landed server-side | `git ls-remote origin refs/heads/master` | `d2d1c34` ✅ |
| GitHub SAW the push | `gh api repos/.../events` | `2026-08-06T22:10:08Z PushEvent refs/heads/master d2d1c34a` ✅ |
| Workflow run created? | `gh api repos/.../actions/runs` | ⛔ **NONE.** Newest run was 2026-08-03. |
| Actions enabled? | `gh api repos/.../actions/permissions` | `{"enabled":true,"allowed_actions":"all"}` ✅ |
| Workflows active? | `gh workflow list --all` | all three `active` ✅ |
| Paths filter matched? | `git diff --name-only f0b8144..d2d1c34 -- src/ package.json …` | **32 filtered files**, incl. `deploy.yml` itself ✅ |
| Repo blocked? | `gh api repos/.../` | `private:false archived:false disabled:false` — public ⇒ unlimited minutes ✅ |
| Workflow YAML valid? | `yaml.safe_load` both files | both parse ✅ |
| Over GitHub's path-skip threshold? | 45 commits / 59 files | far under the 1,000-commit rule ✅ |
| Late-arriving run? | re-checked after the dispatch completed | ⛔ still none — **not latency** |
| `workflow_dispatch` works? | `gh workflow run deploy.yml` | ✅ run `31128874492` created immediately |

**CONCLUSION:** every precondition for the push trigger was satisfied and the run was still never
created. Root cause is **NOT determinable from outside GitHub** and this PDR does not pretend to fix
it. What IS actionable: the project's deploy charter asserts *"Every push to `master` ships to
production"* (`SPARK_Blueprint.md` §XV.7) and that assertion is now **empirically false**. A future
session that pushes and assumes it shipped will be wrong, silently, with no email and no red run —
the same silent-failure class as the `cancelled` CI runs already logged (two are visible in the run
list, 2026-07-20 and 2026-07-27).

**Also confirmed working, for the record (six sessions of not knowing):** S131's gating unit-test
step ran for the first time and PASSED — `✓ Unit tests (gating — a red test now blocks the deploy)`,
build 1m4s, deploy 11s. Deploy verified live by BOTH carriers: deployments API shows
`22:16:46Z github-pages sha d2d1c34a`, and the live entry-asset hash `index-CgC_LFzg.js` is
**byte-identical** to the local build.

## OBJECTIVE

Convert "assume the push deployed" into "verify the push deployed", in one command, so the falsified
charter cannot silently cost a session again. Fix the docs that state the false assertion.

## SCOPE — IN

1. **`scripts/verify-deploy.mjs`** — one command, exits nonzero on any failure:
   (a) resolve local `HEAD`; (b) assert the remote `master` equals it (a push that never landed is the
   first failure mode); (c) assert a `deploy.yml` run exists **for that SHA** and concluded `success`
   — explicitly treating **`cancelled` as failure**, per the logged "CI can die silently as
   cancelled" hazard; (d) fetch the live site and assert its entry-asset filename matches
   `dist/assets/index-*.js`; (e) print a one-line PASS/FAIL verdict naming which carrier failed.
2. **`package.json`** — add `"verify-deploy": "node scripts/verify-deploy.mjs"`.
3. **`SPARK_Blueprint.md` §XV.7** — correct "Every push to `master` ships to production" with the
   measured counter-example and the `gh workflow run deploy.yml` fallback (which R14 already
   prescribes for a different reason: the paths filter excludes `scripts/**`).
4. **BACKLOG carry-forward ledger** — log the anomaly with the full probe table so it is not
   re-derived, and note the two `cancelled` runs as the same silent class.

## SCOPE — OUT

- **Root-causing GitHub's trigger miss.** Not determinable from outside; not guessable. Logged.
- Changing the trigger design (e.g. removing the paths filter, adding a cron deploy) — that is an
  owner decision about deploy topology, and §XV.7 is a LOCKED decision.
- Re-pushing or re-deploying: prod already matches `d2d1c34`, hash-verified.
- ⚠ **`scripts/**` is EXCLUDED from `deploy.yml`'s paths filter (R14)** — so this priority's own
  commit will NOT trigger a deploy, which is correct (it ships no runtime code) and is itself a
  reason the verify script must check the SHA rather than assume.

## TESTING

- Run `npm run verify-deploy` against the CURRENT state: must PASS (prod is at `d2d1c34`).
- **Mutation-test it** — a verifier that cannot fail is worthless, which is this session's lesson
  twice over: (M1) feed it a bogus SHA ⇒ must FAIL on the run-lookup carrier; (M2) feed it a bogus
  expected asset hash ⇒ must FAIL on the live-hash carrier; (M3) simulate a `cancelled` conclusion
  ⇒ must FAIL, not pass. Report the matrix.
- `node --check` the script; tsc unaffected (`.mjs`, outside tsconfig).
- Full suite + bundle re-run to prove no regression from the `package.json` edit.
