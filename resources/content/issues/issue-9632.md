---
id: 9632
title: 'Grid: Restore Row Scroll Pinning and Update Drag E2E Tests'
state: OPEN
labels:
  - bug
  - ai
  - testing
  - grid
assignees: []
createdAt: '2026-04-02T10:11:57Z'
updatedAt: '2026-04-02T10:11:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9632'
author: tobiu
commentsCount: 0
parentIssue: 9626
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid: Restore Row Scroll Pinning and Update Drag E2E Tests

### Description
The recent refactoring of the Multi-Body Grid's scrolling architecture (transitioning to unified scroll containers and CSS sticky positioning) has fundamentally broken the original `GridRowScrollPinning.mjs` Addon behavior.

Consequently, this architectural shift causes several End-to-End Playwright tests to fail.

### Affected E2E Tests:
- `test/playwright/e2e/GridRowPinning.spec.mjs`
- `test/playwright/e2e/GridThumbDrag.spec.mjs`
- `test/playwright/e2e/GridThumbDragDevIndex.spec.mjs`
- `test/playwright/e2e/GridThumbDragPause.spec.mjs`

### Objective
1. Refactor `Neo.main.addon.GridRowScrollPinning` to respect the new unified scroll architecture context.
2. Synchronize and adjust the affected Playwright E2E tests to correctly verify the thumb-dragging and row-pinning mechanics under the new virtualization model.

### Context
This sub-epic is a continuation of Epic #9626 (Unified Multi-Body Grid Scrolling).

## Timeline

- 2026-04-02T10:12:00Z @tobiu added the `bug` label
- 2026-04-02T10:12:00Z @tobiu added the `ai` label
- 2026-04-02T10:12:00Z @tobiu added the `testing` label
- 2026-04-02T10:12:00Z @tobiu added the `grid` label
- 2026-04-02T10:12:06Z @tobiu added parent issue #9626

