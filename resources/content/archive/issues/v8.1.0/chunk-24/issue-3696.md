---
id: 3696
title: Neo.first()
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2022-12-28T12:29:21Z'
updatedAt: '2023-01-02T19:41:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3696'
author: Dinkh
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-02T19:41:04Z'
---
# Neo.first()

The developer wants to be able to find the first component with certain stats.

@examples
    Neo.first('button');                             => string finds first item with ntype
    Neo.first({ntype: button, text: 'foo'})  => object result is the first item that matches all key|values

This should be kind of a shortcut for Neo.manager.Component.find().
We only want to return the first item (not an array) and be able to hand over a ntype as string.

## Timeline

- 2022-12-28T12:29:21Z @Dinkh added the `enhancement` label
### @Dinkh - 2023-01-02T19:41:04Z

Done in 4.4.15

- 2023-01-02T19:41:04Z @Dinkh closed this issue

