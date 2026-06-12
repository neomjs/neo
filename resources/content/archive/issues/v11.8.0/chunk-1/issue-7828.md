---
id: 7828
title: Use crypto.randomUUID() for windowId generation
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-20T20:49:25Z'
updatedAt: '2025-11-20T20:54:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7828'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-20T20:54:28Z'
---
# Use crypto.randomUUID() for windowId generation

In `src/worker/Manager.mjs`, the `windowId` is currently generated using `new Date().getTime()`. 
This can be improved by using `crypto.randomUUID()`, providing a more robust unique identifier. 

**Proposed Change:**
Update the `windowId` config in `Neo.worker.Manager` to prefer `crypto.randomUUID()`. 
Update the JSDoc type definition to reflect that `windowId` now is a `String`.

**Files to Modify:**
- `src/worker/Manager.mjs`

## Timeline

- 2025-11-20T20:49:27Z @tobiu added the `enhancement` label
- 2025-11-20T20:49:27Z @tobiu added the `ai` label
- 2025-11-20T20:49:37Z @tobiu assigned to @tobiu
- 2025-11-20T20:53:59Z @tobiu referenced in commit `b583820` - "Use crypto.randomUUID() for windowId generation #7828"
- 2025-11-20T20:54:28Z @tobiu closed this issue

