---
id: 4546
title: 'data.RecordFactory: add support for arrays within mapping paths'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2023-07-13T12:44:33Z'
updatedAt: '2024-09-13T02:29:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4546'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:29:37Z'
---
# data.RecordFactory: add support for arrays within mapping paths

We already have `Neo.nsWithArrays()`, which does get used for parsing form field paths.

However, `data.RecordFactory: parseRecordValue()` is still using `Neo.ns()` instead.

It would be a quick win to change this.

## Timeline

- 2023-07-13T12:44:33Z @tobiu added the `enhancement` label
### @github-actions - 2024-08-29T02:27:02Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:27:03Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:29:36Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:29:37Z @github-actions closed this issue

