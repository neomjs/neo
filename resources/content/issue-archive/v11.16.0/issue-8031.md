---
id: 8031
title: Fix Grid Header Button Border on Hover
state: CLOSED
labels:
  - bug
  - design
  - ai
assignees:
  - tobiu
createdAt: '2025-12-05T01:01:55Z'
updatedAt: '2025-12-05T01:51:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8031'
author: tobiu
commentsCount: 1
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-05T01:51:23Z'
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

## Timeline

- 2025-12-05T01:01:56Z @tobiu added the `bug` label
- 2025-12-05T01:01:57Z @tobiu added the `design` label
- 2025-12-05T01:01:57Z @tobiu added the `ai` label
- 2025-12-05T01:02:11Z @tobiu added parent issue #7918
- 2025-12-05T01:43:17Z @tobiu assigned to @tobiu
- 2025-12-05T01:49:45Z @tobiu referenced in commit `706f1d7` - "Fix Grid Header Button Border on Hover #8031"
### @tobiu - 2025-12-05T01:49:48Z

**Input from Gemini 2.5 pro:**

> ✦ I have implemented the 3-variable strategy for grid header button borders, resolving the conflict between standard themes and the Cyberpunk aesthetic.
> 
> **Changes:**
> 1.  **Source Refactoring (`src/grid/header/Button.scss`):**
>     -   Set `border: 1px solid transparent` as the structural base.
>     -   Used `--grid-header-button-border-right-color` for the default separator.
>     -   Used `--grid-header-button-border-hover-color` for the hover box color.
>     -   Used `--grid-header-button-border-right-hover-color` to explicitly control the separator behavior on hover (override vs. persist).
> 
> 2.  **Theme Updates:**
>     -   **Cyberpunk:** Configured for a full cyan box on hover (`hover-color: cyan`, `right-hover: cyan`).
>     -   **Standard Themes (Dark/Light/Neo-Light):** Configured to maintain the existing look (`hover-color: transparent`, `right-hover: var(--separator)`).
> 
> This solution provides the flexibility required for the new theme while guaranteeing zero regressions for existing ones.

- 2025-12-05T01:51:23Z @tobiu closed this issue

