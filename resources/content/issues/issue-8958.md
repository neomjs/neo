---
id: 8958
title: 'Enhancement: Sparkline Scanner Text Positioning'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-03T10:38:53Z'
updatedAt: '2026-02-03T10:40:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8958'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-03T10:40:33Z'
---
# Enhancement: Sparkline Scanner Text Positioning

Improve the positioning of the scanner text label in `Neo.canvas.Sparkline`.
Currently, the text is centered on the scanner line for most of the chart, causing the dashed line to visually "cut" through the text.

**Goal:**
- Always place the text to the **right** of the scanner line (`textAlign: 'left'`) if there is sufficient space.
- Only flip the text to the **left** of the scanner line (`textAlign: 'right'`) when approaching the right edge of the canvas.
- Remove the centered text state completely.

This will improve readability and visual aesthetics.

## Timeline

- 2026-02-03T10:38:54Z @tobiu added the `enhancement` label
- 2026-02-03T10:38:54Z @tobiu added the `ai` label
- 2026-02-03T10:39:03Z @tobiu added parent issue #8930
- 2026-02-03T10:39:42Z @tobiu assigned to @tobiu
- 2026-02-03T10:40:00Z @tobiu referenced in commit `321daec` - "Enhancement: Sparkline Scanner Text Positioning (#8958)"
### @tobiu - 2026-02-03T10:40:12Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the requested enhancement for the scanner text positioning.
> 
> **Changes:**
> - Removed the centered text logic entirely.
> - The text now defaults to `textAlign: 'left'` (positioned to the **right** of the scanner line) with a 6px offset.
> - Only when the scanner line approaches the right edge (within 50px), the text flips to `textAlign: 'right'` (positioned to the **left** of the scanner line) with a -6px offset.
> 
> This prevents the dashed line from cutting through the text and ensures consistent alignment.

- 2026-02-03T10:40:33Z @tobiu closed this issue

