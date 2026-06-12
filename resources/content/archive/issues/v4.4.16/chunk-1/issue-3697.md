---
id: 3697
title: Neo.findCmp()
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2022-12-28T12:35:21Z'
updatedAt: '2023-01-02T19:43:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3697'
author: Dinkh
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-02T19:43:53Z'
---
# Neo.findCmp()

The developer wants to be able to find all component with certain stats.

@returns []

@examples
    Neo.findCmp('button');                             => string finds items with ntype
    Neo.findCmp({ntype: button, text: 'foo'})  => object results in item that match all key|values

This should be kind of a shortcut for Neo.manager.Component.find().
We to be able to hand over a ntype as string.

## Timeline

- 2022-12-28T12:35:21Z @Dinkh added the `enhancement` label
### @Dinkh - 2023-01-02T19:43:53Z

Done in 4.4.15

use
```
// second param is returnFirstMatch
// to find all items use
Neo.first('button', false);
```

Since 4.4.15 ntype will go through all prototypes and therefore find all buttons even if you added your own ntype.

- 2023-01-02T19:43:53Z @Dinkh closed this issue

