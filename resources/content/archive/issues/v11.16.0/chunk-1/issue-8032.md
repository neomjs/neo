---
id: 8032
title: Add Glow and Transition to Cyberpunk Grid Header Buttons
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2025-12-05T02:07:39Z'
updatedAt: '2025-12-05T02:19:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8032'
author: tobiu
commentsCount: 1
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-05T02:19:56Z'
---
# Add Glow and Transition to Cyberpunk Grid Header Buttons

Add box-shadow glow and transition effects to grid header buttons in `neo-theme-cyberpunk` to match the application's toolbar aesthetics.

**Requirements:**
1.  Modify `resources/scss/src/grid/header/Button.scss`:
    -   Add `box-shadow: var(--grid-header-button-box-shadow-hover)` to the `:hover` state.
    -   Add `transition: var(--grid-header-button-transition)` to the base state.

2.  Update Themes:
    -   **`theme-cyberpunk`:**
        -   `--grid-header-button-box-shadow-hover`: `0 0 10px var(--cyber-cyan)`
        -   `--grid-header-button-transition`: `all 0.3s ease-out` (Per user feedback)
    -   **`theme-dark` / `theme-light` / `theme-neo-light`:**
        -   `--grid-header-button-box-shadow-hover`: `none`
        -   `--grid-header-button-transition`: `none` (or maintain existing if any, usually none for these components)

**Goal:**
Create a consistent "neon" interactive feel across the AgentOS UI.

## Timeline

- 2025-12-05T02:07:40Z @tobiu added the `enhancement` label
- 2025-12-05T02:07:40Z @tobiu added the `design` label
- 2025-12-05T02:07:40Z @tobiu added the `ai` label
- 2025-12-05T02:07:50Z @tobiu added parent issue #7918
- 2025-12-05T02:08:06Z @tobiu assigned to @tobiu
- 2025-12-05T02:13:36Z @tobiu referenced in commit `8c6c6d9` - "Add Glow and Transition to Cyberpunk Grid Header Buttons #8032"
### @tobiu - 2025-12-05T02:13:37Z

**Input from Gemini 2.5 pro:**

> ✦ I have added the glow and transition effects to the grid header buttons for the Cyberpunk theme.
> 
> **Implementation:**
> 1.  **Source (`src/grid/header/Button.scss`):** Added variables `--grid-header-button-transition` (base) and `--grid-header-button-box-shadow-hover` (hover).
> 2.  **Cyberpunk Theme:** Configured to `all 0.3s ease-out` and `0 0 10px var(--cyber-cyan)`.
> 3.  **Standard Themes:** Configured to `none` to maintain existing behavior.
> 
> This completes the header interactivity enhancements.

- 2025-12-05T02:19:56Z @tobiu closed this issue

