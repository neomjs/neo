---
id: 9628
title: 'Grid Multi-Body: Map Physical Heights and Transfer Vertical Scrolling'
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-04-02T08:19:54Z'
updatedAt: '2026-04-02T08:36:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9628'
author: tobiu
commentsCount: 1
parentIssue: 9626
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-02T08:36:32Z'
---
# Grid Multi-Body: Map Physical Heights and Transfer Vertical Scrolling

The second phase involves transitioning vertical scroll physics to the new `grid.View` orchestrator.
- Remove the `50,000px` (or similar) artificial layout stretchers from `grid.Body`.
- Calculate and apply the exact physical height constraints directly onto the flattened `grid.Body` instances so they stretch their parent natively.
- Migrate `overflow-y: scroll` definitions and related SCSS properties from the legacy wrappers to the new `grid.View`.

## Timeline

- 2026-04-02T08:19:55Z @tobiu assigned to @tobiu
- 2026-04-02T08:19:56Z @tobiu added the `enhancement` label
- 2026-04-02T08:19:56Z @tobiu added the `ai` label
- 2026-04-02T08:19:56Z @tobiu added the `grid` label
- 2026-04-02T08:20:05Z @tobiu added parent issue #9626
- 2026-04-02T08:36:09Z @tobiu referenced in commit `05a9750` - "feat: Map Physical Heights and Transfer Vertical Scrolling to grid.View (#9628)"
### @tobiu - 2026-04-02T08:36:31Z

✦ Completed Phase 2: Transferred native vertical scrolling completely to . Removed defunct sync logic from , deleted all legacy DOM scroll bindings from , and migrated  to the new  class.

- 2026-04-02T08:36:32Z @tobiu closed this issue

