---
id: 6697
title: >-
  layout.Base: applyRenderAttributes() => should trigger applyChildAttributes()
  internally
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-05-05T13:44:37Z'
updatedAt: '2025-05-05T17:22:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6697'
author: tobiu
commentsCount: 1
parentIssue: 6696
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-05-05T17:22:16Z'
---
# layout.Base: applyRenderAttributes() => should trigger applyChildAttributes() internally

*(No description provided)*

## Comments

### @tobiu - 2025-05-05 17:22

* Fixed the layout switching in a different way
* This approach would be way more complicated, since lazy-loaded items need to trigger child attribute changes later

## Activity Log

- 2025-05-05 @tobiu assigned to @tobiu
- 2025-05-05 @tobiu added the `enhancement` label
- 2025-05-05 @tobiu closed this issue

