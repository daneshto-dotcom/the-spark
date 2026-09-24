export const meta = {
  name: 's189-disconnect-hunt',
  description: 'Read-only 5-lane hunt for the owner-reported CONNECTION LOST in a live v50 multiplayer match; every HIGH/MED finding adversarially verified',
  phases: [
    { title: 'Hunt', detail: 'five independent lanes: transport, wire, exceptions, load, coverage+history' },
    { title: 'Verify', detail: 'one skeptic per HIGH/MED finding, default refuted' },
    { title: 'Critic', detail: 'what no lane examined' },
  ],
}

const MAIN = 'C:\\Users\\onesh\\OneDrive\\Desktop\\Claude\\Founder DNA\\Extension Projects\\The Spark'

const COMMON = `You are one lane of a bug hunt in SPARK (TypeScript / Vite / Pixi / Trystero WebRTC multiplayer builder game, host-authoritative, live at spark-online.space).

THE REPORT (owner, 2026-09-24, with a screenshot): in a live 2-player multiplayer match on deploy #1 (commit 5c6615f, PROTOCOL_VERSION 50 — the S188 racial-upgrades release) he got the overlay "CONNECTION LOST" / "peer dropped — return to title to retry". It is NOT known whether both tabs were freshly loaded onto the new build.

READ THE CODE HERE, read-only: MAIN = ${MAIN} — branch master @ 8c369c4, whose src/ is byte-identical to the live 5c6615f. Use absolute paths. Do NOT read source from ${MAIN}\\.claude\\worktrees\\* — those are other, unmerged branches.

ESTABLISHED FACTS (verified by the main session — build on them, do not re-derive):
1. The overlay text is in src/render/connectionLostOverlay.ts (:45 'CONNECTION LOST', :53 'peer dropped — return to title to retry'). It is driven from src/main.ts ~3627-3747. It shows only when isNetworked(world) && world.gameState === 'PLAYING' && netTransport !== null && (netTransport.peerCount() === 0 || hostLost), where hostLost = !world.isHost && session.hostPeerId !== null && !netTransport.peerIds().includes(session.hostPeerId). The TERMINAL text appears after RECONNECT_GRACE_MS = 15_000 (main.ts:2460) of that condition (a client re-runs connectAsClient every RECONNECT_RETRY_MS meanwhile and shows a RECONNECTING variant), or after the migration deadline (reconnect window + CLAIM_LADDER_MS 1500 x MAX_PLAYERS + 5000) when a warranted client still has a mesh, or immediately via the zombieDeposed latch.
2. A protocol mismatch cannot produce it mid-match: HELLO is refused by detectProtocolMismatch before the lobby, so a v49 tab and a v50 tab never reach PLAYING together. BUT one tab being reloaded or closed mid-match WOULD produce exactly this overlay on the other tab (after 15 s), and its rejoin would be refused if it came back on a different build.
3. S188 (git range 41917f8..5c6615f) added: a 'racial' draft pick; 12 racial mechanics in src/state/racial/*; a CAST_POWER_OF_RA client intent; the castle HP/ATK/DEF/PEN buttons now dispatching UPGRADE_CASTLE_STAT; new Creature fields (hellspawnGen, corpseEater*), Player fields (dynastyHpLost, ra*); CreatureType 't3PiranhaElite'; a post-sweep spawn queue; castleHp above 2500 now crossing the wire; new renderers and atlases. PROTOCOL 49 -> 50.

RULES: strictly read-only — never edit, create, move or delete files in MAIN or any worktree; never commit; never git checkout / switch / stash / reset. An e2e run is in progress on this machine and it is load-sensitive: do NOT run the full vitest suite, Playwright / e2e, a dev server, or a build. You MAY run ONE targeted vitest file (npx vitest run <path>) or a tiny node/tsx script placed in your own temp directory, only when it is the cheapest way to PROVE a claim — report its captured exit code. Every claim needs file:line evidence you actually opened. A finding must give the full causal chain ending in "-> peerCount()===0 or hostLost while PLAYING for >= 15 s" (or zombieDeposed). A mechanism that only desyncs, freezes or corrupts the board without dropping the peer is a DIFFERENT symptom: report it with produces_this_exact_overlay=false rather than dressing it up. "Nothing found" is a legitimate result only with a concrete ruled_out list naming what you examined.`

