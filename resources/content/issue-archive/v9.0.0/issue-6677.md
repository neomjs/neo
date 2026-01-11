---
id: 6677
title: 'component.Base: updateStyle() => remove the direct main delta shortcut'
state: CLOSED
labels:
  - enhancement
  - no auto close
assignees:
  - tobiu
createdAt: '2025-04-22T11:09:45Z'
updatedAt: '2025-04-22T12:36:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6677'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-22T12:36:42Z'
---
# component.Base: updateStyle() => remove the direct main delta shortcut

* Bypassing the vdom engine made sense before the scoped vdom updates were ready, to make non-leaf based updates faster.
* At this point, it no longer makes sense => all updates should go through the vdom worker.

## Timeline

- 2025-04-22T11:09:45Z @tobiu added the `enhancement` label
- 2025-04-22T11:09:45Z @tobiu assigned to @tobiu
- 2025-04-22T11:09:56Z @tobiu added the `no auto close` label
- 2025-04-22T12:36:00Z @tobiu referenced in commit `cdb9157` - "component.Base: updateStyle() => remove the direct main delta shortcut #6677"
- 2025-04-22T12:36:42Z @tobiu closed this issue

