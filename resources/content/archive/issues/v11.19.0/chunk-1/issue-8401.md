---
id: 8401
title: Refine Markdown inline code styling in light theme
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-07T23:30:13Z'
updatedAt: '2026-01-07T23:35:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8401'
author: tobiu
commentsCount: 1
parentIssue: 8362
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T23:35:23Z'
---
# Refine Markdown inline code styling in light theme

Update `resources/scss/theme-neo-light/Global.scss` to change the background color of inline code blocks (`code:not(.hljs)`) from `#F0F2F0` to `#E6EDF7`.

This improves contrast and legibility on white backgrounds, aligning with the blue-accented Neo.mjs design language.

## Timeline

- 2026-01-07T23:30:15Z @tobiu added the `enhancement` label
- 2026-01-07T23:30:15Z @tobiu added the `design` label
- 2026-01-07T23:30:15Z @tobiu added the `ai` label
- 2026-01-07T23:30:45Z @tobiu assigned to @tobiu
- 2026-01-07T23:35:03Z @tobiu referenced in commit `e0b3f69` - "design: Refine Markdown inline code styling in light theme (#8401)"
### @tobiu - 2026-01-07T23:35:06Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the design refinement in e0b3f690f.
> Changed `code:not(.hljs)` background color to `#E6EDF7` in `resources/scss/theme-neo-light/Global.scss`.

- 2026-01-07T23:35:23Z @tobiu closed this issue
- 2026-01-07T23:35:57Z @tobiu added parent issue #8362

