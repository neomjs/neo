---
id: 8732
title: Implement Dark Theme for General Components
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T21:06:42Z'
updatedAt: '2026-01-16T21:09:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8732'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T21:09:40Z'
---
# Implement Dark Theme for General Components

The migration script created the file structure, but many component SCSS files still contain hardcoded colors from the light theme.
We need to update these files to use semantic tokens or appropriate dark theme values.

**Scope:** `resources/scss/theme-neo-dark/component/*.scss`

**Files identified requiring updates:**
- `Toast.scss`
- `Chip.scss`
- `StatusBadge.scss`
- `Process.scss`
- `Progress.scss`
- `Splitter.scss`
- `DateSelector.scss`
- `Video.scss`
- `BoxLabel.scss`

**Task:**
Replace hardcoded hex/named colors with `var(--sem-color-...)` variables where possible, or map to dark theme core tokens.

## Timeline

- 2026-01-16T21:06:42Z @tobiu added the `enhancement` label
- 2026-01-16T21:06:43Z @tobiu added the `design` label
- 2026-01-16T21:06:43Z @tobiu added the `ai` label
- 2026-01-16T21:08:59Z @tobiu referenced in commit `6174cdb` - "feat: Implement Dark Theme for General Components (#8732)

- Update Toast, Chip, StatusBadge, Process, Progress, Splitter, DateSelector, Video, and BoxLabel SCSS
- Replace hardcoded light theme colors with dark theme semantic and core tokens"
### @tobiu - 2026-01-16T21:09:01Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the update of general components for the dark theme.
> 
> **Changes:**
> - **Toast**: Mapped backgrounds and text to dark semantic tokens.
> - **Chip**: Updated borders and text to use semantic variables.
> - **StatusBadge**: Mapped status colors (alert, error, info, success) to dark core tokens.
> - **Process**: Updated colors for dark background compatibility.
> - **Progress**: Ensured label visibility on dark bars.
> - **Splitter**: Darkened background and hover states.
> - **DateSelector**: Comprehensive update for dark mode (backgrounds, headers, cells).
> - **Video**: Adjusted ghost icon visibility.
> - **BoxLabel**: Mapped to neutral surface and text tokens.
> 
> These components should now render correctly in the dark theme.

- 2026-01-16T21:09:16Z @tobiu assigned to @tobiu
- 2026-01-16T21:09:26Z @tobiu added parent issue #8727
- 2026-01-16T21:09:40Z @tobiu closed this issue

