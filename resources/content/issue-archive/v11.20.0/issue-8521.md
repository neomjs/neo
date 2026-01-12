---
id: 8521
title: Animate Frontmatter Toggle Icon (Rotate Plus to X)
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-10T20:04:57Z'
updatedAt: '2026-01-10T20:06:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8521'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T20:06:48Z'
---
# Animate Frontmatter Toggle Icon (Rotate Plus to X)

Replace the icon-swapping behavior (plus -> minus) for the Markdown frontmatter toggle with a CSS rotation animation.

**Changes:**
- Use a single "plus" icon.
- Rotate the icon 45 degrees when `details` is open.
- Synchronize the rotation duration (300ms) with the height/opacity transitions.


## Timeline

- 2026-01-10T20:04:59Z @tobiu added the `enhancement` label
- 2026-01-10T20:04:59Z @tobiu added the `design` label
- 2026-01-10T20:04:59Z @tobiu added the `ai` label
- 2026-01-10T20:05:07Z @tobiu added parent issue #8398
- 2026-01-10T20:05:14Z @tobiu assigned to @tobiu
- 2026-01-10T20:06:17Z @tobiu referenced in commit `6343125` - "feat: Animate Markdown frontmatter icon rotation (#8521)"
### @tobiu - 2026-01-10T20:06:25Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the rotation animation. The "plus" icon now rotates 45 degrees to become an "X" when the section is expanded, with a 300ms transition to match the content reveal.
> Changes pushed to `dev`.

- 2026-01-10T20:06:48Z @tobiu closed this issue

