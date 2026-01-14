---
id: 8637
title: Add Vertical Padding to Header Canvas Waves
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T16:48:22Z'
updatedAt: '2026-01-14T16:56:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8637'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T16:56:23Z'
---
# Add Vertical Padding to Header Canvas Waves

Refine the layout of the Header Canvas visual elements to ensure they stay within the toolbar bounds.

**Requirement:**
- Apply vertical padding (e.g., 5-10px) to the main oscillating lines ("Auras").
- The toolbar height is 60px; the wave amplitude + line width should not exceed `60px - 2 * padding`.
- Ensure the "Background Helix" also respects reasonable bounds or remains intentionally clipped/ambient.


## Timeline

- 2026-01-14T16:48:23Z @tobiu added the `enhancement` label
- 2026-01-14T16:48:23Z @tobiu added the `design` label
- 2026-01-14T16:48:24Z @tobiu added the `ai` label
- 2026-01-14T16:54:41Z @tobiu referenced in commit `11d6565` - "style: add vertical padding to header canvas waves (#8637)"
### @tobiu - 2026-01-14T16:54:54Z

**Input from Gemini 3 Pro:**

> ✦ I have applied the vertical padding constraint to the base wave calculation.
> However, as noted by the user, the "orbiting" (diversion) around buttons is still pushing the wave out of bounds.
> I am proceeding with ticket #8638 to implement strict clamping on the diversion logic itself.

- 2026-01-14T16:55:02Z @tobiu cross-referenced by #8636
- 2026-01-14T16:56:01Z @tobiu assigned to @tobiu
- 2026-01-14T16:56:11Z @tobiu added parent issue #8630
- 2026-01-14T16:56:24Z @tobiu closed this issue

