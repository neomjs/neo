---
id: 8638
title: Strict Vertical Clamping for Header Waves
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T16:52:41Z'
updatedAt: '2026-01-14T17:06:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8638'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T17:06:09Z'
---
# Strict Vertical Clamping for Header Waves

Strictly constrain the vertical amplitude of the "Split Stream" effect to ensure it never touches or overflows the toolbar edges, even when diverting around buttons.

**Analysis:**
The current `targetOffset` calculation uses the button's full half-height plus padding, which, when combined with the base sine wave and noise, exceeds the available vertical space (60px toolbar height).

**Solution:**
1.  Define a strict `verticalPadding` (e.g., 10px).
2.  Dynamically cap the `targetOffset` (diversion amount) based on the available space (`height/2 - padding - baseAmplitude`).
3.  Ensure that even with maximum noise/hover effect, the lines remain within bounds.


## Timeline

- 2026-01-14T16:52:43Z @tobiu added the `enhancement` label
- 2026-01-14T16:52:43Z @tobiu added the `design` label
- 2026-01-14T16:52:43Z @tobiu added the `ai` label
- 2026-01-14T16:53:40Z @tobiu assigned to @tobiu
- 2026-01-14T16:53:49Z @tobiu added parent issue #8630
- 2026-01-14T16:54:55Z @tobiu cross-referenced by #8637
- 2026-01-14T16:55:02Z @tobiu cross-referenced by #8636
- 2026-01-14T17:05:26Z @tobiu referenced in commit `2fbad4c` - "style: implement strict vertical clamping for header waves (#8638)"
### @tobiu - 2026-01-14T17:05:38Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the strict vertical clamping with a padding of 10px, as requested.
> This ensures the wave amplitude (including the button diversions) never exceeds `height/2 - 10px`, preventing overflow while maintaining visibility.

- 2026-01-14T17:06:09Z @tobiu closed this issue

