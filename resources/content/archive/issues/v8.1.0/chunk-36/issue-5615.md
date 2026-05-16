---
id: 5615
title: 'tree.List: onStoreRecordChange()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-22T18:08:11Z'
updatedAt: '2024-07-22T18:29:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5615'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-22T18:29:22Z'
---
# tree.List: onStoreRecordChange()

I did add `onStoreRecordChange()` a long time after creating `tree.List`. The base class logic can not work in this scenario, so we need an override.

## Timeline

- 2024-07-22T18:08:11Z @tobiu added the `enhancement` label
- 2024-07-22T18:08:11Z @tobiu assigned to @tobiu
- 2024-07-22T18:08:43Z @tobiu referenced in commit `1e084d9` - "tree.List: onStoreRecordChange() #5615"
### @tobiu - 2024-07-22T18:10:00Z

first PoC, which allows us to change the name field of a tree list record.

![Screenshot 2024-07-22 at 20 04 23](https://github.com/user-attachments/assets/c5fb00e5-2e8c-432c-9f0f-c6dd6de2427e)

next step: we need to create the method `createItem()` => moving the related code out of `createItems()`, which the record change logic then can re-use.

- 2024-07-22T18:29:17Z @tobiu referenced in commit `38caa7c` - "#5615 tree.List: new createItem() method which gets used inside createItems() & onStoreRecordChange()"
- 2024-07-22T18:29:22Z @tobiu closed this issue

