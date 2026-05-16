---
id: 5598
title: 'selection.Model: select() => add support for widgets using a collection instead of a store'
state: OPEN
labels:
  - enhancement
  - no auto close
assignees: []
createdAt: '2024-07-20T19:09:11Z'
updatedAt: '2024-10-19T13:41:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5598'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# selection.Model: select() => add support for widgets using a collection instead of a store

example: `form.field.Time` => creates a collection (can be discussed if it should be a store instead).

```
        items = (items = Array.isArray(items) ?
            items: [items]).map(item => item.isRecord ? view.getItemId(item) : Neo.isObject(item) ? item.id : item);
```

=> we need `view.getItemId(item)` for collection items as well.

inside the TimeField i added the hack to give items the `isRecord` flag as a workaround for now.

## Timeline

- 2024-07-20T19:09:11Z @tobiu added the `enhancement` label
### @github-actions - 2024-10-19T02:31:18Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-10-19T02:31:18Z @github-actions added the `stale` label
- 2024-10-19T13:41:59Z @tobiu removed the `stale` label
- 2024-10-19T13:41:59Z @tobiu added the `no auto close` label

