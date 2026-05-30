---
id: 1955
title: 'worker.App: insertThemeFiles() => use the controller.Application appThemeFolder config in case it exists'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-05-05T16:52:19Z'
updatedAt: '2021-05-05T16:52:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1955'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-05T16:52:40Z'
---
# worker.App: insertThemeFiles() => use the controller.Application appThemeFolder config in case it exists

it has to get used for checking the theme file map and for the main thread addon call, but not for storing the theme files loaded flag.

## Timeline

- 2021-05-05T16:52:19Z @tobiu added the `enhancement` label
- 2021-05-05T16:52:20Z @tobiu assigned to @tobiu
- 2021-05-05T16:52:37Z @tobiu referenced in commit `81385dd` - "worker.App: insertThemeFiles() => use the controller.Application appThemeFolder config in case it exists #1955"
- 2021-05-05T16:52:40Z @tobiu closed this issue

