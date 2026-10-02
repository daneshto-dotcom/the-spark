# S194 · T9 COHERENCE — progress (`s194/coherence`)

**STATUS: IN-PROGRESS**

Owner, S194 (verbatim): *"when I placed the Soul Eater Tower level three. It did have those little sparks … But … when I
built a laser turret, it didn't … make it consistent across all built … towers … And in general, you … should have
everything more … consistent and … cohesive and mindful of each other and coherent."*

## Log
- Setup: worktree from master `0a37175e`, `git merge master` → fast-forward to `18560cd8` (amendment A2), no conflicts. `npm install` exit 0.

- C1 `b46d3e3d` — shared unit-departure rule (`src/render/coherence/unitDeparture.ts`); damageNumbers no longer prints a kill for an expiry / mass clear / fogged spot; creatureRenderer zap uses the same rule.
- C2 `6f5ea1f7` — shared unit death beat for all 28 creature types (`fx/unitDeathFx.ts` + `coherence/unitDeathRenderer.ts`, wired in main.ts), census + reach + negatives.

## Next step
Audit the TOWER family's fire/impact + Helga death + sound matrix; then perf bench + screenshots + full gates.
