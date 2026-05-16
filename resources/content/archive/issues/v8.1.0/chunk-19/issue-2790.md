---
id: 2790
title: 'collection.Base:filter() => adjust the filter event signature'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-01-02T15:02:04Z'
updatedAt: '2022-01-02T15:29:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2790'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-01-02T15:29:47Z'
---
# collection.Base:filter() => adjust the filter event signature

we need to add more infos:
```
me.fire('filter', {
    isFiltered: me[isFiltered],
    items     : me.items,
    oldItems,
    scope     : me
});
```

## Timeline

- 2022-01-02T15:02:04Z @tobiu added the `enhancement` label
- 2022-01-02T15:02:04Z @tobiu assigned to @tobiu
- 2022-01-02T15:02:33Z @tobiu referenced in commit `d7c046f` - "collection.Base:filter() => adjust the filter event signature #2790"
- 2022-01-02T15:29:47Z @tobiu closed this issue

