---
id: 5749
title: 'main.addon.HighlightJS: prevent code parsing before the lib got loaded'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-08-13T15:04:44Z'
updatedAt: '2024-08-13T15:41:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5749'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-13T15:41:26Z'
---
# main.addon.HighlightJS: prevent code parsing before the lib got loaded

it only happens "sometimes", but when it does, it is really annoying:
![Screenshot 2024-08-13 at 17 04 00](https://github.com/user-attachments/assets/08b5b99b-88e5-467f-b140-411edd9a9565)

we need to ensure that `hljs` exists and if not cache the current parsing request.

## Timeline

- 2024-08-13T15:04:44Z @tobiu added the `bug` label
- 2024-08-13T15:04:45Z @tobiu assigned to @tobiu
- 2024-08-13T15:41:19Z @tobiu referenced in commit `e20fefd` - "main.addon.HighlightJS: prevent code parsing before the lib got loaded #5749"
- 2024-08-13T15:41:26Z @tobiu closed this issue

