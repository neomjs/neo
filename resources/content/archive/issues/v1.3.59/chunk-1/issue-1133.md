---
id: 1133
title: 'Docs App: using routes breaks locally'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2020-08-24T15:25:11Z'
updatedAt: '2020-08-25T07:31:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1133'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-25T07:31:35Z'
---
# Docs App: using routes breaks locally

e.g.: #viewSource=Neo.calendar.model.Event&line=13

the parentId & index are missing inside the delta update.

![Screenshot 2020-08-24 at 17 24 18](https://user-images.githubusercontent.com/1177434/91063815-bc48e780-e62e-11ea-85ec-708fbbb12a3c.png)

will take a look into this.

## Timeline

- 2020-08-24T15:25:11Z @tobiu added the `bug` label
- 2020-08-24T15:25:12Z @tobiu assigned to @tobiu
- 2020-08-25T07:31:14Z @tobiu referenced in commit `53c8471` - "#1133 adjusted tabs to ensure they can get included via routes (before rendering). core changes."
- 2020-08-25T07:31:35Z @tobiu closed this issue
- 2020-08-25T07:32:33Z @tobiu referenced in commit `0b7fd1c` - "#1133 cleanup"