const LANES = [
  { key: 'transport', prompt: `LANE A — TRANSPORT. Enumerate EVERY code path that removes a peer from the NetTransport peer set, or tears the transport down, while PLAYING. Start at the NetTransport class (find it under src/net/), Trystero's onPeerLeave wiring, and every PRODUCTION call site of disconnect() / teardownNet() / leave() / close() (grep src, exclude *.test.ts). Then every per-peer drop latch: the protocol-mismatch latch, sender-auth / TOFU / PoP verification failure, the intent rate limiter (S125 F9 — does exceeding a per-peer INTENT budget drop, latch or kick a peer? could S188's NEW UI actions — castle HP/ATK/DEF/PEN buttons, Power of Ra aiming + cast, racial draft pick — push an ordinary player over a budget?), the S155 join-trust stall detector, host succession/migration (src/net/succession.ts: what does a CLIENT do when the host goes silent for HOST_STARVATION_MS = 6000; in a 2-player match can that path end in hostLost or peerCount 0 while the host tab is still open?), deposition (zombieDeposed, demoteToClient, reestablishTransport). For each path: who can reach it during a live 2-player PLAYING match on the production build, and did anything in 41917f8..5c6615f make it more reachable?` },
  { key: 'wire', prompt: `LANE B — WIRE CONTENT. For every message a v50 peer sends during PLAYING (NETSNAPSHOT host->client, INTENT client->host, GameEffects, MIGRATION_*), trace the RECEIVER's parse / validate path (the parse function in src/net/protocol.ts around :1818, the deserializers in src/state/save.ts, every allowlist) and ask: can a message produced by S188 code FAIL validation on a SAME-BUILD receiver — e.g. a field validator whose range or enum was not widened (castleHp above 2500, a 'racial' entry in draftPicks, 't3PiranhaElite' in a creature-type allowlist, CAST_POWER_OF_RA coordinates, raStrike / dynastyHpLost / hellspawnGen / corpseEater* fields, maxEhp, a new GameEffect kind with no default arm in deserializeEffect) — or THROW inside a handler? A snapshot silently rejected every 100 ms looks like host silence to the client: follow where host silence leads (starvation -> migration -> ... ?). Enumerate S188's wire changes with read-only git: git -C "${MAIN}" diff 41917f8 5c6615f -- src/net src/state/save.ts src/state/stateHash.ts src/state/stateHashFull.ts . Also the reverse direction: an INTENT the HOST rejects — can rejection ever drop, latch or kick the sending peer?` },
  { key: 'exceptions', prompt: `LANE C — EXCEPTIONS. Can any S188 code THROW during PLAYING? Host side: hostTick's racialTick slots, the post-sweep spawn queue, damage / lifesteal paths, the castle-upgrade reducer, the draft deadline. Client side: applying snapshots, and the new renderers (draft overlay cards, castle panel buttons, corpse-eater / elite-piranha atlases, the Power of Ra telegraph + columns, the scorched-ground tint, the deep-current vortex, damage numbers). Look for throw statements, exhaustive switches with a throwing default / assertNever, non-null assertions on lookups keyed by a new type (a config Record missing 't3PiranhaElite'), damageEntity's non-integer throw fed by a new percentage formula, texture/atlas access before load. Then the DECISIVE half: what does the main loop do when a frame throws (read main.ts's rAF / tick loop, any try/catch around it, window.onerror / unhandledrejection handlers)? Does the loop die? If the HOST's loop dies, does the host stop sending snapshots/heartbeats so the client concludes the host is gone — and does that end in peerCount 0 / hostLost (the transport itself may stay up)? Does a throw inside a Trystero message callback affect the data channel? Cover the ?worker=1 path too (a worker-side exception).` },
  { key: 'load', prompt: `LANE D — LOAD. Can S188 blow up entity counts, snapshot size or host frame time enough to kill the link? Racials that multiply creatures: THE HORDE GROWS (goblin cap 10->20 plus castle emit x2), THE RISEN (a zombie per kill), HELLSPAWN (up to 6 descendants per chewer), ENDLESS DYNASTY (a Pharaoh per 1000 castle HP lost, sentinel 40 per seat); plus bots; plus ehp/maxEhp now emitted for every draft-buffed creature (the S187 'emit only when damaged' optimisation meets a buffed pool). Quantify bytes per creature on the wire before/after a draft buff (serializeCreature, trimMirrorCreature, wireNumberReplacer / NetTransport.send) and a realistic late-match creature count. Then the transport: how does NetTransport.send / Trystero handle a large payload (chunking, RTCDataChannel bufferedAmount, max message size) — is there ANY path where a sustained backlog or an oversize message closes the channel or makes Trystero report the peer as left? And host frame time: any O(n^2) scan added by S188 (per-creature scans over all creatures or zones in racialTick, lifesteal lookups, spawn-queue drains) that could stall the host main loop for >= HOST_STARVATION_MS (6000 ms) or trip the S124 partition-evidence / starvation logic. Existing fixtures: src/**/netWireSize.test.ts and the S182 wire table in SPARK_CANON.md section 6 (84.0 KiB / 6.88 Mbit/s at 120 creatures) — you may run netWireSize.test.ts alone.` },
  { key: 'coverage-history', prompt: `LANE E — COVERAGE AND HISTORY. (1) What automated coverage exists for a REAL two-peer networked PLAYING match — e2e specs that open two browser contexts/pages over the real Trystero wire (find them in e2e/, note which lane runs each per src/ci.e2eLanes.test.ts and package.json scripts: gating / races / quarantine / soak) — and do they exercise any S188 feature or only an S<=187 match? Were they green on CI for 5c6615f? (read-only: gh run list --branch master -L 12 --json databaseId,conclusion,name,headSha ; gh run view <id>). (2) List every commit from 41917f8 to 5c6615f touching src/net/**, src/main.ts network / session / reconnect / migration sections, src/state/gameMode.ts, lobby / start paths, or hostTick's bench / eliminate / peer-drop handling (git -C "${MAIN}" log --oneline 41917f8..5c6615f -- <paths>; git show <sha> --stat). For each, say whether it can change when a peer leaves or is considered gone. (3) Collect the EXACT console strings (console.warn / console.error '[net] ...') a player would see in ?debug=1 on each drop path, so the owner's console can be read against them — list them per path with file:line.` },
]

