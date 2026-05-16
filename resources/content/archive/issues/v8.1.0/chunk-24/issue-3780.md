---
id: 3780
title: Select field should allow an array of items
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2023-01-04T18:13:28Z'
updatedAt: '2024-09-14T02:26:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3780'
author: Dinkh
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:20Z'
---
# Select field should allow an array of items

SelectField should allow to enter data as this:
```
data: ['Choice 1', 'Choice 2', 'Choice 3']
```

The id's should be -1, -2, -3

## Timeline

- 2023-01-04T18:13:28Z @Dinkh added the `enhancement` label
### @tobiu - 2023-01-04T20:58:02Z

sounds good to me for simple use cases. i recommend to call the config `options_` though to stick to default html select fields. the `afterSetOptions()` hook should throw an error in case there is a defined store.

### @github-actions - 2024-08-30T02:27:19Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:20Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:20Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:20Z @github-actions closed this issue

