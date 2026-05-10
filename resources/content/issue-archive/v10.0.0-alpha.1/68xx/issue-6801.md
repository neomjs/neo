---
id: 6801
title: 'tree.List: createItem() => only add a record.iconCls in case it exists'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-06-15T15:16:16Z'
updatedAt: '2025-10-22T22:54:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6801'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-15T15:16:56Z'
---
# tree.List: createItem() => only add a record.iconCls in case it exists

* Tree items were initially designed to always have an `iconCls`
* Inside the Portal app, we are using plain text items
* In this case, we get and empty item into the classList

## Timeline

- 2025-06-15T15:16:17Z @tobiu added the `enhancement` label
- 2025-06-15T15:16:48Z @tobiu referenced in commit `4dabd69` - "tree.List: createItem() => only add a record.iconCls in case it exists #6801"
- 2025-06-15T15:16:56Z @tobiu closed this issue

