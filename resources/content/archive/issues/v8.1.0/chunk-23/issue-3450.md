---
id: 3450
title: 'worker.App: insertThemeFiles() => add support for importing cross app components'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-09-22T15:49:02Z'
updatedAt: '2022-09-22T16:25:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3450'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-09-22T16:25:55Z'
---
# worker.App: insertThemeFiles() => add support for importing cross app components

While i think it is a bad architecture to import components from within one app into a different app, it should not be impossible.

The clean way would be to move a cmp out of an app (e.g. inside `src`) as soon as more than one app uses it.

We actually need the feature for our https://github.com/neomjs/workshops repo (BadgeButton).

## Timeline

- 2022-09-22T15:49:02Z @tobiu added the `enhancement` label
- 2022-09-22T15:49:03Z @tobiu assigned to @tobiu
- 2022-09-22T16:25:41Z @tobiu referenced in commit `04582a1` - "worker.App: insertThemeFiles() => add support for importing cross app components #3450"
- 2022-09-22T16:25:55Z @tobiu closed this issue

