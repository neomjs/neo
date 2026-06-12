---
id: 7122
title: 'SharedCovid app: Regression bug => clicking on  a table row throws an error'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-07-29T11:23:48Z'
updatedAt: '2025-07-29T11:44:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7122'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-29T11:44:25Z'
---
# SharedCovid app: Regression bug => clicking on  a table row throws an error

It leads to:

<img width="644" height="247" alt="Image" src="https://github.com/user-attachments/assets/db9c0dc3-6e64-4cf4-88f8-d0045d9bd3d8" />

Selecting a country without clicking on a table row first switches the new country and the previous selection back and forth infinitely. Quite a performance demo, but definitely not intended this way.

## Timeline

- 2025-07-29T11:23:48Z @tobiu assigned to @tobiu
- 2025-07-29T11:23:49Z @tobiu added the `bug` label
- 2025-07-29T11:38:17Z @tobiu referenced in commit `051a018` - "SharedCovid app: Regression bug => clicking on a table row throws an error #7122"
- 2025-07-29T11:43:23Z @tobiu referenced in commit `6571054` - "#7122 applied the same fix to the single-window covid app"
### @tobiu - 2025-07-29T11:44:25Z

I will create a new ticket for the country selection, since it seems not related. The table selections work fine again.

- 2025-07-29T11:44:25Z @tobiu closed this issue

