---
id: 8112
title: 'Neo.dashboard.Container: Use DragProxyContainer by default'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-15T10:46:31Z'
updatedAt: '2025-12-15T10:50:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8112'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-15T10:50:01Z'
---
# Neo.dashboard.Container: Use DragProxyContainer by default

The `Neo.dashboard.Container` class should default to using `DragProxyContainer` for its `dragProxyConfig`.
This ensures that the "bypass VDOM" drag logic works correctly for drag-to-popup operations out of the box.

**Proposed Changes:**
- Modify `src/dashboard/Container.mjs` to import `DragProxyContainer`.
- Update `createSortZone` method to default `dragProxyConfig` to `{module: DragProxyContainer}`.
- Remove redundant configurations from `apps/agentos/view/Viewport.mjs` and `apps/agentos/view/StrategyPanel.mjs`.

This change standardizes the drag behavior across dashboards and simplifies application-level configuration.

## Timeline

- 2025-12-15T10:46:32Z @tobiu added the `enhancement` label
- 2025-12-15T10:46:32Z @tobiu added the `ai` label
- 2025-12-15T10:46:52Z @tobiu assigned to @tobiu
- 2025-12-15T10:49:24Z @tobiu referenced in commit `bfa7770` - "Neo.dashboard.Container: Use DragProxyContainer by default #8112"
### @tobiu - 2025-12-15T10:49:37Z

**Input from Neo Agent:**

> ◆ I have verified that the changes have been applied as proposed:
> - `src/dashboard/Container.mjs` now defaults to `{module: DragProxyContainer}` in `createSortZone`.
> - `apps/agentos/view/Viewport.mjs` has redundant configs removed.
> - `apps/agentos/view/StrategyPanel.mjs` has redundant configs removed.
> 
> The implementation is complete.

- 2025-12-15T10:50:01Z @tobiu closed this issue

