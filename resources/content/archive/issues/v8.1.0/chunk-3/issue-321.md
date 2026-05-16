---
id: 321
title: 'table.View: renderer for createRandomViewData()'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2020-03-19T10:26:43Z'
updatedAt: '2020-03-19T10:39:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/321'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-03-19T10:39:20Z'
---
# table.View: renderer for createRandomViewData()

the adjustments for better renderer scoping have broken some of the old performance examples (where tables without stores are in place).

looking into it.

![Screenshot 2020-03-19 at 11 25 39](https://user-images.githubusercontent.com/1177434/77057599-7e3afe00-69d4-11ea-87aa-2cf7afe1be90.png)


## Timeline

- 2020-03-19T10:26:43Z @tobiu added the `bug` label
- 2020-03-19T10:39:09Z @tobiu referenced in commit `f2c3ef4` - "table.View: renderer for createRandomViewData() #321"
### @tobiu - 2020-03-19T10:39:20Z

fixed.

- 2020-03-19T10:39:20Z @tobiu closed this issue

