---
id: 6698
title: 'layout.Base: removeRenderAttributes() => should trigger removeChildAttributes() internally'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-05-05T13:45:12Z'
updatedAt: '2025-05-05T17:22:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6698'
author: tobiu
commentsCount: 1
parentIssue: 6696
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-05-05T17:22:29Z'
---
# layout.Base: removeRenderAttributes() => should trigger removeChildAttributes() internally

*(No description provided)*

## Timeline

- 2025-05-05T13:45:12Z @tobiu assigned to @tobiu
- 2025-05-05T13:45:13Z @tobiu added the `enhancement` label
- 2025-05-05T13:45:13Z @tobiu added parent issue #6696
### @tobiu - 2025-05-05T17:22:29Z

* Fixed the layout switching in a different way
* This approach would be way more complicated, since lazy-loaded items need to trigger child attribute changes later

- 2025-05-05T17:22:29Z @tobiu closed this issue

