---
id: 3590
title: 'buildScripts/buildThemes: app folders inside the workspace evn'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2022-12-11T13:23:51Z'
updatedAt: '2024-09-14T02:26:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3590'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:43Z'
---
# buildScripts/buildThemes: app folders inside the workspace evn

Right now, the theme build will first parse all files within the neo repo (node module) and afterwards parse all files within the workspace.

The result is, that the CSS output will also include the `apps` from within the neo repo itself. While it is not a big deal, since apps won't use these CSS files, they should get excluded.

## Timeline

- 2022-12-11T13:23:51Z @tobiu added the `enhancement` label
### @github-actions - 2024-08-30T02:27:40Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:40Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:42Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:43Z @github-actions closed this issue

