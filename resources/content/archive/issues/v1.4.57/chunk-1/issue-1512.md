---
id: 1512
title: 'main.addon.WindowPosition: onResize() => use window directly'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-02-26T13:37:19Z'
updatedAt: '2021-02-26T13:41:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1512'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-02-26T13:41:59Z'
---
# main.addon.WindowPosition: onResize() => use window directly

no need to use Neo.Main.getWindowData() from inside the main thread when only need access to direct properties

## Timeline

- 2021-02-26T13:37:19Z @tobiu added the `enhancement` label
- 2021-02-26T13:37:19Z @tobiu assigned to @tobiu
- 2021-02-26T13:41:50Z @tobiu referenced in commit `81cd8a0` - "main.addon.WindowPosition: onResize() => use window directly #1512"
- 2021-02-26T13:41:59Z @tobiu closed this issue

