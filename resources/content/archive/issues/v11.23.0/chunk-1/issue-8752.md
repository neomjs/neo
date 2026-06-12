---
id: 8752
title: Refine Dark Theme Markdown Blockquote Background
state: CLOSED
labels:
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-17T05:54:12Z'
updatedAt: '2026-01-17T05:58:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8752'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T05:58:05Z'
---
# Refine Dark Theme Markdown Blockquote Background

Refine the Markdown blockquote background in the Dark Theme to use a branded dark blue/purple tint instead of neutral gray.

Change:
- `--markdown-blockquote-bg`: `var(--sem-color-bg-neutral-highlighted)` (Gray-800) -> `var(--sem-color-surface-primary-background)` (Purple-900)

This aligns the blockquote styling with the inline code blocks and the general Neo identity in dark mode, providing a subtle color tint that complements the blue border.

## Timeline

- 2026-01-17T05:54:13Z @tobiu added the `design` label
- 2026-01-17T05:54:13Z @tobiu added the `ai` label
- 2026-01-17T05:54:23Z @tobiu added parent issue #8727
- 2026-01-17T05:54:29Z @tobiu assigned to @tobiu
- 2026-01-17T05:57:44Z @tobiu referenced in commit `cd4b77c` - "style: Use subtle blue tint for Dark Theme blockquotes (#8752)"
### @tobiu - 2026-01-17T05:57:45Z

**Input from Gemini 3 Pro:**

> ✦ I have refined the blockquote background color to be much subtler.
> 
> **Change:**
> - `--markdown-blockquote-bg`: `color-mix(in srgb, var(--sem-color-surface-primary-background) 25%, var(--sem-color-bg-neutral-default))`
> 
> **Effect:**
> This mixes the Dark Blue/Purple (Purple-900) with the Page Background (Black) at a 25/75 ratio. The result is a very deep, subtle blue-gray that provides branding without being "too much".

- 2026-01-17T05:58:06Z @tobiu closed this issue

