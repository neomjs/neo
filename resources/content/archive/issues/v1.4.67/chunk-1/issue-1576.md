---
id: 1576
title: 'model.Component: getData() & setData()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-24T16:14:58Z'
updatedAt: '2021-03-30T11:09:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1576'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-30T11:09:21Z'
---
# model.Component: getData() & setData()

convenience methods

## Timeline

- 2021-03-24T16:14:58Z @tobiu added the `enhancement` label
- 2021-03-24T16:14:58Z @tobiu assigned to @tobiu
- 2021-03-24T16:28:12Z @tobiu referenced in commit `13c211c` - "model.Component: get() & set() #1576"
- 2021-03-24T16:31:22Z @tobiu referenced in commit `e7c4eb8` - "#1576 set comment"
- 2021-03-24T17:07:54Z @tobiu referenced in commit `7d7db1f` - "#1576 get() comment"
### @tobiu - 2021-03-25T15:26:43Z

hmm, i still don't like that set() would override the config setter inside core.Base, although you would probably never use it for a VM. still inconsistent.

will rename the methods into getData() & setData().

- 2021-03-25T15:26:57Z @tobiu changed title from **model.Component: get() & set()** to **model.Component: getData() & setData()**
- 2021-03-25T15:28:07Z @tobiu referenced in commit `a570b8b` - "model.Component: getData() & setData() #1576"
- 2021-03-30T11:09:21Z @tobiu closed this issue

