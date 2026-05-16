---
id: 5858
title: fix classname typo in  examples/todoList/version2/TodoListModel.mjs
state: CLOSED
labels:
  - bug
assignees:
  - gplanansky
createdAt: '2024-09-10T01:35:31Z'
updatedAt: '2024-09-12T01:09:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5858'
author: gplanansky
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T01:09:41Z'
---
# fix classname typo in  examples/todoList/version2/TodoListModel.mjs

fix typo  

https://github.com/neomjs/neo/blob/62b219027e5404054eb1cd843eea6656411f4bcf/examples/todoList/version2/TodoListModel.mjs#L9C5-L9C65

 "MainModel" should read "TodoListModel":

`className  : 'Neo.examples.todoList.version2.MainModel',`    --> 
`className  : 'Neo.examples.todoList.version2.TodoListModel',` 



## Timeline

- 2024-09-10T01:35:31Z @gplanansky added the `bug` label
- 2024-09-10T07:30:40Z @tobiu assigned to @gplanansky
### @tobiu - 2024-09-10T07:30:45Z

fair point. assigning it to you :)

- 2024-09-10T19:02:47Z @gplanansky cross-referenced by PR #5865
- 2024-09-10T19:05:10Z @tobiu referenced in commit `3cb35ec` - "Merge pull request #5865 from gplanansky/dev

fix classname typo in examples/todoList/version2/TodoListModel.mjs  issue #5858"
### @tobiu - 2024-09-12T01:09:41Z

resolved. thx!

- 2024-09-12T01:09:41Z @tobiu closed this issue

