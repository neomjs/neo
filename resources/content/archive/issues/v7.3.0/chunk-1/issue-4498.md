---
id: 4498
title: 'core.Base: parseItemConfigs() => exclude neo classes'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2023-06-09T15:02:58Z'
updatedAt: '2024-09-13T02:29:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4498'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:29:56Z'
---
# core.Base: parseItemConfigs() => exclude neo classes

we can use imported modules directly inside container items. in this case, `parseItemConfigs()` can iterate over static class fields, which is not intended (and could even cause issues).

## Timeline

- 2023-06-09T15:02:58Z @tobiu added the `enhancement` label
- 2023-06-09T15:02:58Z @tobiu assigned to @tobiu
- 2023-06-09T15:03:32Z @tobiu referenced in commit `d2b0960` - "core.Base: parseItemConfigs() => exclude neo classes #4498"
- 2023-06-09T15:03:33Z @tobiu closed this issue
- 2023-06-12T08:30:41Z @tobiu referenced in commit `4c25a39` - "core.Base: parseItemConfigs() => exclude neo classes #4498"
### @tobiu - 2023-06-19T13:15:08Z

unfortunately, we need to re-open this one. the change is breaking the docs app and also affects a huge client app.

- 2023-06-19T13:15:08Z @tobiu reopened this issue
- 2023-06-19T13:16:00Z @tobiu referenced in commit `83759b5` - "#4498 reverting the parseItemConfigs() exclusion for now"
### @github-actions - 2024-08-29T02:27:17Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:27:17Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:29:56Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:29:57Z @github-actions closed this issue

