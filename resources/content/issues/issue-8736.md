---
id: 8736
title: Implement Dark Theme for Complex Components
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T21:56:10Z'
updatedAt: '2026-01-16T21:59:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8736'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T21:59:16Z'
---
# Implement Dark Theme for Complex Components

Implement dark theme support for Complex components by updating the corresponding SCSS files in `resources/scss/theme-neo-dark`.

**Components:**
- `calendar/` (Views, Containers)
- `dialog/` (Base)
- `tooltip/` (Base)
- `draggable/` (SortZones)

**Tasks:**
1.  Update the SCSS files to use inverted semantic tokens and ensure dark mode consistency.
2.  Ensure correct contrast for text, active states, and overlays.

This task is part of Epic #8727.

## Timeline

- 2026-01-16T21:56:11Z @tobiu added the `enhancement` label
- 2026-01-16T21:56:12Z @tobiu added the `design` label
- 2026-01-16T21:56:12Z @tobiu added the `ai` label
- 2026-01-16T21:56:20Z @tobiu added parent issue #8727
- 2026-01-16T21:58:42Z @tobiu referenced in commit `fb7eb6c` - "feat: Implement Dark Theme for Complex Components (Calendar, Dialog, Tooltip) (#8736)"
- 2026-01-16T21:58:53Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-16T21:59:01Z

**Input from Gemini 3 Pro:**

> ✦ Completed implementation of dark theme support for Complex components.
> 
> **Changes:**
> 1.  **Calendar (`calendar/`)**:
>     - Updated `view/month/Component.scss`, `view/week/Component.scss`, `view/YearComponent.scss` to use dark background and border tokens.
>     - Updated `view/MainContainer.scss` with adjusted opacity for event colors to ensure visibility on dark backgrounds.
>     - Updated `EditContainer.scss` and `SettingsContainer.scss` to use surface tokens.
> 2.  **Dialog (`dialog/`)**:
>     - Updated `Base.scss` to use dark borders and primary text colors for headers.
> 3.  **Tooltip (`tooltip/`)**:
>     - Updated `Base.scss` to use `var(--sem-color-surface-primary-default)` for background and contrast text.
> 
> All components now utilize the `theme-neo-dark` semantic tokens.

- 2026-01-16T21:59:16Z @tobiu closed this issue
- 2026-01-16T22:22:33Z @tobiu cross-referenced by #8727

