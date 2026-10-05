# S195 PROGRESS — net-delta (A compression + B delta snapshots + N18(d) entropy toast)

## NEXT STEP (exact)
- DONE: A+B, item 3, mutations M1-M5. NEXT: git merge master (+npm install), re-run touched tests, then measurements (lagWaveMeasure codec columns), then final gates.
## DESIGN (decided)
- Transport boundary only. Host segments the stripped+rounded wire JSON into envelope prefix/suffix + top keys; entity arrays (all objects w/ unique id) → per-id text. Full text = concatenation (== JSON.stringify(stripWirePrevPos(msg), wireNumberReplacer), proven by test).
- Frame = page-unique fid (module counter). Delta vs the peer's last ACKED fid (host ring 32); keyframe = delta vs empty base. Newline-delimited text: header JSON, prefix, suffix, raw segments.
- Binary Trystero action 'snap' (byte0 = 0x11 text / 0x12 deflate), acks on string action 'sack' {f,z,k} targeted to sender. Joiner reconstructs the FULL STRING and feeds handleRawMessage → byte-identical by construction.
- Compression only when the peer's ack says z=1 (DecompressionStream present) → fallback uncompressed, no refusal.
- Handles without snapAction (test fakes / SNAPSHOT_CODEC off) use the legacy string path.

## Log
- worktree created from master c45818cb; npm install OK; lag harness (lagWaveMeasure.test.ts, scripts/lag/*) copied verbatim from s195/lag 4eeee226 (identical files → no merge conflict).
- MUTATIONS (each reverted, each turned a test RED on an assertion, not a compile error): M1 delta base = last SENT not last ACKED → transport burst + oracle red; M2 dup/old-frame gate removed → dup test red; M3 order never sent → reorder unit red; M4 toast wave gate removed → late-joiner negative red; M5 removal not applied to the base map → removal invariant red (first attempt was a compile error in the test — invalid, redone).
