---
id: 669
title: App needs to know when main threads disconnect
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-06-05T05:36:21Z'
updatedAt: '2020-06-15T09:37:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/669'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-06-15T09:37:33Z'
---
# App needs to know when main threads disconnect

Not sure if there is a clean way implemented already.

todo:
Check if there are interfaces in place (PortCollection?)

If not, we can (have) to go for window.beforeunload.

## Timeline

- 2020-06-05T05:36:21Z @tobiu added the `enhancement` label
- 2020-06-05T05:36:22Z @tobiu assigned to @tobiu
- 2020-06-08T18:29:14Z @tobiu referenced in commit `f8f5442` - "#669 main.DomEvents: added an beforeUnload event listener in case the current app is using shared workers"
- 2020-06-15T06:55:55Z @tobiu cross-referenced by #734
### @tobiu - 2020-06-15T09:37:33Z

done.

- 2020-06-15T09:37:33Z @tobiu closed this issue

