---
id: 8852
title: Refactor Portal Footer SCSS for Theming
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-21T15:35:50Z'
updatedAt: '2026-01-21T16:48:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8852'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-21T16:48:49Z'
---
# Refactor Portal Footer SCSS for Theming

- Refactor `resources/scss/src/apps/portal/home/FooterContainer.scss` to replace hardcoded colors (black/white) with CSS variables.
- Create `resources/scss/theme-neo-light/apps/portal/home/FooterContainer.scss` to map variables to semantic tokens.
- Create `resources/scss/theme-neo-dark/apps/portal/home/FooterContainer.scss` to map variables to semantic tokens.
- Ensure the footer adapts to the active theme immediately.

## Timeline

- 2026-01-21T15:35:51Z @tobiu added the `enhancement` label
- 2026-01-21T15:35:51Z @tobiu added the `ai` label
- 2026-01-21T15:35:52Z @tobiu added the `refactoring` label
- 2026-01-21T15:36:32Z @tobiu assigned to @tobiu
- 2026-01-21T15:36:51Z @tobiu added parent issue #8727
- 2026-01-21T16:48:21Z @tobiu referenced in commit `d0cb186` - "feat: Modernize Portal Footer and Enable Theming (#8852, #8853)

- Refactor FooterContainer layout to VBox with flex columns
- Enable full theming support (Light/Dark) with semantic tokens
- Align layout padding with page content (AiToolchain)
- Fix hover effects and contrast issues"
### @tobiu - 2026-01-21T16:48:33Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the foundation for the Portal Footer theming.
> 
> **Changes:**
> - Refactored `resources/scss/src/apps/portal/home/FooterContainer.scss` to replace hardcoded colors with CSS variables.
> - Created `resources/scss/theme-neo-light/apps/portal/home/FooterContainer.scss` and `theme-neo-dark` equivalent.
> - Ensured semantic tokens are correctly mapped (Neutral backgrounds, White text in dark mode).
> - Added `:root` selectors to theme files for proper scoping.
> 
> The footer now adapts cleanly to theme switches.

- 2026-01-21T16:48:49Z @tobiu closed this issue

