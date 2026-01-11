---
id: 6622
title: 'Colors.view.ViewportController: updateWidgets() => timing issue inside dist/dev'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-04-05T22:27:45Z'
updatedAt: '2025-04-05T22:28:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6622'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-05T22:28:38Z'
---
# Colors.view.ViewportController: updateWidgets() => timing issue inside dist/dev

* I noticed that (only) inside `dist/development` it can happen that we try to access the API, before the namespaces got registered.
* For now, I will make the method async, and a check if it does exist.

## Timeline

- 2025-04-05T22:27:45Z @tobiu added the `enhancement` label
- 2025-04-05T22:27:45Z @tobiu assigned to @tobiu
- 2025-04-05T22:28:23Z @tobiu referenced in commit `fb2a43f` - "Colors.view.ViewportController: updateWidgets() => timing issue inside dist/dev #6622"
- 2025-04-05T22:28:38Z @tobiu closed this issue

