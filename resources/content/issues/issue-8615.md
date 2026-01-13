---
id: 8615
title: Refactor Container to support atomic component moves
state: CLOSED
labels:
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-01-13T19:49:44Z'
updatedAt: '2026-01-13T22:01:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8615'
author: tobiu
commentsCount: 2
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T22:01:50Z'
---
# Refactor Container to support atomic component moves

Currently, `Neo.worker.App.moveComponent` implements custom logic to perform a "silent remove" from the old parent before inserting into the new parent. This is necessary to ensure `DeltaUpdates` receives a `moveNode` delta instead of `removeNode` + `insertNode` (which destroys DOM state like focus/iframes).

This logic should be moved into `Neo.container.Base` (or a Manager) to allow any component move operation (not just via `moveComponent`) to be atomic and state-preserving.

**Goals:**
- Enhance `Neo.container.Base` to support moving items from another container.
- Implement `moveTo(newParent, index)` or enhance `add/insert` to detect existing parent and handle transition.
- Ensure VDOM updates generate `moveNode` delta where possible.

## Timeline

- 2026-01-13T19:49:45Z @tobiu added the `ai` label
- 2026-01-13T19:49:45Z @tobiu added the `refactoring` label
- 2026-01-13T19:49:45Z @tobiu added the `core` label
- 2026-01-13T19:49:58Z @tobiu added parent issue #8601
- 2026-01-13T19:59:05Z @tobiu assigned to @tobiu
- 2026-01-13T21:53:11Z @tobiu referenced in commit `b47b9d5` - "refactor: Container supports atomic component moves, preserving state & focus (#8615)"
### @tobiu - 2026-01-13T21:53:49Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully refactored `Neo.container.Base` to support atomic component moves, preserving DOM state like input values and focus.
> 
> **Key Changes:**
> 1.  **`Container.Base.insert`:**
>     *   Refactored to handle moving existing `NeoInstance` items.
>     *   Implemented "Silent Remove + Update New Parent" strategy.
>     *   Calls `oldParent.remove(item, false, true, true)` (destroy=false, silent=true, keepMounted=true) to detach the item from the old parent's state without triggering a DOM update (which would send a `removeNode` delta).
>     *   Then, it updates the *new* parent (`me`). The VDOM diff generates an `insertNode` delta. `DeltaUpdates` uses `insertBefore` / `appendChild` which effectively moves the existing DOM node instead of destroying and recreating it.
> 
> 2.  **`Container.Base.remove` / `removeAt`:**
>     *   Added `keepMounted` argument to prevent `item.mounted = false` during the silent move process. This is critical to keep the component's lifecycle active.
> 
> 3.  **`Neo.worker.App.moveComponent`:**
>     *   Simplified to delegate the atomic move logic entirely to `parent.insert` (or `parent.add`).
>     *   Restored guardrails for `component`, `parent` existence, and `parent.isContainer`.
> 
> 4.  **`Neo.main.DeltaUpdates.moveNode`:**
>     *   Addressed a critical browser behavior (Chromium/WebKit) where reparenting a focused element causes it to lose focus (`blur` event).
>     *   Implemented logic to capture `document.activeElement` before the move.
>     *   If the active element is within the moving node, `focus()` is called on it immediately after the move operation (`insertBefore` or `replaceWith`).
>     *   This ensures the user experience is seamless, even though it may trigger a rapid `blur` -> `focus` event sequence.
> 
> **Verification:**
> *   Created a new Playwright test suite `test/playwright/component/container/AtomicMoves.spec.mjs`.
> *   **Baseline Test:** Confirmed that native DOM `appendChild` loses focus in the test environment (Chromium), validating the need for manual restoration. Also confirmed `moveBefore` (if available) would preserve it.
> *   **Input State:** Confirmed input values are preserved during a move between sibling containers.
> *   **Focus State:** Confirmed focus is preserved during a move between sibling containers.
> *   **DOM State:** Confirmed custom DOM properties are preserved.
> 
> The feature is implemented and robustly tested.

- 2026-01-13T22:01:20Z @tobiu referenced in commit `d2689b4` - "docs: Enhance JSDoc for atomic moves and focus preservation (#8615)"
### @tobiu - 2026-01-13T22:01:29Z

**Input from Gemini 3 Pro:**

> ✦ I have updated the JSDoc for `Neo.container.Base`, `Neo.worker.App`, and `Neo.main.DeltaUpdates` to explicitly document the new atomic move capabilities and focus preservation logic. This ensures that the knowledge about these significant architectural improvements is preserved in the codebase.

- 2026-01-13T22:01:50Z @tobiu closed this issue

