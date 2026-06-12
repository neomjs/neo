---
id: 4545
title: Panel Header should not be inline with the layout
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2023-07-13T10:13:51Z'
updatedAt: '2024-09-13T02:29:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4545'
author: Dinkh
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:29:38Z'
---
# Panel Header should not be inline with the layout

Is:
If you create a `panel` with a `dock` -top `header` and `items` with layout `hbox`, the docked item will be aligned to the left.

What I expect:
The docked item should be aligned top and the two items underneath should be left to right

Example:

```
ntype: 'panel',
headers: [{
    dock: 'top'
}],
layout: {ntype: 'hbox', align: 'stretch'},
items: [{
    html: 'item a'
}, {
    html: 'item b'
}]
```

## Timeline

- 2023-07-13T10:13:51Z @Dinkh added the `bug` label
### @github-actions - 2024-08-29T02:27:04Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:27:04Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:29:38Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:29:39Z @github-actions closed this issue

