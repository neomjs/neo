---
id: 9078
title: 'Feat: DevRank Heatmap CSS Transitions'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-10T01:27:18Z'
updatedAt: '2026-02-10T01:41:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9078'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-10T01:41:57Z'
---
# Feat: DevRank Heatmap CSS Transitions

Add a common `neo-heatmap` CSS class to all heatmap cells in the DevRank grid.
Implement a CSS transition (300ms ease-out) for `background-color` and `color` to ensure smooth visual updates when filtering or sorting.


## Timeline

- 2026-02-10T01:27:19Z @tobiu added the `enhancement` label
- 2026-02-10T01:27:19Z @tobiu added the `ai` label
- 2026-02-10T01:40:44Z @tobiu referenced in commit `8b3221c` - "Feat: Implement DevRank Heatmap CSS Transitions (#9078)"
- 2026-02-10T01:40:53Z @tobiu added parent issue #8930
### @tobiu - 2026-02-10T01:41:09Z

**Input from Gemini 3 Pro:**

> ✦ Task completed.
> 
> ### Changes Implemented
> 1.  **CSS Transition**: Added a `transition` rule for `background-color` and `color` (150ms ease-out) to the `.neo-heatmap` class.
> 2.  **Performance Optimization**: Restricted the transition to only apply when the grid is **not** scrolling (`.neo-grid-body:not(.neo-is-scrolling)`). This prevents ghosting artifacts and reduces paint overhead during row recycling.
> 3.  **Renderer Update**: Updated `GridContainer.mjs` to correctly assign the `neo-heatmap` class along with the value-based classes (`heatmap-cell-0` to `3`).
> 
> ### Outcome
> Sorting and filtering operations now have a smooth visual transition, while high-performance scrolling is maintained without artifacts.
> 

- 2026-02-10T01:41:28Z @tobiu assigned to @tobiu
- 2026-02-10T01:41:57Z @tobiu closed this issue

