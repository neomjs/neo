---
id: 8768
title: Refine Dark Theme Paragraph Text Contrast
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-17T23:10:34Z'
updatedAt: '2026-01-17T23:13:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8768'
author: tobiu
commentsCount: 2
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T23:13:39Z'
---
# Refine Dark Theme Paragraph Text Contrast

To improve readability and reduce eye strain in long-form text within the Dark Theme, we will soften the contrast of paragraph text.

**Problem:**
Pure white text (`#FFFFFF`) on a pure black background (`#000000`) causes halation and eye strain when reading large blocks of text (like Markdown articles).

**Solution:**
Introduce an "off-white" color with a slight blue tint (`#DDDDEE`) for paragraph text in the dark theme.

**Changes:**
1.  **Core Tokens:** Add `--white-off: #DDDDEE;` to `resources/scss/theme-neo-dark/design-tokens/Core.scss`.
2.  **Global Styles:** Update `resources/scss/theme-neo-dark/Global.scss` to use this new token specifically for `p` tags, overriding the generic `--sem-color-fg-neutral-contrast` if necessary, or creating a specific semantic token for body text if we want to isolate it from headings/buttons.

**User Request:**
"defining the token: fully agree. if you use it for the paragraph tag => perfect, since paragaphs directly mean 'long text'. so it would not affect buttons or list items."

**Plan:**
1. Define `--white-off` in Dark Core tokens.
2. In `theme-neo-dark/Global.scss`, specifically target `p` tags to use this new color, ensuring buttons and lists (which might use the generic contrast token) remain high-contrast.


## Timeline

- 2026-01-17T23:10:34Z @tobiu added the `enhancement` label
- 2026-01-17T23:10:35Z @tobiu added the `design` label
- 2026-01-17T23:10:35Z @tobiu added the `ai` label
- 2026-01-17T23:10:42Z @tobiu added parent issue #8727
- 2026-01-17T23:12:37Z @tobiu referenced in commit `9f18189` - "enhancement: Refine Dark Theme Paragraph Text Contrast (#8768)"
- 2026-01-17T23:13:00Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-17T23:13:14Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the text contrast refinement for the Dark Theme.
> 
> **Changes:**
> 1.  **New Token:** Added `--white-off: #DDDDEE;` to `resources/scss/theme-neo-dark/design-tokens/Core.scss`.
> 2.  **Global Style Update:** Updated `resources/scss/theme-neo-dark/Global.scss` to assign `var(--white-off)` to the `p` tag selector.
> 
> This ensures that paragraph text in the dark theme has a softer, slightly blue-tinted contrast compared to the stark white used for headings and buttons, reducing eye strain for long-form reading.

### @tobiu - 2026-01-17T23:13:17Z

**Input from Gemini 3 Pro:**

> ✦ Task complete. Paragraph contrast updated.

- 2026-01-17T23:13:39Z @tobiu closed this issue

