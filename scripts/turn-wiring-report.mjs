// SPARK — S158 P1: does THIS build actually have a TURN relay?
//
// ⭐ WHY THIS RUNS IN CI AT ALL. S157 diagnosed the multiplayer outage (the shipped TURN servers were
// dead, so the game ran STUN-only and any pair behind strict NAT hung on "Connecting…" forever) and
// left the owner one action: provision an account and supply three values. The failure mode of THAT
// action is silent — a misspelled secret name, or a secret added to the wrong repository, produces a
// perfectly green deploy that still ships no relay. There would be nothing to look at.
//
// So the deploy log says it out loud, in booleans. Never the values: `VITE_TURN_CREDENTIAL` is a
// password, and although a browser-side TURN credential is public by construction once it is inlined
// into the bundle (see TURN_SETUP.md § "Is it safe to put this in the game?"), printing it into a
// build log that outlives the deployment is a gratuitously worse exposure than the one we cannot
// avoid.
//
// ⚠ THIS NEVER FAILS THE BUILD. An unset relay is a supported state — `turnFromEnv()` in
// src/net/iceConfig.ts refuses a half-filled config and ships STUN-only, exactly as today. Exiting
// non-zero here would turn "the owner has not signed up yet" into a broken deploy.

/** The three names `src/net/iceConfig.ts` reads. Kept in step by src/ci.deployGate.test.ts. */
const NAMES = ['VITE_TURN_URLS', 'VITE_TURN_USERNAME', 'VITE_TURN_CREDENTIAL'];

const isSet = (name) => {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() !== '';
};

for (const name of NAMES) console.log(`[turn] ${name} set: ${isSet(name)}`);

if (NAMES.every(isSet)) {
  console.log('[turn] ✅ RELAY WILL BE SHIPPED in this build — multiplayer can cross strict networks.');
} else {
  console.log(
    '[turn] ⚠ no relay in this build — STUN-only. Players behind strict/mobile NAT will hang on ' +
      '"Connecting…". Add the three repository secrets and redeploy; see TURN_SETUP.md.',
  );
}
