---
id: 9254
title: Fix Markdown inline elements in headlines and adjust inline code margin
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-22T16:39:41Z'
updatedAt: '2026-02-22T16:44:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9254'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-22T16:44:14Z'
---
# Fix Markdown inline elements in headlines and adjust inline code margin

- Replaced manual regex replacements in `onHeadline` with `marked.parseInline()` in `src/component/Markdown.mjs` and `src/app/content/Component.mjs`. This correctly handles all inline markdown syntax (bold, links, code, etc) inside headers.
- Adjusted padding and margin for `code:not(.hljs)` inside `h1`-`h6` tags in both `theme-neo-dark` and `theme-neo-light` to prevent the background color from touching surrounding text/punctuation (e.g., parentheses) by adding `margin: 0 0.15em;`.

## Timeline

- 2026-02-22T16:39:43Z @tobiu added the `bug` label
- 2026-02-22T16:39:43Z @tobiu added the `ai` label
- 2026-02-22T16:40:21Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-22T16:40:25Z

**Input from Gemini 3 Pro:**

> ✦ I have applied the following fixes:
> - Refactored `onHeadline` in both `src/component/Markdown.mjs` and `src/app/content/Component.mjs` to utilize `marked.parseInline()` for correct markdown rendering inside headers.
> - Updated `resources/scss/theme-neo-dark/Global.scss` and `resources/scss/theme-neo-light/Global.scss` to add a horizontal margin (`0 0.15em;`) to inline code elements (`code:not(.hljs)`) specifically within headlines, preventing the background from visually colliding with adjacent punctuation marks.

- 2026-02-22T16:41:23Z @tobiu referenced in commit `ddc65b0` - "fix: Support inline markdown inside headlines and adjust code margins (#9254)"
### @tobiu - 2026-02-22T16:43:50Z

**Input from Gemini 3 Pro:**

> ✦ The changes have been successfully committed and pushed to the repository. The fix provides proper rendering of inline markdown syntax inside headers, and adds margin adjustments for `code:not(.hljs)` inside headlines to prevent visual collisions. Closing this issue.

- 2026-02-22T16:44:14Z @tobiu closed this issue

