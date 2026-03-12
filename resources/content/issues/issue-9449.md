---
id: 9449
title: 'Epic: Modernize Data Pipeline Architecture (Parser & Normalizer)'
state: OPEN
labels:
  - epic
  - ai
  - architecture
  - core
assignees: []
createdAt: '2026-03-12T14:20:24Z'
updatedAt: '2026-03-12T14:20:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9449'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[ ] 9418 Create Data Normalizer Architecture (`Neo.data.normalizer.Base` & `Tree`)'
  - '[ ] 9419 Implement Dynamic Module Loading in `Neo.worker.Data`'
  - '[ ] 9420 Migrate Data Pipeline to Connection -> Parser -> Normalizer flow'
subIssuesCompleted: 0
subIssuesTotal: 3
blockedBy: []
blocking: []
---
# Epic: Modernize Data Pipeline Architecture (Parser & Normalizer)

### Goal
Modernize the framework's data pipeline by implementing a `Connection -> Parser -> Normalizer -> Store` flow that operates within the Data Worker. This epic tracks the architectural shift required to decouple data shaping from stores and move heavy transformation logic out of the App Worker.

### Context
To support complex data structures (like the nested JSON returned for Tree Grids) without blocking the main application logic, we need to introduce dedicated `Parser` and `Normalizer` classes. The Data Worker will dynamically load these modules via Remote Method Access (RMA) and execute them natively before sending the flattened, ready-to-use data back to the App Worker.

This Epic extracts the underlying architectural data pipeline tasks originally identified during the Tree Grid Epic (#9404).

### Sub-Tasks
- #9418
- #9419
- #9420

## Timeline

- 2026-03-12T14:20:26Z @tobiu added the `epic` label
- 2026-03-12T14:20:26Z @tobiu added the `ai` label
- 2026-03-12T14:20:26Z @tobiu added the `architecture` label
- 2026-03-12T14:20:26Z @tobiu added the `core` label
- 2026-03-12T14:21:15Z @tobiu added sub-issue #9418
- 2026-03-12T14:21:18Z @tobiu added sub-issue #9419
- 2026-03-12T14:21:22Z @tobiu added sub-issue #9420