const FINDING = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    severity: { type: 'string', enum: ['HIGH', 'MED', 'LOW'] },
    mechanism: { type: 'string', description: 'full causal chain, step by step' },
    evidence: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, line: { type: 'integer' }, quote: { type: 'string' } }, required: ['file', 'line', 'quote'] } },
    reachable_in_live_2p_match: { type: 'boolean' },
    reachability_argument: { type: 'string' },
    produces_this_exact_overlay: { type: 'boolean' },
    introduced_by: { type: 'string', description: 'commit sha, or pre-S188' },
    repro_idea: { type: 'string' },
    fix_shape: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: ['id', 'title', 'severity', 'mechanism', 'evidence', 'reachable_in_live_2p_match', 'reachability_argument', 'produces_this_exact_overlay', 'introduced_by', 'repro_idea', 'fix_shape', 'confidence'],
}

const LANE_SCHEMA = {
  type: 'object',
  properties: {
    lane: { type: 'string' },
    findings: { type: 'array', items: FINDING },
    ruled_out: { type: 'array', items: { type: 'object', properties: { hypothesis: { type: 'string' }, why: { type: 'string' }, evidence: { type: 'string' } }, required: ['hypothesis', 'why', 'evidence'] } },
    console_strings: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, text: { type: 'string' }, at: { type: 'string' } }, required: ['path', 'text', 'at'] } },
    not_checked: { type: 'array', items: { type: 'string' } },
  },
  required: ['lane', 'findings', 'ruled_out', 'not_checked'],
}

const VERDICT = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['CONFIRMED', 'PLAUSIBLE', 'REFUTED'] },
    cited_lines_exist: { type: 'boolean' },
    reachable_in_production: { type: 'boolean' },
    ends_in_this_overlay: { type: 'boolean' },
    broken_link: { type: 'string', description: 'the first causal link that fails, or none' },
    reasoning: { type: 'string' },
    corrected_mechanism: { type: 'string' },
  },
  required: ['verdict', 'cited_lines_exist', 'reachable_in_production', 'ends_in_this_overlay', 'broken_link', 'reasoning'],
}

