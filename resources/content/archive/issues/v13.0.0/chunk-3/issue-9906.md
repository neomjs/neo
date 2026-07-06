---
id: 9906
title: 'Sub-Task: Graph Topology Linkage (TEST -> VALIDATES -> CLASS)'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - neo-gpt
createdAt: '2026-04-12T10:10:31Z'
updatedAt: '2026-07-06T13:18:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9906'
author: tobiu
commentsCount: 0
parentIssue: 9904
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
closedAt: '2026-06-06T15:37:00Z'
---
# Sub-Task: Graph Topology Linkage (TEST -> VALIDATES -> CLASS)

### Current Scope (re-triaged 2026-06-06)

As part of #9904, implement the structural evidence relation that lets the Native Edge Graph answer:

> Which durable test-file evidence validates this source node?

The accepted scope is the useful core of the old RLAIF framing: `TEST/FILE -> VALIDATES -> CLASS`.
The stale synthetic-suite reward-loop wording below is not branch authority.

### Task

Add a first-class graph relation contract that connects concrete test-file evidence to structural source nodes, so `TEST_GAP` inference and later reward / gap-downgrade flows can query evidence structurally instead of parsing `capabilityGap` strings only.

Current source anchors:

- `ai/services/graph/GapInferenceEngine.mjs` owns deterministic session-scoped `TEST_GAP` inference.
- `ai/daemons/orchestrator/services/DreamService.mjs` delegates `inferTestGapsFromSession()` into `GapInferenceEngine`.
- `ai/services/memory-core/GraphService.mjs` already supports typed graph edges via `linkNodes(source, target, relationship, weight, properties)`.
- Existing test evidence is represented by graph `FILE` nodes whose `properties.path` starts with `test/`; do not create duplicate `TEST` nodes for the same path unless the PR defines an alias/canonicalization rule.

### Contract Ledger

| Target surface | Source of authority | Required behavior | Edge case / fallback | Evidence |
|---|---|---|---|---|
| Test evidence node | Existing graph `FILE` nodes with `path.startsWith('test/')` | Treat matching test-file nodes as canonical durable test evidence for this first implementation | If a distinct `TEST` node is introduced, define aliasing to avoid duplicate test-path identity | Unit test with one test path and one class node |
| `VALIDATES` edge | `GraphService.linkNodes()` | Create `FILE -> VALIDATES -> CLASS/METHOD/COMPONENT` when deterministic test-file matching finds coverage | Missing endpoints must not create hallucinated edges; internal config hooks stay excluded | Unit test asserting edge creation and metadata |
| `TEST_GAP` closure | `GapInferenceEngine.applyGapsToNode()` | Matching durable test evidence suppresses or removes `[TEST_GAP]`; missing evidence keeps `[TEST_GAP]` | Weaker runtime evidence from #9890 may downgrade later, but does not equal permanent Playwright coverage unless explicitly promoted | Regression test for gap present vs edge-created/gap-cleared |
| Downstream consumers | #9905 / #9907 / #9890 | Later producer and reward/downgrade work consumes this relation instead of inventing parallel gap state | #9890 is adjacent and human-assigned; do not overwrite it in this lane | PR body cites #9904 epic-review and this ledger |

### Out Of Scope

- Do not implement the old blind Headless WebKit / synthetic `*.spec.mjs` runner here.
- Do not implement pass/fail reward propagation here.
- Do not treat Neural Link action success as equivalent to permanent Playwright test coverage here.

### References

- Parent epic: #9904
- Epic-review artifact: https://github.com/neomjs/neo/issues/9904#issuecomment-4639343479
- Adjacent weaker-evidence lane: #9890


## Timeline

- 2026-04-12T10:10:33Z @tobiu added the `enhancement` label
- 2026-04-12T10:10:33Z @tobiu added the `ai` label
- 2026-04-12T10:10:41Z @tobiu added parent issue #9904
- 2026-04-12T10:10:49Z @tobiu cross-referenced by #9907
- 2026-06-05T17:12:16Z @neo-opus-ada cross-referenced by #9904
- 2026-06-06T03:50:34Z @neo-gpt added the `needs-re-triage` label
- 2026-06-06T13:57:40Z @neo-gpt cross-referenced by #9905
- 2026-06-06T15:13:14Z @neo-gpt cross-referenced by PR #12638
- 2026-06-06T15:46:41Z @neo-gpt cross-referenced by #12639
- 2026-06-06T16:24:08Z @neo-opus-grace cross-referenced by PR #12643
- 2026-06-06T21:37:14Z @neo-gpt cross-referenced by #9992
- 2026-06-22T00:29:12Z @neo-gpt cross-referenced by #9890
- 2026-06-22T01:14:47Z @neo-opus-grace cross-referenced by PR #13841

