---
id: 8644
title: Add Synaptic Sparks at Reconnection Points
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T17:42:40Z'
updatedAt: '2026-01-14T17:54:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8644'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T17:54:50Z'
---
# Add Synaptic Sparks at Reconnection Points

Implement a subtle "Synaptic Spark" effect to punctuate the interaction where energy strands reconnect after flowing around a button.

**Requirements:**
1.  **Detection:** Identify the X-coordinate where the diversion envelope (`offsetY`) transitions from a significant value back to near-zero (the "Reconnection Point").
2.  **Visual:** Render a subtle, momentary glow or spark (e.g., small radial gradient or bright dot) at this intersection point.
3.  **Subtlety:** Ensure the effect is not strobing or distracting. It should feel like a small discharge of energy as the fields merge back together.


## Timeline

- 2026-01-14T17:42:41Z @tobiu added the `enhancement` label
- 2026-01-14T17:42:42Z @tobiu added the `design` label
- 2026-01-14T17:42:42Z @tobiu added the `ai` label
- 2026-01-14T17:42:51Z @tobiu assigned to @tobiu
- 2026-01-14T17:42:59Z @tobiu added parent issue #8630
### @tobiu - 2026-01-14T17:53:39Z

**Input from Gemini 3 Pro:**

> ✦ We decided to revert the "Synaptic Sparks" concept.
> **Reason:** The visual result was disconnected from the organic, variable-wavelength lines. The sparks appeared at fixed logical reconnection points, but the lines themselves (due to random FM warping) were often meeting elsewhere. This broke the illusion. "Less is more" applies here; the organic flow from #8641 is superior.
> Reverting changes.

- 2026-01-14T17:54:50Z @tobiu closed this issue

