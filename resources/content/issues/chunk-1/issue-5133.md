---
id: 5133
title: Creating the neo.mjs renderer for Storybook
state: OPEN
labels:
  - enhancement
  - epic
  - no auto close
  - hacktoberfest
assignees: []
createdAt: '2023-12-05T09:40:57Z'
updatedAt: '2026-05-16T20:50:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5133'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Creating the neo.mjs renderer for Storybook

Once the Storybook framework is created (https://github.com/neomjs/neo/issues/5132), we need a custom renderer for neo based components.

As an example:
https://github.com/storybookjs/storybook/blob/next/code/frameworks/ember/src/client/preview/render.ts

Similar to our Siesta based setup, we will need to use:
```
 Neo.worker.App.createNeoInstance()
 Neo.worker.App.destroyNeoInstance()
 Neo.worker.App.setConfigs()
```

## Timeline

- 2023-12-05T09:40:57Z @tobiu added the `enhancement` label
- 2023-12-05T09:40:57Z @tobiu added the `epic` label
- 2023-12-05T09:43:46Z @tobiu cross-referenced by #5134
- 2023-12-11T10:19:26Z @tobiu cross-referenced by #5132
### @github-actions - 2024-08-29T02:26:12Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:12Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:29:01Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:29:01Z @github-actions closed this issue
- 2024-10-01T22:41:52Z @tobiu removed the `stale` label
- 2024-10-01T22:41:52Z @tobiu added the `no auto close` label
- 2024-10-01T22:41:57Z @tobiu reopened this issue
- 2024-10-01T22:43:12Z @tobiu added the `hacktoberfest` label
- 2024-10-01T22:52:25Z @tobiu cross-referenced by #6000

