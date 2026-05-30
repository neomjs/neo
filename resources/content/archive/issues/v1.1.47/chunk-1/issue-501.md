---
id: 501
title: 'core.Base: destroy() => unregister'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-04-24T09:34:17Z'
updatedAt: '2020-04-24T09:34:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/501'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-04-24T09:34:41Z'
---
# core.Base: destroy() => unregister

In case an instance does get destroyed before manager.Instance got created, it should get removed from the tmp map.

edge case.

## Timeline

- 2020-04-24T09:34:17Z @tobiu added the `enhancement` label
- 2020-04-24T09:34:17Z @tobiu assigned to @tobiu
- 2020-04-24T09:34:36Z @tobiu referenced in commit `0279593` - "core.Base: destroy() => unregister #501"
- 2020-04-24T09:34:41Z @tobiu closed this issue

