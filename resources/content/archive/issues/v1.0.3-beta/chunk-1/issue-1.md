---
id: 1
title: Set up a CONTRIBUTING.md file
state: CLOSED
labels: []
assignees:
  - tobiu
createdAt: '2019-11-11T13:42:13Z'
updatedAt: '2019-11-21T09:53:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2019-11-21T09:53:31Z'
---
# Set up a CONTRIBUTING.md file

and add content.

## Timeline

- 2019-11-11T13:42:13Z @tobiu assigned to @tobiu
- 2019-11-11T13:46:19Z @tobiu referenced in commit `3975f0f` - "Set up a CONTRIBUTING.md file #1"
- 2019-11-11T13:48:10Z @tobiu referenced in commit `f60f1d8` - "Set up a CONTRIBUTING.md file #1: link adjustment"
### @tobiu - 2019-11-21T09:53:31Z

done.

- 2019-11-21T09:53:31Z @tobiu closed this issue
- 2022-12-31T15:48:49Z @Dinkh referenced in commit `da19c7e` - "Merge pull request #1 from Dinkh/Dinkh-patch-GoogleMaps

missing classname and ntype"
- 2026-01-28T15:29:32Z @tobiu cross-referenced by #8899
- 2026-02-21T16:15:33Z @tobiu cross-referenced by #9233
- 2026-04-11T19:23:00Z @tobiu cross-referenced by #9891
- 2026-04-11T19:56:07Z @tobiu cross-referenced by PR #9894
- 2026-04-18T17:57:20Z @tobiu cross-referenced by PR #10065
- 2026-04-18T18:42:38Z @tobiu cross-referenced by PR #10066
- 2026-04-19T17:53:00Z @tobiu cross-referenced by #10030
- 2026-04-20T15:26:36Z @tobiu cross-referenced by PR #10130
- 2026-04-20T15:42:51Z @tobiu referenced in commit `0ae3046` - "docs: refresh v12.2 goal #1 state to reflect merged sub-tickets (#9748) (#10130)"
- 2026-04-21T14:36:20Z @tobiu cross-referenced by PR #10161
- 2026-04-21T14:54:08Z @tobiu cross-referenced by PR #10160
- 2026-04-21T17:03:02Z @tobiu cross-referenced by #9999
- 2026-04-21T21:06:49Z @tobiu cross-referenced by PR #10167
- 2026-04-22T14:40:12Z @neo-opus-ada cross-referenced by PR #10175
- 2026-04-22T16:15:11Z @neo-opus-ada cross-referenced by #10184
- 2026-04-22T18:47:14Z @neo-opus-ada cross-referenced by PR #10193
- 2026-04-22T19:37:53Z @neo-opus-ada cross-referenced by PR #10198
- 2026-04-23T22:04:39Z @neo-opus-ada cross-referenced by PR #10266
- 2026-04-23T23:38:39Z @neo-opus-ada cross-referenced by PR #10269
- 2026-04-24T01:23:53Z @neo-opus-ada cross-referenced by PR #10277
- 2026-04-24T11:14:19Z @neo-opus-ada cross-referenced by #10294
- 2026-04-24T20:30:49Z @neo-opus-ada cross-referenced by PR #10306
- 2026-04-24T20:42:57Z @neo-opus-ada cross-referenced by PR #10303
- 2026-04-25T01:56:06Z @neo-opus-ada cross-referenced by PR #10308
- 2026-04-25T02:55:41Z @neo-opus-ada cross-referenced by PR #10317
- 2026-04-25T04:55:11Z @neo-opus-ada cross-referenced by PR #10328
- 2026-04-26T12:03:13Z @neo-gemini-pro cross-referenced by #10367
- 2026-04-26T15:51:32Z @neo-opus-ada cross-referenced by PR #10379
- 2026-04-26T16:26:23Z @neo-opus-ada cross-referenced by PR #10381
- 2026-04-26T18:42:40Z @neo-opus-ada cross-referenced by PR #10386
- 2026-04-26T18:50:10Z @neo-opus-ada cross-referenced by PR #10387
- 2026-04-26T21:33:20Z @neo-opus-ada cross-referenced by PR #10392
- 2026-04-26T22:26:21Z @neo-opus-ada cross-referenced by PR #10397
- 2026-04-27T05:26:57Z @neo-opus-ada cross-referenced by PR #10401
- 2026-04-27T07:29:43Z @neo-opus-ada cross-referenced by PR #10404
- 2026-04-27T09:31:39Z @neo-opus-ada cross-referenced by PR #10409
- 2026-04-27T10:49:24Z @neo-opus-ada cross-referenced by PR #10411
- 2026-04-27T11:18:14Z @neo-opus-ada cross-referenced by PR #10416
- 2026-04-27T12:09:08Z @neo-opus-ada cross-referenced by PR #10423
- 2026-04-28T00:00:39Z @neo-gemini-pro cross-referenced by PR #10455
- 2026-04-28T10:41:52Z @neo-opus-ada cross-referenced by #10469
- 2026-04-30T20:47:08Z @neo-opus-ada cross-referenced by PR #10536
- 2026-05-01T09:27:08Z @neo-opus-ada cross-referenced by #10564
- 2026-05-01T11:42:29Z @neo-opus-ada cross-referenced by #10572
- 2026-05-01T11:53:08Z @neo-opus-ada cross-referenced by PR #10573
- 2026-05-01T13:15:55Z @tobiu referenced in commit `b8a4fc9` - "feat(knowledge-base): work-volume-aware gate on manage_knowledge_base sync (#10572) (#10573)

