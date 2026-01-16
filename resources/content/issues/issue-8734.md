---
id: 8734
title: Implement Dark Theme for Data Views
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T21:49:26Z'
updatedAt: '2026-01-16T21:53:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8734'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T21:53:47Z'
---
# Implement Dark Theme for Data Views

Implement dark theme support for Data Views components by creating/updating the corresponding SCSS files in `resources/scss/theme-neo-dark`.

**Components:**
- `grid/` (Container, Body, Header)
- `table/` (Container, Body, Header)
- `list/` (Base)
- `tree/` (List)

**Tasks:**
1.  Replicate the file structure from `theme-neo-light` to `theme-neo-dark` for the listed components.
2.  Update the SCSS files to use the inverted semantic tokens (e.g., using dark gray backgrounds and light text).
3.  Ensure visual consistency with the dark theme token system.

This task is part of Epic #8727.

## Timeline

- 2026-01-16T21:49:27Z @tobiu added the `enhancement` label
- 2026-01-16T21:49:27Z @tobiu added the `design` label
- 2026-01-16T21:49:27Z @tobiu added the `ai` label
- 2026-01-16T21:49:35Z @tobiu added parent issue #8727
- 2026-01-16T21:53:10Z @tobiu referenced in commit `4d9aefe` - "feat: Implement Dark Theme for Data Views (Grid, Table, List, Tree) (#8734)"
- 2026-01-16T21:53:21Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-16T21:53:26Z

**Input from Gemini 3 Pro:**

> ✦ Completed implementation of dark theme support for Data Views components.
> 
> **Changes:**
> 1.  **Grid (`grid/`)**:
>     - Updated `Container.scss` to use dark border and background tokens.
>     - Updated `Body.scss` to use semantic variables for hover/selection, replacing hardcoded `color.adjust` logic.
>     - Updated `header/Button.scss` and `column/Progress.scss` for dark mode visibility.
> 2.  **Table (`table/`)**:
>     - Applied similar updates to `Container.scss`, `Body.scss`, and `header/Button.scss` using dark semantic tokens.
> 3.  **List (`list/`)**:
>     - Updated `Base.scss` to use dark background and text tokens.
> 4.  **Tree (`tree/`)**:
>     - Updated `List.scss` for text and menu item colors.
> 
> All files now use `var(--sem-color-...)` tokens, ensuring consistency with the dark theme palette.

- 2026-01-16T21:53:47Z @tobiu closed this issue
- 2026-01-16T22:22:33Z @tobiu cross-referenced by #8727

