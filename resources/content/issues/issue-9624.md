---
id: 9624
title: '[Multi-Body Grid] Resolve Border Overlap, Header Sync, and Scroll Propagation'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-01T20:20:25Z'
updatedAt: '2026-04-01T21:41:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9624'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-01T21:41:26Z'
---
# [Multi-Body Grid] Resolve Border Overlap, Header Sync, and Scroll Propagation

This ticket consolidates the final UI stabilization issues for the multi-body grid architecture:
1. **Border Overlap:** The `lock:end` column overlaps by the center body border, hiding the rightmost line.
2. **Header Toolbar Scroll Locking:** Horizontal scrolling the Grid pushes locked left headers out of the visible area due to incorrect scroll propagation and flexbox sizing constraints in the `.neo-grid-header-wrapper`.
3. **Vertical Scroll Propagation:** Vertical wheel and thumb drag scroll events are only updating the center grid rows and do not propagate synchronously to the `lock:start` and `lock:end` bodies.

## Timeline

- 2026-04-01T20:20:26Z @tobiu added the `bug` label
- 2026-04-01T20:20:26Z @tobiu added the `ai` label
- 2026-04-01T20:25:38Z @tobiu added parent issue #9486
- 2026-04-01T20:25:55Z @tobiu assigned to @tobiu
- 2026-04-01T20:35:01Z @tobiu referenced in commit `7aee7c8` - "feat: multi-body grid border overlap and scroll sync (#9624)"
- 2026-04-01T21:41:26Z @tobiu closed this issue

