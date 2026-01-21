---
id: 8769
title: Formalize Dark Theme Blockquote Background Token
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-17T23:19:48Z'
updatedAt: '2026-01-17T23:21:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8769'
author: tobiu
commentsCount: 2
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T23:21:15Z'
---
# Formalize Dark Theme Blockquote Background Token

We are currently calculating the markdown blockquote background color using `color-mix`. We want to formalize the resulting color `#11141c` as a core token to avoid runtime calculation and make it reusable.

**Changes:**
1.  **Core Tokens:** Add `--purple-950: #11141C;` to `resources/scss/theme-neo-dark/design-tokens/Core.scss`.
2.  **Markdown Styles:** Update `resources/scss/theme-neo-dark/component/Markdown.scss` to use `var(--purple-950)` for `--markdown-blockquote-bg`.

**Rationale:**
The color `#11141c` is a very deep, desaturated purple, darker than our existing `--purple-900`. Using `--purple-950` follows standard design system conventions for "almost black" shades.


## Timeline

- 2026-01-17T23:19:49Z @tobiu added the `enhancement` label
- 2026-01-17T23:19:49Z @tobiu added the `design` label
- 2026-01-17T23:19:49Z @tobiu added the `ai` label
- 2026-01-17T23:20:13Z @tobiu added parent issue #8727
- 2026-01-17T23:20:34Z @tobiu referenced in commit `74269aa` - "enhancement: Formalize Dark Theme Blockquote Background Token (#8769)"
- 2026-01-17T23:20:48Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-17T23:20:54Z

**Input from Gemini 3 Pro:**

> ✦ I have formalized the dark theme blockquote background color as a core token.
> 
> **Changes:**
> 1.  **New Token:** Added `--purple-950: #11141C;` to `resources/scss/theme-neo-dark/design-tokens/Core.scss`.
> 2.  **Markdown Update:** Updated `resources/scss/theme-neo-dark/component/Markdown.scss` to use `var(--purple-950)` for `--markdown-blockquote-bg`, replacing the `color-mix()` calculation.
> 
> This ensures a consistent and reusable deep purple color for blockquote backgrounds in the dark theme.

### @tobiu - 2026-01-17T23:20:57Z

**Input from Gemini 3 Pro:**

> ✦ Task complete. Token formalized and applied.

- 2026-01-17T23:21:15Z @tobiu closed this issue

