---
id: 6368
title: 'component.Base: #executeVdomUpdate() => remove the vdom & vnode params'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-03T18:28:06Z'
updatedAt: '2025-02-03T18:28:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6368'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-03T18:28:37Z'
---
# component.Base: #executeVdomUpdate() => remove the vdom & vnode params

The params were intended for sub-updates, which never got implemented and are probably not needed.

I did run into edge-case issues, where the vnode got cloned and an outdated version got sent to the worker.

* `update()` needs to get rid of the params too
* `promiseUpdate()` needs to get rid of the vdom & vnode params
* wrapper class changes must not use the main thread shortcut

## Timeline

- 2025-02-03T18:28:06Z @tobiu added the `enhancement` label
- 2025-02-03T18:28:06Z @tobiu assigned to @tobiu
- 2025-02-03T18:28:31Z @tobiu referenced in commit `9a566b4` - "component.Base: #executeVdomUpdate() => remove the vdom & vnode params #6368"
- 2025-02-03T18:28:37Z @tobiu closed this issue

