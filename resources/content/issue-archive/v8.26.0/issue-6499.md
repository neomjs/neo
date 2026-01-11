---
id: 6499
title: 'vdom.Helper: createDeltas() => same node check via compentId flag'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-02-26T19:23:43Z'
updatedAt: '2025-02-26T19:51:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6499'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-26T19:51:06Z'
---
# vdom.Helper: createDeltas() => same node check via compentId flag

* I just noticed that in case we update a `TabContainer` with a depth of 1, we get deltas for the 3 child items (bar, strip, content container) to move to the same indexes
* Nothing bad will happen, since they stay at the same spot (no-op)
* But still, those deltas should not exist in the first place, which we can resolve via enhancing the same node check

## Timeline

- 2025-02-26T19:23:43Z @tobiu added the `bug` label
- 2025-02-26T19:23:43Z @tobiu assigned to @tobiu
- 2025-02-26T19:24:18Z @tobiu referenced in commit `2585b12` - "vdom.Helper: createDeltas() => same node check via compentId flag #6499"
- 2025-02-26T19:28:02Z @tobiu closed this issue
### @tobiu - 2025-02-26T19:49:54Z

I need to reopen this one, since the new check needs to exclude non-set componentId flags (both sides undefined)

- 2025-02-26T19:49:54Z @tobiu reopened this issue
- 2025-02-26T19:50:56Z @tobiu referenced in commit `f494eb9` - "vdom.Helper: createDeltas() => same node check via componentId flag #6499"
- 2025-02-26T19:51:06Z @tobiu closed this issue

