---
id: 6233
title: >-
  grid.Container / View: add support for the keys PageDown, PageUp, End, Home to
  navigate
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-01-14T20:57:27Z'
updatedAt: '2025-01-14T22:22:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6233'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-14T22:22:57Z'
---
# grid.Container / View: add support for the keys PageDown, PageUp, End, Home to navigate

*(No description provided)*

## Comments

### @tobiu - 2025-01-14 22:22

https://github.com/user-attachments/assets/2065773c-07e7-4c05-aeaf-7381476a0823

Actually we do not even need to add a custom keyboard navigation for `grid.View`, since the browser default is sufficient.

The `tabindex="-1"` DOM attributes for grid cells & rows had to get removed and instead the view wrapper node got it (see video). Now the selection models need work.

## Activity Log

- 2025-01-14 @tobiu added the `enhancement` label
- 2025-01-14 @tobiu assigned to @tobiu
- 2025-01-14 @tobiu referenced in commit `889d725` - "grid.Container / View: add support for the keys PageDown, PageUp, End, Home to navigate #6233"
- 2025-01-14 @tobiu closed this issue

