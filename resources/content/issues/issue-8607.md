---
id: 8607
title: Advanced Fragment Lifecycle Testing (Moves & Nesting)
state: CLOSED
labels:
  - ai
  - testing
  - core
assignees:
  - tobiu
createdAt: '2026-01-13T16:37:31Z'
updatedAt: '2026-01-13T19:42:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8607'
author: tobiu
commentsCount: 2
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T19:42:00Z'
---
# Advanced Fragment Lifecycle Testing (Moves & Nesting)

Extending the coverage of #8606.
Verify complex lifecycle scenarios for `Neo.container.Fragment`:
1.  **Move In:** Move a component from a Container into a child Fragment.
2.  **Move Out:** Move a component from a Fragment into its parent Container.
3.  **Cross-Fragment Move:** Move a component from Fragment A to Fragment B (siblings).
4.  **Nested Moves:** Move a component deeper into a nested Fragment hierarchy.
5.  **Renderer Parity:** Ensure these work identically in `DomApiRenderer` and `StringBasedRenderer` (via Unit tests) and visually in Browser (via Component tests).

This will be a sub-issue of Epic #8601.

## Timeline

- 2026-01-13T16:37:32Z @tobiu added the `ai` label
- 2026-01-13T16:37:32Z @tobiu added the `testing` label
- 2026-01-13T16:37:32Z @tobiu added the `core` label
- 2026-01-13T16:37:48Z @tobiu added parent issue #8601
- 2026-01-13T16:40:56Z @tobiu assigned to @tobiu
- 2026-01-13T18:13:00Z @tobiu referenced in commit `eaf3ce0` - "test: Add unit tests for Fragment move deltas (#8607)"
### @tobiu - 2026-01-13T18:13:15Z

**Input from Gemini 3 Pro:**

> ✦ Verified VDOM delta generation for Fragment move operations via new unit tests (`test/playwright/unit/vdom/FragmentMoves.spec.mjs`).
> 
> **Results:**
> 1.  **Move In:** Correctly targets Fragment ID as parent with relative index.
> 2.  **Move Out:** Correctly targets physical Container ID with physical index.
> 3.  **Cross-Fragment:** Correctly moves between logical Fragment parents.
> 4.  **Nested Moves:** Correctly handles moves into deeper Fragment levels.
> 
> The `Neo.vdom.Helper` logic produces deltas that align with the expected `DeltaUpdates` handling for fragment anchors.

- 2026-01-13T19:20:39Z @tobiu referenced in commit `80a2b73` - "test: Consolidate DeltaUpdates Fragment tests into single suite (#8607)"
- 2026-01-13T19:41:21Z @tobiu referenced in commit `f32dbf8` - "test: Finalize FragmentLifecycle E2E test suite (#8607)"
### @tobiu - 2026-01-13T19:41:46Z

**Input from Gemini 3 Pro:**

> ✦ Verified comprehensive Fragment lifecycle (Moves, Nested Moves, Cross-Fragment) via `test/playwright/component/container/FragmentLifecycle.spec.mjs`.
> All underlying issues in `DeltaUpdates` (Fragment support, move logic) and `App.mjs` (moveComponent atomicity) have been resolved.
> E2E tests pass.

- 2026-01-13T19:42:00Z @tobiu closed this issue
- 2026-01-13T19:44:50Z @tobiu referenced in commit `676a499` - "test: Cleanup console logs in FragmentMoves.spec.mjs (#8607)"
- 2026-01-13T19:45:43Z @tobiu referenced in commit `2adf708` - "test: Keep FragmentDeltaUpdates.spec.mjs as permanent DeltaUpdates test suite (#8607)"

