---
id: 6500
title: 'layout.Base: set()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-26T19:30:30Z'
updatedAt: '2025-02-26T19:31:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6500'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-26T19:31:47Z'
---
# layout.Base: set()

* In case we want to change multiple layout configs in parallel (especially inside a flexbox layout), this will trigger multiple updates on the related container
* So, `set()` should flag the container with `silentVdomUpdate`, do all OPs (parent call) and then trigger the update if needed.

## Timeline

- 2025-02-26T19:30:30Z @tobiu added the `enhancement` label
- 2025-02-26T19:30:30Z @tobiu assigned to @tobiu
- 2025-02-26T19:31:27Z @tobiu referenced in commit `9ba2752` - "layout.Base: set() #6500"
- 2025-02-26T19:31:47Z @tobiu closed this issue

