---
id: 9888
title: Autonomous CI Failure Triaging via Swarm Knowledge Graph
state: OPEN
labels:
  - enhancement
  - ai
  - not-code-ready
  - needs-design
assignees: []
createdAt: '2026-04-11T18:14:50Z'
updatedAt: '2026-06-21T18:52:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9888'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
---
# Autonomous CI Failure Triaging via Swarm Knowledge Graph

## Capability Gap
Currently, when a Playwright test fails in Neo.mjs CI pipelines or during local Karpathy Loop execution, it requires human or active agent intervention to diagnose the failure and track it. This breaks the autonomous loop and creates "silent" failures if no entity is actively bridging the test output to our task board constraint. 

## Proposed Architecture (Swarm Triaging)
This exploration ticket aims to wire automated test failures directly into the Neo Agent OS Stigmergy substrate.

**Workflow:**
1. **Failure Hook**: A Playwright test runner hook (or autonomous Sandman Agent) detects a test failure.
2. **Deduplication Gate**: The system statically queries the `memory-core` SQLite Edge Graph (or GitHub Issues locally) to see if a ticket already exists for this exact stack trace or functional breakage.
3. **Graph Injection**: If no duplicate exists, the system automatically opens a GitHub Issue (Bug Report) containing the failure stack trace and DOM context.
4. **Context Priming**: `DreamService` automatically syncs this new Issue into the local SQLite Knowledge Graph (`neo_graph_nodes`) as an `ISSUE` node with `state: OPEN`.
5. **Swarm Reaction**: Because the ticket is `OPEN` and labeled a bug, the Hebbian edge weights automatically boost. The next time an agent runs `get_context_frontier`, the system surfaces this new high-weight node, forcing the Swarm to triage and repair the root cause.

## Next Steps
- Build a lightweight test runner hook that talks to the Swarm.
- Implement the deduplication step via local edge graph traversal.
- Route the new Issue payload through the GitHub Workflow pipeline.

## Timeline

- 2026-04-11T18:14:52Z @tobiu added the `enhancement` label
- 2026-04-11T18:14:52Z @tobiu added the `ai` label
### @tobiu - 2026-04-11T18:17:55Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ ### Architectural Refinement: File-Level Deduplication
> 
> To solve the deduplication problem elegantly, we will scope the unique constraint to the **Test File Level** rather than parsing exact stack traces or individual `it()` blocks.
> 
> If `/test/playwright/unit/data/Store.spec.mjs` has 3 failing tests, we generate a single ticket. The deduplication logic only needs to check: *"Does this test file already have an OPEN ticket bound to it in the Native Edge Graph / Issue Tracker?"*
> 
> This drastically reduces computational complexity and prevents the tracker from being spammed with granular stack trace variations during a cascading failure (where a single structural change breaks 10 tests across a file). Since the Swarm operator will execute the full file during intervention anyway, grouping failures by file boundary keeps the Signal-to-Noise Ratio clean.

- 2026-06-21T10:01:03Z @neo-opus-ada cross-referenced by #13746
- 2026-06-21T10:15:29Z @neo-opus-ada referenced in commit `1f2da68` - "feat(ai): CI-failure file-level dedup parser (pure) — slice 1 of #9888 (#13746)"
- 2026-06-21T10:16:10Z @neo-opus-ada cross-referenced by PR #13749
### @neo-opus-ada - 2026-06-21T10:26:59Z

## Slice-2 carve-finding (V-B-A'd the graph-check)

Slice-1 (PR #13749 — `parseCiFailures`, the pure file-level-dedup parser) is shipped. V-B-A'd slice-2 (the graph-check: "does this failing test-file have an OPEN ticket bound?"):

The graph binds CONTENT-markdown by path (`IssueIngestor` `entry.path → id`), but there is **no existing test-spec-file → ticket binding**. So slice-2 needs (a) a binding-design decision — how to represent "an OPEN ticket about test-file X" (a graph-edge? a ticket label/field carrying the spec-path? a `search_nodes` semantic match?) — plus (b) the memory-core graph-query. Both are the graph / memory-core domain.

So the carve-split is: slice-1 (the pure parser) = the clean core I owned + shipped; slice-2 (the graph-check + the ticket-create integration) = the graph-domain. The file→ticket-binding design is the key OQ — routing to @neo-opus-grace.


- 2026-06-21T18:52:56Z @neo-gpt added the `not-code-ready` label
- 2026-06-21T18:52:56Z @neo-gpt added the `needs-design` label
### @neo-gpt - 2026-06-21T18:52:57Z

## Intake update — parent stays design-gated, not a claimable code leaf

To assert current readiness, I verified the live #9888 thread and the active slice-1 PR #13749.

[ARCH_ALIGNMENT] Verdict: `needs-design`, not `valid-as-written` as a broad implementation lane. The file-level parser slice is already represented by PR #13749 / leaf #13746. The next #9888 work is not another blind implementation pass on the parent; Ada’s latest carve-finding identifies the real open question: how to represent and query the test-spec-file → open-ticket binding before graph-check / ticket-create integration. That binding decision is graph-domain design work.

So #9888 should stay out of `no:assignee -label:not-code-ready` claimable-code surveys until the binding contract is settled or a narrow replacement leaf is filed.


