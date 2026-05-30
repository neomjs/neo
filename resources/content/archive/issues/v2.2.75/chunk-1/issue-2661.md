---
id: 2661
title: 'component.Base: promiseVdomUpdate() => honor the silentVdomUpdate state'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-07-31T17:03:17Z'
updatedAt: '2021-07-31T17:03:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2661'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-07-31T17:03:51Z'
---
# component.Base: promiseVdomUpdate() => honor the silentVdomUpdate state

I have been chasing down this one for quite a while.

When calling `component.set()` or manually locking a cmp for updates, most afterSet() methods are using `me.vdom = vdoM;`.

However, there are spots where I am using `me.promiseVdomUpdate()` instead to use the callback.

Those calls were bypassing the silent flag, which can trigger additional delta engine calls. The mean thing is that in those cases, the new vnode is not in place yet (the engine works async inside the vdom worker), which can lead to duplicate dom updates and result in errors.

## Timeline

- 2021-07-31T17:03:17Z @tobiu added the `enhancement` label
- 2021-07-31T17:03:17Z @tobiu assigned to @tobiu
- 2021-07-31T17:03:50Z @tobiu referenced in commit `da1fab3` - "component.Base: promiseVdomUpdate() => honor the silentVdomUpdate state #2661"
- 2021-07-31T17:03:51Z @tobiu closed this issue

