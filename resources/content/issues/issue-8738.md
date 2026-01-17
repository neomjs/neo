---
id: 8738
title: Refactor Portal App Source SCSS for Theming
state: CLOSED
labels:
  - design
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-16T22:08:38Z'
updatedAt: '2026-01-16T23:28:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8738'
author: tobiu
commentsCount: 2
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T22:19:10Z'
---
# Refactor Portal App Source SCSS for Theming

Refactor the Portal App's source SCSS files to replace hardcoded hex values with semantic CSS variables (design tokens). This is necessary because the app currently relies on legacy hardcoded styles (e.g., `#fcfcfc` backgrounds) that ignore the theme switcher.

**Target Directory:**
`resources/scss/src/apps/portal/`

**Identified Issues:**
1.  **Viewport (`Viewport.scss`)**: Hardcoded `#fcfcfc` background and gradients.
2.  **Features (`home/parts/Features.scss`)**: Hardcoded scrollbar colors.
3.  **AI Toolchain (`home/parts/AiToolchain.scss`)**: Hardcoded `#3e63dd` for headlines.
4.  **Header Toolbar**: Hardcoded shadows/logo references.

**Tasks:**
1.  Scan all SCSS files in `src/apps/portal`.
2.  Replace hex colors with `var(--sem-color-...)` tokens.
3.  Ensure `!important` overrides are minimized or converted to use tokens.
4.  Verify that the new variables are correctly mapped in `theme-neo-dark` (already implemented).

This task is part of Epic #8727.

## Timeline

- 2026-01-16T22:08:39Z @tobiu added the `design` label
- 2026-01-16T22:08:39Z @tobiu added the `ai` label
- 2026-01-16T22:08:39Z @tobiu added the `refactoring` label
- 2026-01-16T22:08:45Z @tobiu added parent issue #8727
- 2026-01-16T22:08:51Z @tobiu assigned to @tobiu
- 2026-01-16T22:18:39Z @tobiu referenced in commit `8b8ffab` - "refactor: Externalize Portal App colors to CSS variables for theming (#8738)"
### @tobiu - 2026-01-16T22:18:57Z

**Input from Gemini 3 Pro:**

> ✦ Refactored Portal App SCSS to replace hardcoded hex values with app-specific CSS variables.
> 
> **Changes:**
> 1.  **Variables Defined**:
>     - `theme-neo-light/apps/portal/Viewport.scss`: Defined original hex values (`#fcfcfc`, `#3e63dd`, `#f0f0f0`) to ensure no visual regression in light mode.
>     - `theme-neo-dark/apps/portal/Viewport.scss`: Mapped these variables to semantic tokens (`sem-color-bg-neutral-default`, `sem-color-text-primary-default`, etc.) for dark mode support.
> 
> 2.  **Source Files Updated**:
>     - `src/apps/portal/Viewport.scss`: Replaced background color with `var(--portal-bg-main)`.
>     - `src/apps/portal/home/parts/Features.scss`: Replaced scrollbar colors with `var(--portal-scrollbar-thumb)` and `var(--portal-scrollbar-track)`.
>     - `src/apps/portal/home/parts/AiToolchain.scss`: Replaced headline color with `var(--portal-headline-primary)`.
> 
> This ensures the Portal App respects the theme switcher for these previously hardcoded elements.

- 2026-01-16T22:19:10Z @tobiu closed this issue
- 2026-01-16T22:22:33Z @tobiu cross-referenced by #8727
### @tobiu - 2026-01-16T23:28:37Z

**Input from Gemini 3 Pro:**

> ✦ Refactoring completed via sub-tasks:
> - #8739: `shared/content` components (`SectionsContainer`, `TreeList`, etc.)
> - #8740: `HeaderToolbar`
> - #8741: `about`, `services`, `home`, `news` subdirectories.
> 
> The Portal App SCSS is now largely theme-aware. Remaining hardcoded values in `examples/List` and `medium/List` are intentional for specific visual designs (overlays).


