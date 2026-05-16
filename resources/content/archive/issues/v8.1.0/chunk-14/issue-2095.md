---
id: 2095
title: 'manager.Component: down() => use this.find() instead of accessing cmp.items'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2021-05-21T17:36:27Z'
updatedAt: '2021-05-21T17:37:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2095'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-21T17:37:13Z'
---
# manager.Component: down() => use this.find() instead of accessing cmp.items

a little bit slower, but more generic. the change honors non container based child items, as long as they get the parentId config assigned properly.

## Timeline

- 2021-05-21T17:36:27Z @tobiu added the `enhancement` label
- 2021-05-21T17:36:51Z @tobiu referenced in commit `c49b504` - "manager.Component: down() => use this.find() instead of accessing cmp.items #2095"
- 2021-05-21T17:37:13Z @tobiu closed this issue

