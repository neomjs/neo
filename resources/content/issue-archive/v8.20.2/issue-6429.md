---
id: 6429
title: 'DefaultConfig: {Boolean} applyFixedPositionToHtmlTag'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-09T21:54:04Z'
updatedAt: '2025-02-09T22:01:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6429'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-09T22:01:36Z'
---
# DefaultConfig: {Boolean} applyFixedPositionToHtmlTag

Especially inside the Chromium dev tools, I open run into issues when changing the orientation:

<img width="974" alt="Image" src="https://github.com/user-attachments/assets/f6fe1b37-303a-4de9-8eb9-db73bf32273c" />

* Using `position: fixed` on the html tag itself resolves it.
* However, this should be optional

## Timeline

- 2025-02-09T21:54:04Z @tobiu added the `enhancement` label
- 2025-02-09T21:54:04Z @tobiu assigned to @tobiu
- 2025-02-09T22:01:25Z @tobiu referenced in commit `5f7c8c7` - "DefaultConfig: {Boolean} applyFixedPositionToHtmlTag #6429"
- 2025-02-09T22:01:36Z @tobiu closed this issue

