#!/usr/bin/env node
/**
 * close-priority.cjs — mark one PDCA priority complete in .claude/session-state.json.
 *
 * Read-modify-write at run time (preserves concurrent hook counters; the project rule).
 * Updates ONE priority by id (so sibling priorities + their verbose check_method are never
 * re-transcribed), flips the next priority to in_progress, APPENDS the reflexion entry, and
 * sets the top-level checkpoint / token / status fields.
 *
 * Usage: node scripts/close-priority.cjs <descriptor.json>
 *   descriptor = { priorityId, checkpoint, tokens, pct, checkMethod, reflexion,
 *                  nextPriorityId?, sessionStatus? }
 */
const fs = require('fs');
const path = require('path');

const statePath = path.join(__dirname, '..', '.claude', 'session-state.json');
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const s = JSON.parse(fs.readFileSync(statePath, 'utf8'));

const pr = (s.priorities || []).find((p) => p.id === d.priorityId);
if (!pr) {
  console.error('priority not found:', d.priorityId);
  process.exit(1);
}
pr.status = 'completed';
pr.phase = 'ACT';
pr.check_completed = true;
pr.checkpoint_commit = d.checkpoint;
pr.real_context_tokens_at_close = d.tokens;
pr.real_context_pct_at_close = d.pct;
pr.check_method = d.checkMethod;

if (d.nextPriorityId) {
  const np = s.priorities.find((p) => p.id === d.nextPriorityId);
  if (np) {
    np.status = 'in_progress';
    np.phase = 'DO';
  }
}

s.checkpoint_commit = d.checkpoint;
s.real_context_tokens_at_close = d.tokens;
s.real_context_pct_at_close = d.pct;
s.reflexion_entries_to_archive = [...(s.reflexion_entries_to_archive || []), d.reflexion];
if (d.sessionStatus) s.session_status = d.sessionStatus;

fs.writeFileSync(statePath, JSON.stringify(s, null, 2) + '\n');
console.log(
  'closed', d.priorityId, '-> next', d.nextPriorityId || '(none)',
  '; reflexion entries:', s.reflexion_entries_to_archive.length,
);
