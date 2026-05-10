---
id: 8853
title: Modernize Portal Footer Layout with CSS Grid
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-21T15:36:17Z'
updatedAt: '2026-01-21T16:49:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8853'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-21T16:49:02Z'
---
# Modernize Portal Footer Layout with CSS Grid

- Refactor `apps/portal/view/home/FooterContainer.mjs` to use a CSS Grid layout for better responsiveness and alignment.
- Improve typography using Neo.mjs semantic classes.
- Standardize spacing and padding.
- Structure the DOM to be "Canvas-ready" for a future OffscreenCanvas overlay (similar to the new Header).
- Separate the version/copyright info into a distinct bottom bar.

## Timeline

- 2026-01-21T15:36:19Z @tobiu added the `enhancement` label
- 2026-01-21T15:36:19Z @tobiu added the `design` label
- 2026-01-21T15:36:19Z @tobiu added the `ai` label
- 2026-01-21T15:36:43Z @tobiu assigned to @tobiu
- 2026-01-21T15:36:54Z @tobiu added parent issue #8727
- 2026-01-21T16:48:21Z @tobiu referenced in commit `d0cb186` - "feat: Modernize Portal Footer and Enable Theming (#8852, #8853)

- Refactor FooterContainer layout to VBox with flex columns
- Enable full theming support (Light/Dark) with semantic tokens
- Align layout padding with page content (AiToolchain)
- Fix hover effects and contrast issues"
### @tobiu - 2026-01-21T16:48:37Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully modernized the Portal Footer layout.
> 
> **Changes:**
> - **Layout**: Switched to a VBox structure with a responsive 3-column content area and a separated bottom bar.
> - **Alignment**: Fixed horizontal padding to align perfectly with the `AiToolchain` section (1200px content width).
> - **Flexibility**: Added `flex: 1` to columns to ensure they fill the available space evenly.
> - **Styling**: Centered the copyright text and improved hover interactions (Brand Blue highlight).
> - **Cleanup**: Used `itemDefaults` to significantly reduce code duplication in `FooterContainer.mjs`.
> 
> The footer is now responsive, aligned, and visually consistent with the new design direction.

- 2026-01-21T16:49:03Z @tobiu closed this issue
- 2026-01-21T16:52:12Z @tobiu cross-referenced by #8854

