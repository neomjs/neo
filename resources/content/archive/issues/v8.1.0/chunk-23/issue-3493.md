---
id: 3493
title: 'component.Base: afterSetWrapperCls() => ensure deltas get applied correctly'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-10-02T15:46:27Z'
updatedAt: '2022-10-02T15:48:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3493'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-10-02T15:48:01Z'
---
# component.Base: afterSetWrapperCls() => ensure deltas get applied correctly

in case `me.vdom === me.getVdomRoot`, we need to ensure that we get the diff of `value` and `oldValue` correctly.

calling `afterSetCls()` will lose them.

## Timeline

- 2022-10-02T15:46:27Z @tobiu added the `enhancement` label
- 2022-10-02T15:46:27Z @tobiu assigned to @tobiu
- 2022-10-02T15:47:58Z @tobiu referenced in commit `261fb58` - "component.Base: afterSetWrapperCls() => ensure deltas get applied correctly #3493"
- 2022-10-02T15:48:01Z @tobiu closed this issue

