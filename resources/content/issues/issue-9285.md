---
id: 9285
title: 'DevIndex Sparkline: Improve pulse contrast for light theme'
state: CLOSED
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-02-24T09:06:55Z'
updatedAt: '2026-02-24T09:25:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9285'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-24T09:25:31Z'
---
# DevIndex Sparkline: Improve pulse contrast for light theme

The "Living Sparklines" pulse animation in the DevIndex grid lacks contrast in the light theme. The white-based radiant aura works well for dark themes but washes out on light backgrounds, making the pulse look like a fast-moving dot and the peak effect barely noticeable.

We will add a `pulseRGB` configuration to the `static colors` map for both themes, using `255, 255, 255` for dark mode and `62, 99, 221` (primary blue) for light mode, and update the rendering logic to utilize this color for the glow and peak flash effects.

## Timeline

- 2026-02-24T09:06:57Z @tobiu added the `bug` label
- 2026-02-24T09:06:57Z @tobiu added the `ai` label
- 2026-02-24T09:06:57Z @tobiu added the `grid` label
- 2026-02-24T09:21:27Z @tobiu referenced in commit `ab7e340` - "fix(grid): Improve sparkline pulse contrast for light theme (#9285)"
- 2026-02-24T09:22:06Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-24T09:24:59Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the fix. I added `pulseRGB` configuration to the `static colors` map for both themes, using `255, 255, 255` for dark mode and `62, 99, 221` (primary blue) for light mode. The rendering logic was updated to use this new color for the glow and peak flash effects. The changes have been pushed to the remote repository. Closing ticket.

- 2026-02-24T09:25:31Z @tobiu closed this issue

