---
id: 4638
title: 'component.Base: updateVdom() => prevent callbacks in case the component got destroyed in the mean time'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-08-04T12:02:27Z'
updatedAt: '2023-08-04T12:03:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4638'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-04T12:03:42Z'
---
# component.Base: updateVdom() => prevent callbacks in case the component got destroyed in the mean time

edge case, but an async update cycle can end while a component already got destroyed.

we do not want that additional logic happens in this scenario.

![Screenshot 2023-08-04 at 13 45 57](https://github.com/neomjs/neo/assets/1177434/b89fdb16-195d-4fb6-8a4c-2cdf168be278)


## Timeline

- 2023-08-04T12:02:27Z @tobiu added the `bug` label
- 2023-08-04T12:02:27Z @tobiu assigned to @tobiu
- 2023-08-04T12:03:37Z @tobiu referenced in commit `892418b` - "component.Base: updateVdom() => prevent callbacks in case the component got destroyed in the mean time #4638"
- 2023-08-04T12:03:42Z @tobiu closed this issue

