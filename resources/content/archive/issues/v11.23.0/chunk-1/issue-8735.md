---
id: 8735
title: Implement Dark Theme for Navigation Components
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T21:54:09Z'
updatedAt: '2026-01-16T21:55:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8735'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T21:55:47Z'
---
# Implement Dark Theme for Navigation Components

Implement dark theme support for Navigation components by updating the corresponding SCSS files in `resources/scss/theme-neo-dark`.

**Components:**
- `tab/` (Container, Strip, Header)
- `menu/` (List, Panel)
- `toolbar/` (Base)

**Tasks:**
1.  Update the SCSS files to use inverted semantic tokens and ensure dark mode consistency.
2.  Ensure correct contrast for text and active states.

This task is part of Epic #8727.

## Timeline

- 2026-01-16T21:54:11Z @tobiu added the `enhancement` label
- 2026-01-16T21:54:11Z @tobiu added the `design` label
- 2026-01-16T21:54:11Z @tobiu added the `ai` label
- 2026-01-16T21:54:23Z @tobiu added parent issue #8727
- 2026-01-16T21:55:16Z @tobiu referenced in commit `c8f7da3` - "feat: Implement Dark Theme for Navigation Components (Tab, Menu, Toolbar) (#8735)"
- 2026-01-16T21:55:29Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-16T21:55:31Z

**Input from Gemini 3 Pro:**

> ✦ Completed implementation of dark theme support for Navigation components.
> 
> **Changes:**
> 1.  **Tab (`tab/`)**:
>     - Updated `Container.scss` to use `var(--sem-color-border-default)` for borders.
>     - Verified `Strip.scss` and `header/Button.scss` utilize component tokens which map to dark semantic tokens.
> 2.  **Menu (`menu/`)**:
>     - Updated `List.scss` to use dark background, border, and icon tokens.
>     - Updated `Panel.scss` to use dark border token.
> 3.  **Toolbar (`toolbar/`)**:
>     - Updated `Base.scss` to use dark background token.
> 
> All updated files now consistently use `var(--sem-color-...)` tokens.

- 2026-01-16T21:55:47Z @tobiu closed this issue
- 2026-01-16T22:22:33Z @tobiu cross-referenced by #8727

