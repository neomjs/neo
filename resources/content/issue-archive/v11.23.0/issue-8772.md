---
id: 8772
title: Refine Dark Theme Markdown Text Color Consistency
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-17T23:58:05Z'
updatedAt: '2026-01-18T00:03:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8772'
author: tobiu
commentsCount: 2
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-18T00:03:26Z'
---
# Refine Dark Theme Markdown Text Color Consistency

To ensure consistent text color across all markdown content elements (paragraphs, lists, table cells) in the dark theme, we need to introduce a unified text color token.

**Problem:**
Currently, `p` tags in the dark theme use `--white-off` (`#DDDDEE`), while lists (`li`) and table cells (`td`) inherit the global container color (`#F0F2F0`). This creates a subtle but noticeable inconsistency in text color within articles.

**Solution:**
Introduce a `--markdown-text-color` token that maps to `--white-off` in the dark theme and the standard text color in the light theme. Apply this token to the root of the `.neo-markdown-component`, ensuring all inherited text (lists, table cells, etc.) matches the paragraph color.

**Changes:**
1.  **Dark Theme:** In `resources/scss/theme-neo-dark/component/Markdown.scss`, add `--markdown-text-color: var(--white-off);`.
2.  **Light Theme:** In `resources/scss/theme-neo-light/component/Markdown.scss`, add `--markdown-text-color: var(--sem-color-text-neutral-default);`.
3.  **Source SCSS:** In `resources/scss/src/component/Markdown.scss`, add `color: var(--markdown-text-color);` to the `.neo-markdown-component` rule.

**Scope:**
This strictly affects the content within the Markdown component, leaving navigation lists and other UI elements untouched.


## Timeline

- 2026-01-17T23:58:07Z @tobiu added the `enhancement` label
- 2026-01-17T23:58:07Z @tobiu added the `design` label
- 2026-01-17T23:58:07Z @tobiu added the `ai` label
- 2026-01-17T23:58:16Z @tobiu added parent issue #8727
- 2026-01-18T00:02:44Z @tobiu referenced in commit `3232ba0` - "enhancement: Refine Dark Theme Markdown Text Color Consistency (#8772)"
- 2026-01-18T00:02:58Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-18T00:03:04Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the markdown text color consistency update.
> 
> **Changes:**
> 1.  **Dark Theme:** Added `--markdown-text-color: var(--white-off);` to `theme-neo-dark/component/Markdown.scss`.
> 2.  **Light Theme:** Added `--markdown-text-color: var(--sem-color-text-neutral-default);` to `theme-neo-light/component/Markdown.scss`.
> 3.  **Source SCSS:** Applied `color: var(--markdown-text-color);` to `.neo-markdown-component` in `src/component/Markdown.scss`.
> 
> This ensures that all text elements within a Markdown component (including lists and table cells) default to the intended readable color, matching the `p` tags in the dark theme.

### @tobiu - 2026-01-18T00:03:08Z

**Input from Gemini 3 Pro:**

> ✦ Task complete. Markdown text color consistency improved.

- 2026-01-18T00:03:26Z @tobiu closed this issue

