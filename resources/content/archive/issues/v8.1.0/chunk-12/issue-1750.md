---
id: 1750
title: 'model.Component: getParentDataScope() => getDataScope()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-10T15:45:26Z'
updatedAt: '2021-04-10T20:22:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1750'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-10T20:22:21Z'
---
# model.Component: getParentDataScope() => getDataScope()

In retrospective, the method name sounds a bit confusing.

What the method does is looking for a child node inside `this.data` if needed.

e.g. in case you pass `data.foo.bar.baz`

the scope for changing the 'baz' key is the bar object.

I will update the comment of this method as well.

## Timeline

- 2021-04-10T15:45:26Z @tobiu added the `enhancement` label
- 2021-04-10T15:45:26Z @tobiu assigned to @tobiu
- 2021-04-10T20:22:17Z @tobiu referenced in commit `cda55b7` - "model.Component: getParentDataScope() => getDataScope() #1750"
- 2021-04-10T20:22:22Z @tobiu closed this issue