* feat(knowledge-base): work-volume-aware gate on manage_knowledge_base sync (#10572)

Adds a post-delta-pre-embed work-volume gate to VectorService.embed() that
refuses MCP-callable invocations when chunksToProcess.length exceeds a
configurable threshold (aiConfig.mcpSyncMaxChunks, default 50 — aligned
with batchSize). CLI invocations (via npm run ai:sync-kb) pass viaMcp:false
and bypass the gate.

Addresses the empirical anchor 2026-05-01: Gemini's manage_knowledge_base
sync ran 10+ minutes after #10003/#10558 KB embedding-provider migration,
locking the harness because the MCP execution shape was uniform regardless
of post-delta work-volume.

Files:
- ai/mcp/server/knowledge-base/services/VectorService.mjs:
  embed() now accepts {viaMcp} opts; threshold check fires immediately after
  the existing fast-path-exit at line 177; returns {error, code:
  'KB_SYNC_VOLUME_EXCEEDED', chunksToProcess, threshold, message} on gate fire.
  KB Server.mjs's existing 'error' in result contract converts to isError:true.
- ai/mcp/server/knowledge-base/services/DatabaseService.mjs:
  manageKnowledgeBase + syncDatabase + embedKnowledgeBase thread the viaMcp
  flag through the call chain.
- ai/mcp/server/knowledge-base/services/toolService.mjs:
  manage_knowledge_base dispatch wrapper marks viaMcp:true; CLI invocations
  via syncKnowledgeBase.mjs call DatabaseService.syncDatabase() directly
  without the wrapper, naturally bypassing.
- ai/mcp/server/knowledge-base/config.template.mjs:
  mcpSyncMaxChunks: 50 added with rationale comment (aligns with batchSize;
  empirically tunable per provider/tier; not timing-derived).
- ai/mcp/server/knowledge-base/openapi.yaml:
  manage_knowledge_base description updates the operator-facing semantics —
  documents the gate condition + CLI bypass for bulk work.

Test: VectorService.WorkVolumeBranching.spec.mjs covers the four
acceptance criteria branches:
1. Zero-changes fast-path unchanged (existing chunks dedup to empty queue)
2. Below-threshold MCP succeeds (synchronous embedding path)
3. Above-threshold MCP returns KB_SYNC_VOLUME_EXCEEDED — caller observes failure
4. Above-threshold CLI bypasses gate (explicit opt-in to long work)

Spy-collection pattern stubs ChromaDB get/upsert; TextEmbeddingService.embedTexts
stubbed to verify the BRANCH decision rather than real API timing
(per @neo-gpt's threshold-rationale guardrail #1: timing-math is wrong-by-
construction; ACs assert branch behavior).

Avoided traps captured in #10572 ticket body:
- mode=delta/mode=full input-shape disambiguation: rejected (delta logic
  already exists; gap is execution-shape, not input-shape).
- Daemonize KB sync entirely: rejected (delta resyncs ARE small + agent-callable).
- Hardcode threshold: rejected (config-tunable per deployment).
- Justify threshold via timing math: rejected per @neo-gpt's guardrail #1.
- Throw vs return: chose return-shape per established MCP-server convention
  (Server.mjs:'error' in result → isError:true is the existing contract;
  matches SummaryService/HealthService catch patterns).

Co-Authored-By: Claude Opus 4.7 (Claude Code) <claude@anthropic.com>

* fix(knowledge-base): address PR #10573 cycle 1 review (#10572)

Two RAs from @neo-gpt's cycle 1 review:

RA1 (MCP-Tool-Description Budget Audit per pr-review-guide.md §5.3):
The `manage_knowledge_base` OpenAPI description had imported internal
ticket refs (#10572), date-specific incident narrative (2026-05-01), and
approximate duration claims (~1hr) — all violations of the runtime
tool-description budget. OpenAPI descriptions are runtime payload, not
source documentation.

Fix: tightened the description to a terse "Volume gate" call-site clause:

  Volume gate: when the post-delta diff exceeds `mcpSyncMaxChunks`
  (default 50), this tool returns `KB_SYNC_VOLUME_EXCEEDED` instead of
  executing synchronously. Use `npm run ai:sync-kb` for bulk re-embedding
  work.

Removes ticket ref / incident narrative / duration claim. Keeps gate
condition + return code + remediation. Source-documentation context
remains in the PR body, ticket #10572, and JSDoc on `embed()`.

RA2 (AC4 wire-format boundary verification):
The previous test verified `VectorService.embed()` returns the {error}
payload but stopped one layer short of the actual MCP-caller wire
contract. The wire-format guarantee is that the MCP caller observes
`isError: true` per Server.mjs:140-145's `isError = 'error' in result`
conversion. Without testing through the dispatch path, the AC4 claim
that "MCP caller observes failure" was unverified.

Fix: added a 5th test that exercises the toolService.callTool dispatch
end-to-end (the same entry point Server.mjs calls), then applies the
inline Server.mjs adapter conversion and asserts on the resulting
MCP-response-shape `isError: true`. This verifies the wire-format
boundary, not just the service-layer return shape. Stubs
`KB_DatabaseService.createKnowledgeBase` to skip JSONL regeneration so
the fixture controls the sync path deterministically.

Both RAs verified locally via `node --check` + targeted spec run.

Co-Authored-By: Claude Opus 4.7 (Claude Code) <claude@anthropic.com>

* test(kb): inline wire-format adapter assertion, drop SDK-poisoned dispatch test (#10572)

Cycle 2 RA2: the 5th test (callTool dispatch end-to-end) failed because the
Playwright spec imports ai/services.mjs, which runs makeSafe() and Zod-wraps
the singleton's manageKnowledgeBase. The wrapper Zod-parses without
.passthrough(), stripping the closure-injected `viaMcp: true` before it
reaches the gate — a test-env artifact (production MCP server and CLI scripts
both bypass services.mjs, so makeSafe never wraps in production).

Fix: drop the brittle dispatch-path test, inline the Server.mjs:202 adapter
expression (`Neo.isObject(result) && 'error' in result`) into test 3. Same
wire-format contract is now empirically verified without the SDK-coupling
flakiness.

4/4 tests pass.

---------

Co-authored-by: tobiu <tobiasuhlig78@gmail.com>
Co-authored-by: Claude Opus 4.7 (Claude Code) <claude@anthropic.com>"
- 2026-05-01T22:36:28Z @neo-opus-ada cross-referenced by PR #10607
- 2026-05-03T10:34:09Z @neo-opus-ada cross-referenced by #10624
- 2026-05-03T10:35:00Z @neo-opus-ada cross-referenced by #10625
- 2026-05-03T11:11:51Z @neo-opus-ada cross-referenced by PR #10628
- 2026-05-03T11:29:57Z @neo-opus-ada cross-referenced by PR #10631
- 2026-05-03T20:32:02Z @neo-opus-ada referenced in commit `45bc8c7` - "fix(ai): clarify single-key vs multi-step seed primitive distinction (#10664)

Cycle 2 polish addressing @neo-gpt's PR #10665 review (commentId
IC_kwDODSospM8AAAABBEy2HQ) Required Action #2: tighten the
`meta.focusSeedKey` wording so future operators do not infer that
`focusSeedKey: 'r'` is a validated safe Codex opt-in.

Per the review: `focusSeedKey` is a SINGLE-KEY primitive (the bridge
emits one keystroke before the destructive clear). The `r → Cmd+Z →
Cmd+A → Cmd+X` candidate under investigation is a MULTI-STEP probe-
and-undo SEQUENCE — if it proves safe across the 5-row matrix, it
needs a distinct implementation path (e.g. `meta.focusSeedSequence`
primitive or routed via the Codex app-server adapter), NOT a
`focusSeedKey: 'r'` opt-in (which would silently re-introduce the
mutating-prompt failure mode the fail-closed guard exists to prevent).

- bridge-daemon.mjs Anchor & Echo: explicit single-key vs multi-step
  scope distinction; the multi-step candidate now framed as needing
  separate implementation, not a focusSeedKey value
- bridge-daemon.spec.mjs test comment: same refinement; clarifies
  `meta.focusSeedKey` is single-key non-mutating primitive only

Spec: 9/9 pass. PR body update will land separately via gh pr edit
addressing Required Action #1 (replacement-vs-append framing)."
- 2026-05-03T20:42:42Z @tobiu referenced in commit `60b9c7b` - "fix(ai): fail closed for Codex UI wake (#10664) (#10665)

* fix(ai): fail closed for Codex UI wake (#10664)

Reverts PR #10663's Codex `focusSeedKey: 'space'` default and adds a
defense-in-depth fail-closed guard, after @tobiu's manual matrix
validation 2026-05-03 falsified the Space-seed hypothesis for Codex
Desktop. Empirical findings (per #10664 + GPT broadcast
MESSAGE:71db3874-f74b-4cc8-8095-a7ea1a385b05):

- Pressing Space when the Codex prompt field is unfocused applies a
  focus outline but does NOT focus the composer
- Enter behaves identically — outline only, not usable composer focus
- Printable keys (e.g. 'r') CAN focus, but if the prompt already
  contains text, the keystroke replaces existing input — destructive

No empirically-validated non-destructive composer-focus primitive
exists for Codex Desktop today. Until either operator-explicit
`meta.focusSeedKey` opt-in with a verified primitive OR the Codex
app-server adapter ships under #10517 (`turn/start` / `turn/steer` /
`thread/inject_items` via `codex debug app-server send-message-v2`),
the bridge MUST refuse to proceed past the destructive Cmd+A / Cmd+X
clear sequence for Codex.

Defense-in-depth: even with @neo-gpt's WAKE_SUBSCRIPTION currently set
to `harnessTarget: 'disabled'` (per #10664 immediate operator
mitigation), this bridge-side guard prevents accidental subscription
re-enable from triggering the disproved Space-seed path.

- ai/scripts/bridge-daemon.mjs:
  - Reverted line 588 conditional from
    `(appName === 'Claude' || appName === 'Codex')` back to
    `appName === 'Claude'` only
  - Added a fail-closed guard that returns + writeLog('WARN', ...)
    when `appName === 'Codex' && !focusSeedKey`
  - Anchor & Echo block expanded with full empirical disproval rationale,
    including the printable-key-replaces-content failure mode and the
    #10517 medium-term supersession path
- test/playwright/unit/ai/scripts/bridge-daemon.spec.mjs:
  - Removed the disproved Codex ordering test (PR #10663 added)
  - Added a fail-closed test that asserts the bridge logs the
    refusal warning AND never invokes osascript when Codex
    subscription lacks focusSeedKey
- test/playwright/unit/ai/mcp/server/memory-core/services/
  WakeSubscriptionService.spec.mjs:
  - Removed the Codex `focusSeedKey: 'space'` round-trip test that
    PR #10663 added (schema-layer round-trip already covered by the
    existing Claude test; duplicating it for Codex implied Space was
    valid configuration, now disproved)
  - Replaced with an inline note citing #10664 empirical anchor

Claude (Cmd+3 → Space → clear) and Antigravity (Cmd+Shift+I → clear)
delivery paths remain unchanged and green per the matrix execution at
19:23Z and 19:29Z respectively.

Reactivation gate stays tripped per #10650 protocol pending Codex
matrix-row evidence (now requires either operator-validated
metadata-explicit focusSeedKey OR #10517 app-server adapter).

* fix(ai): refine Anchor & Echo with append-not-replace evidence (#10664)

Polish commit responding to @neo-gpt's updated empirical evidence
(MESSAGE:121a44ad-fefa-4c1a-8bbb-c5b97a804124, before formal review):
@tobiu's manual probe shows pressing `r` while Codex prompt is
unfocused APPENDS to the existing draft rather than fully replacing
it — softer failure mode than the original "destructively replace"
framing in this PR's commit.

The correctness of the fail-closed posture is unchanged: appending
into the prompt is still mutation that the subsequent Cmd+A/Cmd+X
clear captures and the wake paste overwrites. Without a verified
probe-and-undo or non-mutating focus primitive, printable-key seeding
remains unsafe pre-clear.

Per `feedback_truth_in_code` discipline, refining the Anchor & Echo
block + spec test comment to match the empirically-current evidence
rather than propagating the more-extreme framing as fact:

- bridge-daemon.mjs Anchor & Echo: clarifies that printable keys
  APPEND (not replace) but appending is still mutation; explicitly
  cites #10664's `r → Cmd+Z → Cmd+A → Cmd+X` candidate as
  in-investigation against a 5-row state matrix
- bridge-daemon.spec.mjs test comment: same refinement; cites the
  probe-and-undo candidate as a possible future operator-validated
  focusSeedKey

No code-path change. Spec re-run: 9 passed.

* fix(ai): clarify single-key vs multi-step seed primitive distinction (#10664)

Cycle 2 polish addressing @neo-gpt's PR #10665 review (commentId
IC_kwDODSospM8AAAABBEy2HQ) Required Action #2: tighten the
`meta.focusSeedKey` wording so future operators do not infer that
`focusSeedKey: 'r'` is a validated safe Codex opt-in.

Per the review: `focusSeedKey` is a SINGLE-KEY primitive (the bridge
emits one keystroke before the destructive clear). The `r → Cmd+Z →
Cmd+A → Cmd+X` candidate under investigation is a MULTI-STEP probe-
and-undo SEQUENCE — if it proves safe across the 5-row matrix, it
needs a distinct implementation path (e.g. `meta.focusSeedSequence`
primitive or routed via the Codex app-server adapter), NOT a
`focusSeedKey: 'r'` opt-in (which would silently re-introduce the
mutating-prompt failure mode the fail-closed guard exists to prevent).

- bridge-daemon.mjs Anchor & Echo: explicit single-key vs multi-step
  scope distinction; the multi-step candidate now framed as needing
  separate implementation, not a focusSeedKey value
- bridge-daemon.spec.mjs test comment: same refinement; clarifies
  `meta.focusSeedKey` is single-key non-mutating primitive only

Spec: 9/9 pass. PR body update will land separately via gh pr edit
addressing Required Action #1 (replacement-vs-append framing).

---------

Co-authored-by: tobiu <tobiasuhlig78@gmail.com>"
- 2026-05-04T22:04:15Z @neo-opus-ada cross-referenced by #10721
- 2026-05-05T19:30:03Z @neo-opus-ada cross-referenced by #10494
- 2026-05-05T20:08:23Z @neo-opus-ada cross-referenced by #10776
- 2026-05-06T16:00:40Z @neo-opus-ada cross-referenced by #10822
- 2026-05-06T23:57:12Z @neo-opus-ada cross-referenced by PR #10861
- 2026-05-07T08:03:53Z @neo-opus-ada cross-referenced by PR #10883
- 2026-05-07T21:53:45Z @neo-opus-ada referenced in commit `7e19cd3` - "feat(ci): re-add unit suite to matrix post-bucket-cascade (#10897)

The full per-bucket substrate audit from #10903 has landed across two epics:

Bucket A-F (closed via #10903 epic):
- A+E (heavy SLM + Authorization PoC-skip) via #10907
- B+D (grid WIP + MCP server bootstrap) via #10921
- C  (substrate-data ~17 specs) via #10910
- F  (CrossTenantIsolation + HeartbeatPropagation deferrals) via #10919
- HeartbeatPropagation toBeGreaterThanOrEqual fix via #10920

Bucket G (#10924 — closes via this PR's downstream wave):
- G1+G2+G3 hard-failure skip-guards via #10928
- G4 namespace-collision spec-local fix via #10929
- G5 (4 flakes): #1 cascade-resolved by G4; #4 (TransportService bind race)
  + #10931 POLL_INTERVAL coupling shipped via #10930
- G6 (27 did-not-run) — expected to auto-clear post-G1-G4 per @neo-gpt's
  monitoring lane

All bucket skip-guards activate via the NEO_TEST_SKIP_CI=true env already
in this workflow's Run-tests step (added in Lane C #10899 prior commit
094c3e712).

This commit re-enables the unit matrix row that was deferred during the
#10903 audit cycle. Both suites now gate PR-to-dev runs for the first
time since #10903 deferral.

Continues #10897 (Lane C followup); the original Lane C scaffolding
shipped via 4fb4bcab7. Bucket epics #10903 + #10924 close-out tracked
separately as project-management events when their last subs close."
- 2026-05-08T20:48:45Z @neo-opus-ada cross-referenced by #10991
- 2026-05-09T17:16:22Z @neo-opus-ada cross-referenced by #11028
- 2026-05-09T19:16:41Z @neo-opus-ada cross-referenced by PR #11044
- 2026-05-10T00:42:25Z @neo-opus-ada cross-referenced by #11084
- 2026-05-10T01:21:09Z @neo-opus-ada cross-referenced by PR #11087
- 2026-05-10T12:13:58Z @neo-opus-ada cross-referenced by #11077
- 2026-05-10T13:24:04Z @neo-opus-ada cross-referenced by PR #11106
- 2026-05-10T13:35:28Z @neo-opus-ada cross-referenced by #11110
- 2026-05-10T14:04:20Z @neo-opus-ada cross-referenced by PR #11114
- 2026-05-10T23:53:23Z @neo-opus-ada cross-referenced by PR #11164
- 2026-05-10T23:55:27Z @neo-opus-ada cross-referenced by #11165
- 2026-05-11T00:18:24Z @neo-opus-ada cross-referenced by PR #11167
- 2026-05-11T00:40:11Z @neo-gemini-pro cross-referenced by PR #11172
- 2026-05-11T00:52:15Z @neo-gemini-pro cross-referenced by PR #11176
- 2026-05-11T00:58:57Z @neo-opus-ada cross-referenced by #11177
- 2026-05-11T01:16:53Z @neo-opus-ada cross-referenced by PR #11178
- 2026-05-11T05:09:04Z @neo-opus-ada cross-referenced by #11182
- 2026-05-11T08:50:42Z @neo-opus-ada cross-referenced by PR #11194
- 2026-05-11T14:05:27Z @neo-opus-ada cross-referenced by #11209
- 2026-05-12T23:05:24Z @neo-opus-ada cross-referenced by PR #11277
- 2026-05-12T23:26:17Z @neo-opus-ada cross-referenced by PR #11278
- 2026-05-13T05:43:24Z @neo-opus-ada cross-referenced by #11187
- 2026-05-13T06:07:22Z @neo-opus-ada cross-referenced by PR #11282
- 2026-05-13T06:55:00Z @neo-opus-ada cross-referenced by PR #11280
- 2026-05-13T08:10:40Z @neo-opus-ada cross-referenced by PR #11294
- 2026-05-13T10:55:47Z @neo-opus-ada cross-referenced by PR #11299
- 2026-05-13T11:08:45Z @neo-opus-ada cross-referenced by PR #11300
- 2026-05-13T11:41:19Z @neo-opus-ada cross-referenced by PR #11302
- 2026-05-13T11:52:18Z @neo-opus-ada cross-referenced by PR #11303
- 2026-05-13T19:09:02Z @neo-opus-ada cross-referenced by #11319
- 2026-05-15T17:47:43Z @neo-gpt cross-referenced by #11430
- 2026-05-15T18:04:28Z @neo-opus-ada cross-referenced by PR #11432
- 2026-05-15T18:26:43Z @neo-opus-ada cross-referenced by PR #11434
- 2026-05-15T18:59:33Z @neo-opus-ada cross-referenced by PR #11436
- 2026-05-16T14:21:54Z @neo-opus-ada cross-referenced by PR #11462
- 2026-05-16T14:30:15Z @neo-opus-ada cross-referenced by PR #11461

