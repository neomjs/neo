---
id: 2
title: Set up a CODE_OF_CONDUCT.md file
state: CLOSED
labels: []
assignees:
  - tobiu
createdAt: '2019-11-11T14:13:27Z'
updatedAt: '2019-11-11T14:24:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2019-11-11T14:24:27Z'
---
# Set up a CODE_OF_CONDUCT.md file

and add content

## Timeline

- 2019-11-11T14:13:27Z @tobiu assigned to @tobiu
- 2019-11-11T14:15:22Z @tobiu referenced in commit `7ed13cc` - "Set up a CODE_OF_CONDUCT.md file #2"
- 2019-11-11T14:16:49Z @tobiu referenced in commit `f1b64f0` - "Set up a CODE_OF_CONDUCT.md file #2: fixed the broken source reference link"
- 2019-11-11T14:22:01Z @tobiu referenced in commit `c4854d0` - "Set up a CODE_OF_CONDUCT.md file #2: added a contact email address."
### @tobiu - 2019-11-11T14:24:27Z

done.

- 2019-11-11T14:24:27Z @tobiu closed this issue
- 2023-01-01T15:27:46Z @Dinkh referenced in commit `136da52` - "Merge pull request #2 from Dinkh/Dinkh-patch-NeoFirst

Added Neo.first() for debugging purposes."
- 2026-01-28T15:29:32Z @tobiu cross-referenced by #8899
- 2026-04-12T08:25:03Z @tobiu cross-referenced by PR #9897
- 2026-04-18T20:53:05Z @tobiu cross-referenced by PR #10071
- 2026-04-19T12:42:53Z @tobiu cross-referenced by PR #10098
- 2026-04-20T11:32:44Z @tobiu cross-referenced by PR #10122
- 2026-04-21T17:03:02Z @tobiu cross-referenced by #9999
- 2026-04-21T21:06:49Z @tobiu cross-referenced by PR #10167
- 2026-04-21T23:19:24Z @tobiu cross-referenced by #10172
- 2026-04-22T18:47:14Z @neo-opus-ada cross-referenced by PR #10193
- 2026-04-22T19:37:53Z @neo-opus-ada cross-referenced by PR #10198
- 2026-04-22T20:46:18Z @neo-opus-ada cross-referenced by PR #10205
- 2026-04-23T12:01:29Z @neo-opus-ada cross-referenced by #10231
- 2026-04-24T11:14:19Z @neo-opus-ada cross-referenced by #10294
- 2026-04-24T20:30:49Z @neo-opus-ada cross-referenced by PR #10306
- 2026-04-24T23:19:50Z @neo-opus-ada cross-referenced by PR #10308
- 2026-04-25T02:55:41Z @neo-opus-ada cross-referenced by PR #10317
- 2026-04-25T19:12:39Z @neo-opus-ada cross-referenced by PR #10331
- 2026-04-26T13:32:10Z @neo-opus-ada cross-referenced by PR #10373
- 2026-04-26T15:51:32Z @neo-opus-ada cross-referenced by PR #10379
- 2026-04-26T16:26:23Z @neo-opus-ada cross-referenced by PR #10381
- 2026-04-26T18:58:08Z @neo-opus-ada cross-referenced by PR #10387
- 2026-04-26T22:26:21Z @neo-opus-ada cross-referenced by PR #10397
- 2026-04-27T06:17:59Z @neo-opus-ada cross-referenced by #10402
- 2026-04-27T07:46:17Z @neo-opus-ada cross-referenced by PR #10404
- 2026-04-27T09:31:39Z @neo-opus-ada cross-referenced by PR #10409
- 2026-04-27T10:41:30Z @neo-opus-ada cross-referenced by PR #10411
- 2026-04-27T12:47:03Z @neo-opus-ada cross-referenced by PR #10423
- 2026-04-28T10:41:52Z @neo-opus-ada cross-referenced by #10469
- 2026-04-30T20:47:08Z @neo-opus-ada cross-referenced by PR #10536
- 2026-04-30T23:02:35Z @neo-opus-ada cross-referenced by PR #10544
- 2026-04-30T23:12:06Z @neo-opus-ada cross-referenced by PR #10541
- 2026-05-01T09:27:08Z @neo-opus-ada cross-referenced by #10564
- 2026-05-01T11:42:29Z @neo-opus-ada cross-referenced by #10572
- 2026-05-01T11:53:08Z @neo-opus-ada cross-referenced by PR #10573
- 2026-05-02T10:15:11Z @neo-opus-ada cross-referenced by #10611
- 2026-05-02T10:29:30Z @neo-opus-ada cross-referenced by #10615
- 2026-05-02T23:24:20Z @neo-gpt cross-referenced by PR #10619
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
- 2026-05-05T18:26:43Z @neo-opus-ada cross-referenced by #10772
- 2026-05-05T19:30:03Z @neo-opus-ada cross-referenced by #10494
- 2026-05-05T20:08:23Z @neo-opus-ada cross-referenced by #10776
- 2026-05-06T16:10:45Z @neo-gpt cross-referenced by #10824
- 2026-05-06T16:14:34Z @neo-opus-ada cross-referenced by #10826
- 2026-05-06T17:20:57Z @neo-opus-ada cross-referenced by PR #10836
- 2026-05-07T10:17:54Z @neo-opus-ada cross-referenced by PR #10888
- 2026-05-07T19:34:55Z @neo-opus-ada cross-referenced by #10924
- 2026-05-08T20:41:22Z @neo-opus-ada cross-referenced by PR #10989
- 2026-05-09T10:21:58Z @neo-opus-ada cross-referenced by #11005
- 2026-05-09T10:42:52Z @neo-opus-ada cross-referenced by PR #11007
- 2026-05-09T17:16:22Z @neo-opus-ada cross-referenced by #11028
- 2026-05-09T18:33:32Z @neo-opus-ada cross-referenced by PR #11041
- 2026-05-10T13:35:28Z @neo-opus-ada cross-referenced by #11110
- 2026-05-10T21:03:19Z @neo-opus-ada cross-referenced by PR #11153
- 2026-05-10T23:53:23Z @neo-opus-ada cross-referenced by PR #11164
- 2026-05-11T00:58:57Z @neo-opus-ada cross-referenced by #11177
- 2026-05-11T01:16:53Z @neo-opus-ada cross-referenced by PR #11178
- 2026-05-11T05:09:04Z @neo-opus-ada cross-referenced by #11182
- 2026-05-11T08:50:42Z @neo-opus-ada cross-referenced by PR #11194
- 2026-05-11T12:50:42Z @neo-opus-ada cross-referenced by #11202
- 2026-05-11T17:11:08Z @neo-opus-ada cross-referenced by PR #11223
- 2026-05-12T12:08:41Z @neo-opus-ada cross-referenced by PR #11261
- 2026-05-12T23:05:24Z @neo-opus-ada cross-referenced by PR #11277
- 2026-05-12T23:26:17Z @neo-opus-ada cross-referenced by PR #11278
- 2026-05-13T08:10:40Z @neo-opus-ada cross-referenced by PR #11294
- 2026-05-13T11:08:45Z @neo-opus-ada cross-referenced by PR #11300
- 2026-05-13T11:41:19Z @neo-opus-ada cross-referenced by PR #11302
- 2026-05-13T11:52:18Z @neo-opus-ada cross-referenced by PR #11303
- 2026-05-13T19:57:54Z @tobiu referenced in commit `53e7034` - "feat(agents): enforce Progressive Disclosure via three substrate-mutation gates (#10837) (#11303)

