---
id: 1511
title: 'SharedDialog.view.MainContainerController: afterSetDockedWindowSide()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-02-24T13:48:35Z'
updatedAt: '2021-02-26T13:34:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1511'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-02-26T13:34:48Z'
---
# SharedDialog.view.MainContainerController: afterSetDockedWindowSide()

in case a docked browser window already exists, using a checkbox to change the window position should move the window dynamically.

the logic should happen inside main.addon.WindowPosition.

## Timeline

- 2021-02-24T13:48:35Z @tobiu added the `enhancement` label
- 2021-02-24T13:48:36Z @tobiu assigned to @tobiu
- 2021-02-24T16:39:07Z @tobiu referenced in commit `31bb597` - "#1511 logic to dynamically toggle a docked window between left & right"
### @tobiu - 2021-02-24T16:54:10Z

switching between left & right is implemented:
https://youtu.be/-WYU7_MgRyk

top & bottom next.

- 2021-02-26T13:26:56Z @tobiu referenced in commit `8b46846` - "#1511 logic to dynamically toggle a docked window for bottom & top (in progress)"
- 2021-02-26T13:29:42Z @tobiu referenced in commit `4843610` - "#1511 doc to left or right => height adjustment for chrome"
- 2021-02-26T13:34:43Z @tobiu referenced in commit `ae503ba` - "#1511 polished the logic for a dock switch to the bottom side"
- 2021-02-26T13:34:48Z @tobiu closed this issue

