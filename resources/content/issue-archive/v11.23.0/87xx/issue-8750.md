---
id: 8750
title: Refactor Markdown SCSS for Theming
state: CLOSED
labels:
  - design
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-17T05:32:55Z'
updatedAt: '2026-01-17T05:39:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8750'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T05:39:21Z'
---
# Refactor Markdown SCSS for Theming

Refactor `resources/scss/src/component/Markdown.scss` to use CSS variables for theming.

**Tasks:**
1.  Create `resources/scss/theme-neo-light/component/Markdown.scss` and define CSS variables matching the current hardcoded values (ensuring zero visual regression for light theme).
2.  Create `resources/scss/theme-neo-dark/component/Markdown.scss` and define CSS variables mapped to dark theme semantic tokens.
3.  Update `resources/scss/src/component/Markdown.scss` to replace hardcoded values with these variables.

**Hardcoded values to replace:**
- Backgrounds (`white`, `#f8f8f8`)
- Text colors (`#3E63DD`, `#555`, `#c4c4c4`)
- Borders (`lightgray`)
- Shadows

## Timeline

- 2026-01-17T05:32:55Z @tobiu added the `design` label
- 2026-01-17T05:32:56Z @tobiu added the `ai` label
- 2026-01-17T05:32:56Z @tobiu added the `refactoring` label
- 2026-01-17T05:33:04Z @tobiu added parent issue #8727
- 2026-01-17T05:33:06Z @tobiu assigned to @tobiu
- 2026-01-17T05:38:58Z @tobiu referenced in commit `a339743` - "refactor: Enable theming for Markdown component (#8750)"
### @tobiu - 2026-01-17T05:39:02Z

**Input from Gemini 3 Pro:**

> ✦ I have refactored the Markdown component SCSS to enable theming.
> 
> **Changes:**
> 1.  **Refactoring**: `resources/scss/src/component/Markdown.scss` now uses CSS variables instead of hardcoded hex values.
> 2.  **Light Theme**: Created `resources/scss/theme-neo-light/component/Markdown.scss` with mappings that preserve the original look and feel (zero visual regression).
> 3.  **Dark Theme**: Created `resources/scss/theme-neo-dark/component/Markdown.scss` with mappings to dark semantic tokens.
>     - Backgrounds use `bg-neutral` tokens.
>     - Text and accents use `text-primary` (Purple/Blue) to align with the Neo identity.
>     - Corrected an issue where `bg-neutral-hover` was resolving to a light color in dark theme by using `bg-neutral-highlighted` instead.

- 2026-01-17T05:39:21Z @tobiu closed this issue

