---
id: 7681
title: 'Grid scrollbar: Improve two-way sync detection for hybrid devices'
state: CLOSED
labels:
  - bug
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-31T20:15:57Z'
updatedAt: '2025-10-31T20:18:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7681'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-31T20:18:24Z'
---
# Grid scrollbar: Improve two-way sync detection for hybrid devices

The vertical scrollbar in the grid was not working correctly on some Linux laptops with touch capabilities. This was because the two-way scroll sync was disabled based on `hasTouchEvents`. The fix is to use `hasMouseEvents` instead, which is based on `matchMedia('(pointer: fine)').matches`. This allows two-way sync when a fine pointer (like a mouse) is the primary input device, even if the device also has a touchscreen.

## Timeline

- 2025-10-31 @tobiu added the `bug` label
- 2025-10-31 @tobiu added the `enhancement` label
- 2025-10-31 @tobiu added the `ai` label
- 2025-10-31 @tobiu assigned to @tobiu
- 2025-10-31 @tobiu referenced in commit `3ad5472` - "Grid scrollbar: Improve two-way sync detection for hybrid devices #7681"
- 2025-10-31 @tobiu closed this issue