Adds three mechanical gates against bloated skill rules in always-loaded substrate:

- AGENTS.md §21: new `create-skill` row (trigger: before creating OR modifying
  any `.agents/skills/**/*.md` files). Sits alongside `turn-memory-pre-flight`
  (load-runtime-effect dimension); `create-skill` covers skill-shape dimension
  (Map vs World Atlas, frontmatter, structure).
- pull-request-workflow.md §1.1: adds explicit default-disposition sentence.
  `compress-to-trigger` is now the strict default for new rules; `keep` slot
  requires per-turn-frequency + irreversibility justification (§0 / §22 class).
- pr-review-guide.md §7.7: new anti-pattern row rejecting substantive rule
  bodies added directly to always-loaded skill substrate (Progressive
  Disclosure violation; proactive companion `/create-skill`).

Substrate-accretion math: ~+1.7KB total (4 net new lines), of which ~330B lands
in always-loaded AGENTS.md and the rest in skill-conditional `references/`
payloads. Net-expansion now is preventive against linear bloat across future
substrate iterations — each gate mechanically rejects rule-body-in-Map regressions.

Note on AC interpretation: ticket AC #2 specifies pr-review-guide.md §7.6 but
§7.6 is the CI/Security Checks Audit pointer (mechanical, one sentence). The
canonical anti-pattern table is §7.7. Placed the new row in §7.7 to match the
existing structure and adjacent anti-patterns.

Co-authored-by: tobiu <tobiasuhlig78@gmail.com>"
- 2026-05-15T17:47:43Z @neo-gpt cross-referenced by #11430
- 2026-05-15T18:04:28Z @neo-opus-ada cross-referenced by PR #11432
- 2026-05-15T18:59:33Z @neo-opus-ada cross-referenced by PR #11436
- 2026-05-16T14:21:54Z @neo-opus-ada cross-referenced by PR #11462
- 2026-05-16T14:30:15Z @neo-opus-ada cross-referenced by PR #11461

