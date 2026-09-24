# PDR — S101 — Ship S100: unblock the failed TD deploy + close session

**Tier:** Micro (<10K, low-risk config/test edits) · **Unlock:** user-explicit `go` ("raise the limit to like 750 ... make sure everything works and running") · **Deliberation:** auto-waived (user-path).

## OBJECTIVE
The S100 tower-defense vertical slice (pentagram spawner → chewer swarm) was built, tested, committed, and pushed — but it **never went live**. The `Deploy to GitHub Pages` workflow for `52d822a` FAILED on the bundle-size hard gate (`check-bundle-size.mjs` exits 1 at 570.9 KiB > 560 KiB charter), so GitHub Pages never published. The live site (`spark-online.space`, CNAME → GitHub Pages) is still the S99 build with **no tower-defense at all** — which is why the owner's two pentagrams did nothing in multiplayer. The S100 E2E gating lane also failed (stale `aboveFogLayer` contract 8→10). Goal: get S100 actually deployed and green, verify the feature works end-to-end, then close the session properly.

## SCOPE
1. **Bundle charter 560 → 750 KiB** — owner directive (the cap is self-imposed, not a platform limit; gzip transfer is ~182 KiB; the gate's failure mode — silently blocking deploy — is worse than the ~3 KiB-gzip it guards). Edit `scripts/check-bundle-size.mjs` `CAP_KIB` AND the `LOCKED_DECISIONS.md` bundle clause together (the script's own contract requires both move in lockstep).
2. **E2E `aboveFogLayer` contract 8 → 10** — `e2e/fog.spec.ts:166` + the roll-call comment: S100 added `spawnerZoneRenderer` + `chewerRenderer` to the layer. Pure test-net drift.
3. **Re-verify green:** `npm run build` (tsc 0 + vite + bundle gate now passes), `npm test` (vitest 1577/1577), `npm run e2e:gating` (fog spec passes). Commit + push. **Confirm the deploy run goes green and spark-online.space serves S100.**
4. **End-to-end feature verification** (ultracode): confirm the owner's actual scenario — a real pentagram ignites a spawner → chewer spawns — works through the real placement+autobond+matcher pipeline (preview harness / dev hooks), plus an adversarial audit that every S100 subsystem is genuinely wired (not just compiling).
5. **Close session:** BACKLOG.md update (S100 shipped+deployed; deploy-gate lesson), session-state completion records + reflexion, `/handoff`.

## TESTING
- `npm run build` exit 0 with `[bundle] OK — under charter` (entry ~570.9 KiB < 750).
- `npm test` → 1577/1577 green.
- `npm run e2e:gating` → fog.spec green (aboveFogChildren=10), no other regressions.
- Deploy run for the fix commit = SUCCESS; `curl`/preview confirms the served bundle is the new hash.
- End-to-end: a placed-and-bonded 5-triangle ring registers a spawner in `world.creatureSpawners` and emits a chewer after `SPAWN_INTERVAL_TICKS`.

## CARRY-FORWARD / KNOWN
- Strict pentagram predicate (exactly-5 closed ring, every node degree 2) is **not player-visible** — same UX class as the Voltkin strict-chain note. If the owner's playtest still finds it finicky after deploy, add a build hint / consider relaxing topology (separate design decision).
- Code-split the TD render layer remains a *clean* future optimization (Phase-4 art pass touches those renderers) — no longer urgent now that the charter has real headroom.
