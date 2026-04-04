---
id: 9674
title: 'Strategic Consciousness: The Sandman/REM Prototype'
state: OPEN
labels:
  - epic
  - ai
assignees: []
createdAt: '2026-04-04T00:02:13Z'
updatedAt: '2026-04-04T00:02:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9674'
author: tobiu
commentsCount: 0
parentIssue: 9671
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Strategic Consciousness: The Sandman/REM Prototype

## Hard Dependency
> [!WARNING]
> **This Epic CANNOT begin until Epic #9673 (Hybrid GraphRAG) is completed.**
> If Sandman is built before the Native Graph DB, it is just a naive LLM text summarizer. It *must* have the Graph DB available so it can traverse the framework topology to physically connect abstract ideas (e.g., knowing that "Issue A" and "Memory B" both intersect at `Neo.component.Base`).

## Problem
Currently, AI agents operate in "flat" sessions—once 5 previous sessions drop off the summary limit, critical strategic breakthroughs can be lost. We need a localized background process that continuously processes markdown logs, issue trackers, and memories to synthesize a prioritized "Golden Path".

## Proposed Solution
Build **REM Mode** - continuous asynchronous processing meant to mimic human subconscious problem-solving.
- The **Sandman** agent runs locally during downtime. It does not output software code.
- It processes local issue trackers, session summaries, and prior architectural documents.
- It traverses the newly built Application Engine Graph to find technical overlaps.
- It synthesizes competing priorities into curated Markdown outputs.

## Definition of Done
- A background process (`DreamService.mjs` or similar scripting) can be executed.
- Sandman successfully reads from the Memory Core and GitHub trackers.
- Sandman successfully traverses the Native Graph Database to intelligently group related concepts.
- A "Golden Path" strategic priority markdown document is generated dynamically.

## Timeline

- 2026-04-04T00:02:13Z @tobiu added the `epic` label
- 2026-04-04T00:02:13Z @tobiu added the `ai` label
- 2026-04-04T00:02:20Z @tobiu added parent issue #9671
- 2026-04-04T00:04:15Z @tobiu cross-referenced by #9662

