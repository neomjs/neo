---
id: 3455
title: 'worker.App: insertThemeFiles() => recent change breaks multi window covid app'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-09-26T21:53:06Z'
updatedAt: '2022-09-27T12:01:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3455'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-09-27T12:01:07Z'
---
# worker.App: insertThemeFiles() => recent change breaks multi window covid app

the idea was to enable using components across apps while keeping theme files in place.

however, this now affects the cross window delta CSS updates, e.g. when moving the helix into a new browser window.

## Timeline

- 2022-09-26T21:53:06Z @tobiu added the `bug` label
- 2022-09-26T21:53:06Z @tobiu assigned to @tobiu
- 2022-09-27T12:00:47Z @tobiu referenced in commit `0ce42bc` - "worker.App: insertThemeFiles() => recent change breaks multi window covid app #3455"
- 2022-09-27T12:01:07Z @tobiu closed this issue

