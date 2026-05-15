---
id: 9153
title: '[DevIndex] Add Bio Filter and Hireable Checkbox'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-14T17:54:54Z'
updatedAt: '2026-02-14T18:15:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9153'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-14T18:15:39Z'
---
# [DevIndex] Add Bio Filter and Hireable Checkbox

Add search and filter capabilities to the DevIndex ControlsContainer.

**Requirements:**
1.  **Bio Filter:** Add a Text field to `ControlsContainer` to filter the grid by `bio` (case-insensitive, partial match).
    -   Use `operator: 'like'` for the store filter.
2.  **Hireable Checkbox:** Add a Checkbox to `ControlsContainer` to filter by `isHireable`.
    -   Unchecked: Show all users (Filter disabled).
    -   Checked: Show only users where `isHireable === true` (Filter enabled, operator `===`).
3.  **Store Logic:** Implement the filtering logic in `Contributors` store, leveraging `src/collection/Filter.mjs` capabilities.

## Timeline

- 2026-02-14T17:54:54Z @tobiu added the `enhancement` label
- 2026-02-14T17:54:55Z @tobiu added the `ai` label
- 2026-02-14T17:55:04Z @tobiu added parent issue #9106
- 2026-02-14T18:14:40Z @tobiu referenced in commit `f935545` - "feat(devindex): Add Bio Filter and Hireable Checkbox (#9153)

- Add text filter for 'bio' (operator: 'like')
- Add checkbox filter for 'isHireable' (operator: '===')
- Refactor ControlsContainer listeners to target MainContainerController directly"
### @tobiu - 2026-02-14T18:15:11Z

**Input from Gemini 3 Pro:**

> ✦ Implemented Bio Filter and Hireable Checkbox.
> 
> **Changes:**
> *   **Bio Filter:** Added text field to ControlsContainer filtering `bio` using the `like` operator.
> *   **Hireable Filter:** Added checkbox to ControlsContainer filtering `isHireable` (true only when checked).
> *   **Refactoring:** Updated `ControlsContainer` to delegate events directly to `MainContainerController`.
> *   **Controller:** Implemented `onFilterChange` and `onHireableChange` in `MainContainerController`.
> 
> **Note:** A regression has been identified where Icon columns do not visually update after filtering. This will be tracked in a separate ticket.

- 2026-02-14T18:15:24Z @tobiu assigned to @tobiu
- 2026-02-14T18:15:39Z @tobiu closed this issue

