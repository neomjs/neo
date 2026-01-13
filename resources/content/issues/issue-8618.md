---
id: 8618
title: Implement insertNodeBatch support for StringBasedRenderer
state: OPEN
labels:
  - ai
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-01-13T19:53:12Z'
updatedAt: '2026-01-13T19:59:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8618'
author: tobiu
commentsCount: 0
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement insertNodeBatch support for StringBasedRenderer

Currently, `DeltaUpdates.update` only enables `insertNodeBatch` optimization if `NeoConfig.useDomApiRenderer` is true.
`StringBasedRenderer` users miss out on this performance gain (sequential inserts causing multiple reflows).

**Goal:**
Update `DeltaUpdates.update` logic to allow batching for `StringBasedRenderer`.
Implement `insertNodeBatch` logic for `StringBasedRenderer` (concatenating HTML strings or creating a `DocumentFragment` from multiple HTML strings) to perform a single DOM insertion.

## Timeline

- 2026-01-13T19:53:13Z @tobiu added the `ai` label
- 2026-01-13T19:53:13Z @tobiu added the `performance` label
- 2026-01-13T19:53:13Z @tobiu added the `core` label
- 2026-01-13T19:54:53Z @tobiu added parent issue #8601
- 2026-01-13T19:59:27Z @tobiu assigned to @tobiu

