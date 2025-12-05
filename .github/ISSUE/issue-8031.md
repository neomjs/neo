---
id: 8031
title: Fix Grid Header Button Border on Hover
state: OPEN
labels:
  - bug
  - design
  - ai
assignees: []
createdAt: '2025-12-05T01:01:55Z'
updatedAt: '2025-12-05T01:01:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8031'
author: tobiu
commentsCount: 0
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Fix Grid Header Button Border on Hover

Implement a cyan hover effect for grid header button borders in `neo-theme-cyberpunk`.

**Requirements:**
1.  Modify `resources/scss/src/grid/header/Button.scss`:
    -   Introduce `--grid-header-button-border-color`.
    -   Introduce `--grid-header-button-border-color-hover`.
    -   Update the `border-right` rule to use `--grid-header-button-border-color`.
    -   Add a `:hover` state that applies `--grid-header-button-border-color-hover` to the border.

2.  Update Themes:
    -   **`theme-cyberpunk`:**
        -   Set `--grid-header-button-border-color` to `var(--cyber-border)`.
        -   Set `--grid-header-button-border-color-hover` to `var(--cyber-cyan)`.
    -   **`theme-dark` / `theme-light` / `theme-neo-light`:**
        -   Set `--grid-header-button-border-color` to `var(--grid-container-border-color)`.
        -   Set `--grid-header-button-border-color-hover` to `var(--grid-container-border-color)` (to maintain existing "no change on hover" behavior).

**Goal:**
Ensure the grid header borders glow cyan on hover in the Cyberpunk theme, while remaining consistent in all other themes (dark, light, neo-light).

## Activity Log

- 2025-12-05 @tobiu added the `bug` label
- 2025-12-05 @tobiu added the `design` label
- 2025-12-05 @tobiu added the `ai` label
- 2025-12-05 @tobiu added parent issue #7918

