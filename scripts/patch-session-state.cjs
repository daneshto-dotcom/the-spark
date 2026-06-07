#!/usr/bin/env node
/**
 * patch-session-state.cjs — race-safe top-level patcher for .claude/session-state.json.
 *
 * Reads the CURRENT session-state at execution time, shallow-merges the top-level keys
 * from the patch file (arrays/objects in the patch REPLACE the existing value), and writes
 * back with stable 2-space indent. Read-modify-write at run time preserves any concurrent
 * hook-written counters (e.g. tool_calls_session_total) instead of clobbering them with a
 * stale snapshot — the reason the project rule mandates a .cjs helper over hand-editing.
 *
 * Usage: node scripts/patch-session-state.cjs <patch.json>
 */
const fs = require('fs');
const path = require('path');

const statePath = path.join(__dirname, '..', '.claude', 'session-state.json');
const patchPath = process.argv[2];
if (!patchPath) {
  console.error('usage: node scripts/patch-session-state.cjs <patch.json>');
  process.exit(1);
}

const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const patch = JSON.parse(fs.readFileSync(patchPath, 'utf8'));
for (const [k, v] of Object.entries(patch)) state[k] = v;

fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
console.log('session-state.json patched keys:', Object.keys(patch).join(', '));
