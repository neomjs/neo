---
id: 6691
title: 'container.Base: createItem() => when removing existing instances from different parents, delete potential removeDom flags'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-05-02T21:00:53Z'
updatedAt: '2025-05-02T21:01:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6691'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-05-02T21:01:15Z'
---
# container.Base: createItem() => when removing existing instances from different parents, delete potential removeDom flags

* otherwise items might not get into the vnode, assuming that moving an existing item should always show it

## Timeline

- 2025-05-02T21:00:53Z @tobiu added the `enhancement` label
- 2025-05-02T21:00:53Z @tobiu assigned to @tobiu
- 2025-05-02T21:01:07Z @tobiu referenced in commit `bb52cb1` - "container.Base: createItem() => when removing existing instances from different parents, delete potential removeDom flags #6691"
- 2025-05-02T21:01:16Z @tobiu closed this issue

