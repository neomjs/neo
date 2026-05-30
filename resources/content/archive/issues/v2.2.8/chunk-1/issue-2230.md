---
id: 2230
title: 'plugin.Resizable: onMouseMove() => compare targets'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-02T16:15:09Z'
updatedAt: '2021-06-02T16:16:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2230'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-02T16:16:11Z'
---
# plugin.Resizable: onMouseMove() => compare targets

i case delegation targets are right next to each other, it can happen that `onMouseLeave()` does not trigger.

we need to ensure that handles always get removed when switching targets.

## Timeline

- 2021-06-02T16:15:09Z @tobiu added the `enhancement` label
- 2021-06-02T16:15:09Z @tobiu assigned to @tobiu
- 2021-06-02T16:15:32Z @tobiu referenced in commit `95acf31` - "plugin.Resizable: onMouseMove() => compare targets #2230"
- 2021-06-02T16:16:11Z @tobiu closed this issue

