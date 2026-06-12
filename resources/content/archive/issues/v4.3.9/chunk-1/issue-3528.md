---
id: 3528
title: 'component.Base: afterSetCls(), afterSetWrapperCls() => smarter merging strategy'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-10-04T23:01:39Z'
updatedAt: '2022-10-04T23:10:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3528'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-10-04T23:10:43Z'
---
# component.Base: afterSetCls(), afterSetWrapperCls() => smarter merging strategy

`cls = [...me.wrapperCls, ...value];`

would not honor duplicate entries. well, those should never happen, but better safe than sorry.

## Timeline

- 2022-10-04T23:01:39Z @tobiu added the `enhancement` label
- 2022-10-04T23:01:39Z @tobiu assigned to @tobiu
- 2022-10-04T23:10:35Z @tobiu referenced in commit `62e3e96` - "component.Base: afterSetCls(), afterSetWrapperCls() => smarter merging strategy #3528"
- 2022-10-04T23:10:43Z @tobiu closed this issue

