---
id: 3698
title: Neo.getCmpTree()
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2022-12-28T12:54:33Z'
updatedAt: '2023-01-04T20:33:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3698'
author: Dinkh
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-04T20:33:43Z'
---
# Neo.getCmpTree()

The developer wants to be able to find the parent tree of an item.

@returns [item, parents...]

@examples
- Neo.getCmpTree('button'); => string finds first item with id and parents
- Neo.getCmpTree({ntype: button, text: 'foo'}) => object results in the first item that matches all key|values

This should be kind of a shortcut for Neo.manager.Component.getParents().
But we want to be able to hand over a ntype as string.

## Timeline

- 2022-12-28T12:54:33Z @Dinkh added the `enhancement` label
### @Dinkh - 2023-01-02T19:45:37Z

Currently in Code Review

You can use Neo.first to grab the component since 4.4.15.
In Code Review is the component.getParents()

```
Neo.first('button').getParents()
```

- 2023-01-04T20:33:43Z @Dinkh closed this issue

