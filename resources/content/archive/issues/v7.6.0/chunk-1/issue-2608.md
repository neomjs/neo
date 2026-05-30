---
id: 2608
title: 'data.Store: updateRecords()'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2021-07-15T19:08:01Z'
updatedAt: '2024-09-16T02:36:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2608'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-16T02:36:45Z'
---
# data.Store: updateRecords()

We could add a bulk update method to change multiple fields on multiple records in parallel.

E.g.:

```
myStore.updateRecords({
    ids: [1, 2, 3],
    endTime: '23:00',
    startTime: '21:00'
});
```

For non remote stores, this should probably trigger a `recordChange` event for each affected record.

We can add a new bulk change event as well.

For remote stores, we can create a single ajax request to the BE, containing all changes.

Open for ideas!

## Timeline

- 2021-07-15T19:08:01Z @tobiu added the `enhancement` label
### @github-actions - 2024-09-01T02:38:26Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-01T02:38:26Z @github-actions added the `stale` label
### @github-actions - 2024-09-16T02:36:45Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-16T02:36:45Z @github-actions closed this issue

