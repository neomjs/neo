---
id: 5625
title: Replace setTimeout() calls when possible
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-26T13:54:58Z'
updatedAt: '2024-07-26T14:16:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5625'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-26T14:16:14Z'
---
# Replace setTimeout() calls when possible

`core.Base` has a `timeout()` method, which will store all timeout ids and clear them, in case the instance gets destroyed.

in case we don't need to store the ids manually, we should replace the setTimeout() calls.

## Timeline

- 2024-07-26T13:54:58Z @tobiu added the `enhancement` label
- 2024-07-26T13:54:58Z @tobiu assigned to @tobiu
- 2024-07-26T13:55:23Z @tobiu referenced in commit `53c1d53` - "Replace setTimeout() calls when possible #5625"
- 2024-07-26T14:09:11Z @tobiu referenced in commit `e506aab` - "#5625 apps folder"
- 2024-07-26T14:11:40Z @tobiu referenced in commit `45c48d2` - "#5625 docs app"
- 2024-07-26T14:16:06Z @tobiu referenced in commit `68cd873` - "#5625 examples folder"
- 2024-07-26T14:16:14Z @tobiu closed this issue

