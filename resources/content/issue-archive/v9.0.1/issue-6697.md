---
id: 6697
title: 'layout.Base: applyRenderAttributes() => should trigger applyChildAttributes() internally'
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

## Timeline

- 2025-05-05T13:44:37Z @tobiu assigned to @tobiu
- 2025-05-05T13:44:38Z @tobiu added the `enhancement` label
- 2025-05-05T13:44:39Z @tobiu added parent issue #6696
### @tobiu - 2025-05-05T17:22:16Z

* Fixed the layout switching in a different way
* This approach would be way more complicated, since lazy-loaded items need to trigger child attribute changes later

- 2025-05-05T17:22:16Z @tobiu closed this issue

