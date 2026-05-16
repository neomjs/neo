---
id: 3736
title: Stores should support a Reader
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2023-01-02T00:20:20Z'
updatedAt: '2024-09-14T02:26:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3736'
author: Dinkh
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:26Z'
---
# Stores should support a Reader

Sometimes data for a store are delivered in a strange way.
Instead of using a request and populate the store after working with the data, I would like to see a reader, which prepares the incoming data.

The reader should contain a function that allows the developer to transform the incoming data and return the data, in a way the model understands it.



## Timeline

- 2023-01-02T00:20:20Z @Dinkh added the `enhancement` label
- 2023-01-02T19:40:32Z @Dinkh changed title from **Models should support a Reader** to **Stores should support a Reader**
### @github-actions - 2024-08-30T02:27:25Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:25Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:26Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:26Z @github-actions closed this issue

