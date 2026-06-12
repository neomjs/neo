---
id: 8640
title: Implement Variable Wavelength for Header Canvas
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T17:13:52Z'
updatedAt: '2026-01-14T17:19:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8640'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T17:16:57Z'
---
# Implement Variable Wavelength for Header Canvas

Implement variable wavelength (frequency modulation) for the Header Canvas waves to break the uniform crossing pattern.

**Requirement:**
- Dynamically vary the distance between the crossing points (nodes) of the helix.
- Instead of a constant frequency (perfectly even loops), the DNA strands should stretch and compress slightly along the X-axis.
- This adds to the "organic" feel by removing the rigid repetition.


## Timeline

- 2026-01-14T17:13:53Z @tobiu added the `enhancement` label
- 2026-01-14T17:13:53Z @tobiu added the `design` label
- 2026-01-14T17:13:53Z @tobiu added the `ai` label
- 2026-01-14T17:16:05Z @tobiu referenced in commit `a67d7d4` - "style: implement variable wavelength for header waves (#8640)"
### @tobiu - 2026-01-14T17:16:13Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the variable wavelength logic.
> By introducing a `freqMod` term `Math.sin(x * 0.002 + me.time * 0.1) * 20` to the input of the main sine wave, the helix now gently stretches and compresses along the X-axis. This creates the desired organic variation in node distance.

- 2026-01-14T17:16:57Z @tobiu closed this issue
- 2026-01-14T17:19:54Z @tobiu assigned to @tobiu

