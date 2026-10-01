# S193 PROGRESS — s193/carry-fwd (LOW carry-forwards)

Branch `s193/carry-fwd` from master 11d86a3 (deploy #18, PROTOCOL 58). Worktree `.claude/worktrees/s193-carry-fwd`.
Not the merge owner: never push, never touch master, never edit PROTOCOL_VERSION.

## Items
1. T11 joiner repair numbers — DONE (no bump: render-only, no wire field)
2. carry CF-1 (Voltkin mixed-weld carry) — todo
3. carry CF-2 (census 'later in same function' false-pass) — todo
4. net R-2 (hidden tab never samples host absence) — todo
5. audio A3 (iOS 'interrupted') — todo
6. lobby4 L2 (dynamic-import tripwire hole) — todo

## Log
- worktree created at 11d86a3, npm install exit 0.
- item 1 DONE: damageNumbers derives one green per structure on a peer (shape rises + bank falls, excluding a structure that lost a connector this frame or had a host-recorded break); host record keys gain `b:`. Test repairHealNumberJoiner.test.ts (5) via HostSync→ClientSync→applyNetSnapshot. Mutants: no derivation RED 2/5, no sever check RED 1/5, no `b:` keys RED 3/9.
- NEXT: item 2 CF-1 — read severWithCarry candidates (damage.ts ~598) + canon §2 CARRY-1.
