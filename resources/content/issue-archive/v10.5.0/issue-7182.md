---
id: 7182
title: Enhance `grid.VerticalScrollbar` to Support Chunked Store Loading
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-11T12:29:09Z'
updatedAt: '2025-08-11T12:40:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7182'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-08-11T12:40:47Z'
---
# Enhance `grid.VerticalScrollbar` to Support Chunked Store Loading

**Is your feature request related to a problem? Please describe.**

The `grid.VerticalScrollbar` was not correctly handling the "instant preview" feature for chunked store loads. When a large dataset was being added, the scrollbar's height was initially calculated based on the first small chunk of data, not the final total. This resulted in an incorrectly sized scrollbar until the full dataset was loaded, creating a poor user experience and layout shifts.

**Describe the solution you'd like**

The `grid.VerticalScrollbar` has been enhanced to fully support the chunked loading mechanism of `data.Store`.

1.  **`updateScrollHeight()` now uses `data.total`**: The method now accepts the store's `load` event object as a parameter. It has been updated to prioritize the `data.total` property (when available during a chunked load) over `store.count` to determine the number of records. This ensures the scrollbar's height is calculated based on the final dataset size from the very first `load` event.

2.  **Lifecycle Simplification**: The `afterSetStore` method was also simplified. A redundant manual call to `updateScrollHeight()` was removed, as the component now correctly relies on the store's guaranteed `load` event (which fires after listeners are attached) to perform its initial setup.

**Benefits of this approach:**

*   **Correct Scrollbar Sizing:** The vertical scrollbar's height is now immediately and accurately sized to reflect the entire dataset during a chunked load, providing a stable and correct UI.
*   **Improved User Experience:** Prevents the scrollbar from "jumping" or resizing, which is a much smoother experience.
*   **Code Simplification & Robustness:** The component's logic is now cleaner and more robustly aligned with the framework's event lifecycle.

## Timeline

- 2025-08-11T12:29:09Z @tobiu assigned to @tobiu
- 2025-08-11T12:29:10Z @tobiu added the `enhancement` label
- 2025-08-11T12:29:31Z @tobiu referenced in commit `2699c10` - "Enhance grid.VerticalScrollbar to Support Chunked Store Loading #7182"
- 2025-08-11T12:29:35Z @tobiu closed this issue
### @tobiu - 2025-08-11T12:39:57Z

we need to soften the check a bit more.

- 2025-08-11T12:39:57Z @tobiu reopened this issue
- 2025-08-11T12:40:37Z @tobiu referenced in commit `c1df85b` - "#7182 hotfix"
- 2025-08-11T12:40:47Z @tobiu closed this issue

