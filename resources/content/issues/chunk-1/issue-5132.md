---
id: 5132
title: Creating the Storybook framework
state: OPEN
labels:
  - enhancement
  - help wanted
  - epic
  - no auto close
  - hacktoberfest
assignees: []
createdAt: '2023-12-05T09:35:53Z'
updatedAt: '2026-05-16T20:50:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5132'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Creating the Storybook framework

This should most likely be the starting point of this project. We can most likely break it down into smaller tickets.

We need to follow the official guide:
https://storybook.js.org/docs/contribute/framework

and analyse the already existing implementations:
https://github.com/storybookjs/storybook/tree/next/code/frameworks

e.g. the ember implementation might be work a closer look, since it seems to not be template-driven.

## Timeline

- 2023-12-05T09:35:53Z @tobiu added the `enhancement` label
- 2023-12-05T09:35:53Z @tobiu added the `help wanted` label
- 2023-12-05T09:35:53Z @tobiu added the `epic` label
### @tobiu - 2023-12-05T09:36:25Z

@valentinpalkovic 

- 2023-12-05T09:40:57Z @tobiu cross-referenced by #5133
### @tobiu - 2023-12-11T10:19:25Z

More input from @valentinpalkovic:

We do not need to clone or fork the entire storybook repo.

Copying the code from one of the existing storybook frameworks into a new repo is sufficient. E.g.:
https://github.com/storybookjs/storybook/tree/next/code/frameworks/react-webpack5

Then we need to adjust the package name inside the package.json and can use this custom framework package inside storybook.

Once the setup is in place, the `renderToCanvas` method is key. E.g.:
https://github.com/storybookjs/storybook/blob/next/code/renderers/react/src/renderToCanvas.tsx

Out of scope for this ticket => https://github.com/neomjs/neo/issues/5133

### @github-actions - 2024-08-29T02:26:13Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:14Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:29:02Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:29:03Z @github-actions closed this issue
- 2024-10-01T22:41:21Z @tobiu removed the `stale` label
- 2024-10-01T22:41:21Z @tobiu added the `no auto close` label
- 2024-10-01T22:41:24Z @tobiu reopened this issue
- 2024-10-01T22:43:34Z @tobiu added the `hacktoberfest` label
- 2024-10-01T22:52:25Z @tobiu cross-referenced by #6000

