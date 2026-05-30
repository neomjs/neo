---
id: 708
title: 'shared covid apps: domEvents for moved component trees'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-06-12T19:28:09Z'
updatedAt: '2020-06-13T10:40:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/708'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-06-13T10:40:41Z'
---
# shared covid apps: domEvents for moved component trees

this one is not functional yet.

it might be something trivial like adjusting the appName config for all child components.

if not, i need to take a deeper dive into the postMessage chains.

## Timeline

- 2020-06-12T19:28:10Z @tobiu added the `enhancement` label
- 2020-06-12T19:28:10Z @tobiu assigned to @tobiu
### @tobiu - 2020-06-13T10:26:00Z

was right on the "appName" theory, it does not get changed for all child cmps when switching to a new app.

on it!

- 2020-06-13T10:27:58Z @tobiu referenced in commit `9d2094c` - "#708 SharedCovid.view.MainContainerController => testing logs to check the appName config for moved cmp trees."
- 2020-06-13T10:40:31Z @tobiu referenced in commit `f53f241` - "#708 component.Base: appName_ config, container.Base: afterSetAppName()"
- 2020-06-13T10:40:41Z @tobiu closed this issue

