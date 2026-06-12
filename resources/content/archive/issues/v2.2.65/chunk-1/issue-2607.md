---
id: 2607
title: 'data.RecordFactory: add a record.set() method, added as a reference to record objects'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-07-15T19:02:31Z'
updatedAt: '2021-07-16T11:37:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2607'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-07-16T11:37:10Z'
---
# data.RecordFactory: add a record.set() method, added as a reference to record objects

the logic should work in a similar way to changing multiple configs => `myInstance.set()` or view model related data properties => `myModel.setData()`.

The store based `recordChange` event will need an adjusted signature containing an array of affected fields.

## Timeline

- 2021-07-15T19:02:31Z @tobiu added the `enhancement` label
- 2021-07-15T19:02:32Z @tobiu assigned to @tobiu
- 2021-07-16T11:37:06Z @tobiu referenced in commit `c7eeb6d` - "data.RecordFactory: add a record.set() method, added as a reference to record objects #2607"
- 2021-07-16T11:37:10Z @tobiu closed this issue

