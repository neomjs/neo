---
id: 9888
title: Autonomous CI Failure Triaging via Swarm Knowledge Graph
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-11T18:14:50Z'
updatedAt: '2026-04-11T18:17:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9888'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
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


