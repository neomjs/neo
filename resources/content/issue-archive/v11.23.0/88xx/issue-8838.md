---
id: 8838
title: 'Refine Disjoint VDOM Updates: Depth Handling & Collision Filtering'
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-20T21:55:12Z'
updatedAt: '2026-01-20T21:56:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8838'
author: tobiu
commentsCount: 1
parentIssue: 8834
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-20T21:56:42Z'
---
# Refine Disjoint VDOM Updates: Depth Handling & Collision Filtering

## Objective
Fix regressions in CardLayout and hybrid update scenarios by refining the disjoint update logic.

## Changes
1.  **Respect `updateDepth`:** Remove the hardcoded `depth: 1` override in `VdomLifecycle.executeVdomUpdate`. Allow components to request deep updates (e.g., `depth: -1` for CardLayout removals).
2.  **Collision Filtering:** Implement a filtering mechanism in `executeVdomUpdate` to detect and remove child updates that are already covered by a parent's deep update (hybrid scenario). This prevents double updates.
3.  **Test Updates:** Update `RealWorldUpdates.spec.mjs` to reflect the correct behavior (suppressed ghost updates).

## Timeline

- 2026-01-20T21:55:13Z @tobiu added the `bug` label
- 2026-01-20T21:55:13Z @tobiu added the `ai` label
- 2026-01-20T21:55:13Z @tobiu added the `core` label
- 2026-01-20T21:55:26Z @tobiu added parent issue #8834
- 2026-01-20T21:55:45Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-20T21:56:21Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the refinements to the disjoint update logic.
> 
> 1.  **Depth Handling**: `executeVdomUpdate` now passes `null` as the second argument to `getVdomUpdatePayload`, allowing the component's internal `updateDepth` to take precedence. This fixes the CardLayout regression where `depth: -1` was being ignored.
> 2.  **Collision Filtering**: Added logic to `executeVdomUpdate` to filter out child updates that are covered by an ancestor's deep update within the same batch.
> 3.  **Verification**: Updated `RealWorldUpdates.spec.mjs` to expect 3 deltas (suppressing the ghost update), and verified that all tests pass.
> 
> This resolves the immediate regressions.

- 2026-01-20T21:56:42Z @tobiu closed this issue

