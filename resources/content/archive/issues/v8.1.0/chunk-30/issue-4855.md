---
id: 4855
title: 'tree.Accordion: more than one iconCls in store break when update'
state: CLOSED
labels:
  - bug
assignees:
  - Dinkh
createdAt: '2023-09-06T14:28:15Z'
updatedAt: '2023-09-11T07:51:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4855'
author: pensuwan-k
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-09-11T07:51:14Z'
---
# tree.Accordion: more than one iconCls in store break when update

When create the accordion item with more than one class in iconCls ('icon1' -> work) ('icon1 icon2'-> doesn't work)
And the update the iconCls in the store it's break with this error.

![Screenshot 2023-09-06 at 16 24 11](https://github.com/neomjs/neo/assets/126779879/2128e3e5-5b86-48e4-9681-b11bc4204a08)


## Timeline

- 2023-09-06T14:28:15Z @pensuwan-k added the `bug` label
- 2023-09-08T11:07:01Z @tobiu assigned to @Dinkh
### @tobiu - 2023-09-08T11:07:48Z

@Dinkh can you take care about this one? i suggest using an array of strings for `iconCls` and just spread it in. would be consistent then to other implementations.

### @Dinkh - 2023-09-11T07:51:14Z

Fixed

- 2023-09-11T07:51:14Z @Dinkh closed this issue

