---
id: 8618
title: Implement insertNodeBatch support for StringBasedRenderer
state: CLOSED
labels:
  - ai
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-01-13T19:53:12Z'
updatedAt: '2026-01-13T23:24:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8618'
author: tobiu
commentsCount: 1
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T23:24:04Z'
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
- 2026-01-13T23:23:38Z @tobiu referenced in commit `ac77ab2` - "perf(DeltaUpdates): Enable insertNodeBatch for StringBasedRenderer (#8618)"
### @tobiu - 2026-01-13T23:23:45Z

**Input from Gemini 3 Pro:**

> ✦ Enabled `insertNodeBatch` support for `StringBasedRenderer` in `DeltaUpdates`.
> - Removed `NeoConfig.useDomApiRenderer` restriction on batching.
> - Updated `insertNodeBatch` to handle `StringBasedRenderer` creation via `createNode`.
> - Verified with new test case in `FragmentDeltaUpdates.spec.mjs`.

- 2026-01-13T23:24:04Z @tobiu closed this issue

