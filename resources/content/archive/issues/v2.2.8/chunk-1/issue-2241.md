---
id: 2241
title: 'buildScripts/buildThemes: add support for import statements inside SCSS files'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-03T10:35:20Z'
updatedAt: '2021-06-03T10:37:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2241'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-03T10:37:25Z'
---
# buildScripts/buildThemes: add support for import statements inside SCSS files

I would like to break down the src/Global.scss file into sub-files.

To do this, the theme-build needs to call `scssCombine()` on each input file itself.

For now, it is fine to limit this one to the neo framework.

We can create a follow up ticket to also support imports inside workspaces.

## Timeline

- 2021-06-03T10:35:20Z @tobiu added the `enhancement` label
- 2021-06-03T10:35:21Z @tobiu assigned to @tobiu
- 2021-06-03T10:37:15Z @tobiu referenced in commit `753bd01` - "buildScripts/buildThemes: add support for import statements inside SCSS files #2241"
- 2021-06-03T10:37:25Z @tobiu closed this issue

