---
id: 9633
title: 'Grid: Rename bodyWrapper to view'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - architecture
  - grid
assignees:
  - tobiu
createdAt: '2026-04-02T13:06:47Z'
updatedAt: '2026-04-02T13:49:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9633'
author: tobiu
commentsCount: 1
parentIssue: 9626
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-02T13:49:26Z'
---
# Grid: Rename bodyWrapper to view

### Description
In Epic #9626, we redesigned the Multi-Body Grid to use a unified vertical scroll mechanism and centralized VDOM orchestration under a new class: `neo.grid.View`.

However, throughout the framework (`grid.Container`, `ScrollManager.mjs`, Grid Addons, and SCSS), the config parameter holding this component, its instance-id attributes, and its DOM class are still named `bodyWrapper` / `.neo-grid-body-wrapper`.

Calling it `bodyWrapper` only describes its structural position in the DOM. Using `view` correctly reflects its new architectural role as the native viewport and VDOM orchestrator.

### Objective
Rename `bodyWrapper` to `view` across the repository to lock in the new Multi-Body architecture vocabulary.

Required refactoring targets:
1. **Config/Properties**: `bodyWrapper` -> `view` in `grid.Container`.
2. **Addon Variables**: `bodyWrapperId` -> `viewId` (used in `GridRowScrollPinning`, `GridHorizontalScrollSync`, `GridRowHoverSync`, and `ScrollManager`).
3. **SCSS/DOM**: The `.neo-grid-body-wrapper` CSS class should become `.neo-grid-view`.
4. **Testing**: Update Playwright E2E tests utilizing these selectors.

### Context
This is a follow-up sub-issue to Epic #9626 to finalize the architectural naming convention.

## Timeline

- 2026-04-02T13:06:48Z @tobiu added the `enhancement` label
- 2026-04-02T13:06:49Z @tobiu added the `ai` label
- 2026-04-02T13:06:49Z @tobiu added the `refactoring` label
- 2026-04-02T13:06:49Z @tobiu added the `architecture` label
- 2026-04-02T13:06:49Z @tobiu added the `grid` label
- 2026-04-02T13:06:57Z @tobiu added parent issue #9626
- 2026-04-02T13:48:51Z @tobiu referenced in commit `3b0d468` - "feat: multi-body grid flattened DOM architecture (#9633)"
### @tobiu - 2026-04-02T13:49:00Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ The full architectural shift towards a flattened DOM structure for the multi-body grid is now complete. The legacy `.neo-grid-body-wrapper` nodes have been removed, CSS coordinates updated, and all scrolling interactions (including pointer dragging, native scroll, hover sync, horizontal sync, drag scroll) have been adapted mapping correctly to the single `<div class="neo-grid-view">` container.
> 
> **Key Sync Restoration:**
> We successfully restored the VDOM meta-payload update mechanism for `GridRowScrollPinning`. `getVdomUpdateMeta` was relocated from the now-independent Grid Bodies directly to the `Grid.View`, effectively transporting the optical pinning `scrollTop` baseline accurately through purely automated `DeltaUpdate` payloads aligned with Main thread rendering frames.
> 
> I have committed and pushed the changes to the `dev` branch. Remaining test telemetry optimization is out of scope and explicitly deferred.

- 2026-04-02T13:49:23Z @tobiu assigned to @tobiu
- 2026-04-02T13:49:27Z @tobiu closed this issue

