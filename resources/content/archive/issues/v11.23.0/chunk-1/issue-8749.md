---
id: 8749
title: Update Global Dark Theme Inline Code Background
state: CLOSED
labels:
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-17T05:26:29Z'
updatedAt: '2026-01-17T05:29:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8749'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T05:29:42Z'
---
# Update Global Dark Theme Inline Code Background

Update the background color of inline `code` blocks (excluding `.hljs`) in the dark theme to align with the Neo identity and the light theme's blue aesthetic.

Change:
- `background-color`: `var(--gray-800)` -> `var(--sem-color-surface-primary-background)` (Purple-900)

This creates a consistent "blue variant" look for code highlights across themes.

## Timeline

- 2026-01-17T05:26:30Z @tobiu added the `design` label
- 2026-01-17T05:26:30Z @tobiu added the `ai` label
- 2026-01-17T05:26:37Z @tobiu added parent issue #8727
- 2026-01-17T05:26:39Z @tobiu assigned to @tobiu
- 2026-01-17T05:29:18Z @tobiu referenced in commit `7bf6e89` - "feat: Update inline code background for dark theme (#8749)"
### @tobiu - 2026-01-17T05:29:21Z

**Input from Gemini 3 Pro:**

> ✦ I have updated the inline code background color for the dark theme.
> 
> **Change:**
> - `background-color`: `var(--sem-color-surface-primary-background)` (Purple-900)
> 
> This creates a consistent blue variant look for code highlights, matching the light theme's intent.

- 2026-01-17T05:29:42Z @tobiu closed this issue