phase('Hunt')
const results = await pipeline(
  LANES,
  (lane) => agent(`${COMMON}\n\n${lane.prompt}`, { label: `hunt:${lane.key}`, phase: 'Hunt', schema: LANE_SCHEMA }),
  (laneResult, lane) => {
    if (!laneResult) return { lane: lane.key, dead: true }
    const toVerify = laneResult.findings.filter((f) => f.severity !== 'LOW')
    return parallel(toVerify.map((f) => () =>
      agent(`${COMMON}\n\nYOUR JOB IS DIFFERENT FROM THE HUNTERS': adversarially VERIFY one finding from lane "${lane.key}". Default to REFUTED unless you confirm every link from the code yourself. Open every cited file:line and check the quote is really there; walk each causal link; check it is reachable in a live 2-player match on the PRODUCTION build (not a test seam, not HAZARD_SPAWN_ENABLED, not ?worker=1 unless production defaults to it); check it truly ends in the CONNECTION LOST overlay rather than a different symptom. Name the first link that breaks.\n\nFINDING:\n${JSON.stringify(f, null, 2)}`,
        { label: `verify:${lane.key}:${f.id}`, phase: 'Verify', schema: VERDICT })
        .then((v) => ({ ...f, lane: lane.key, verification: v }))
    )).then((verified) => ({ ...laneResult, verified: verified.filter(Boolean), unverified_low: laneResult.findings.filter((f) => f.severity === 'LOW') }))
  },
)

const dead = results.filter((r) => !r || r.dead)
if (dead.length) log(`LANES THAT RETURNED NOTHING (must be run by hand): ${dead.map((r) => (r ? r.lane : '?')).join(', ')}`)
const live = results.filter((r) => r && !r.dead)
const droppedLow = live.reduce((n, r) => n + (r.unverified_low ? r.unverified_low.length : 0), 0)
if (droppedLow) log(`${droppedLow} LOW finding(s) reported but NOT adversarially verified`)

phase('Critic')
const critic = await agent(`${COMMON}\n\nYOU ARE THE COMPLETENESS CRITIC for this hunt. Five lanes (transport, wire, exceptions, load, coverage-history) reported below with their findings, verdicts, ruled_out lists and not_checked lists. Do NOT repeat their work. Answer: which paths to "peerCount()===0 or hostLost during PLAYING" did NO lane examine? Which ruled_out verdicts rest on reasoning you can break by opening the code? Which not_checked items actually matter? Is there a mechanism OUTSIDE the code — the owner closing/reloading/backgrounding a tab, a laptop sleeping, browser tab throttling / discarding of a background tab, Nostr relay loss, TURN/ICE failure (see TURN_SETUP.md and RELAY_HEALTH.md) — that fits the report better than any code finding, and what evidence would discriminate them? Check what you claim in the code. End with the 3 cheapest discriminating experiments, most decisive first.\n\nLANE RESULTS:\n${JSON.stringify(live, null, 1).slice(0, 180000)}`,
  { label: 'critic', phase: 'Critic', schema: {
    type: 'object',
    properties: {
      unexamined_paths: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, why_it_matters: { type: 'string' }, evidence: { type: 'string' } }, required: ['path', 'why_it_matters', 'evidence'] } },
      broken_ruled_out: { type: 'array', items: { type: 'object', properties: { lane: { type: 'string' }, hypothesis: { type: 'string' }, why_the_ruling_fails: { type: 'string' } }, required: ['lane', 'hypothesis', 'why_the_ruling_fails'] } },
      non_code_explanations: { type: 'array', items: { type: 'object', properties: { explanation: { type: 'string' }, fit: { type: 'string' }, discriminator: { type: 'string' } }, required: ['explanation', 'fit', 'discriminator'] } },
      experiments: { type: 'array', items: { type: 'string' } },
    },
    required: ['unexamined_paths', 'broken_ruled_out', 'non_code_explanations', 'experiments'],
  } })

return { lanes: live, dead_lanes: dead.map((r) => (r ? r.lane : '?')), critic }
