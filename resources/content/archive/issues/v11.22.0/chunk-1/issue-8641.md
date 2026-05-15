---
id: 8641
title: Refine Header Canvas Dynamics (Phase & FM)
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T17:18:01Z'
updatedAt: '2026-01-14T17:20:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8641'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T17:20:28Z'
---
# Refine Header Canvas Dynamics (Phase & FM)

Refine the "Dynamic Life" effects based on Claude's architectural feedback to increase the organic feel of the Header Canvas.

**Refinements:**
1.  **Linked Phase (Breath/Shimmer):** Couple the shimmer cycle to the breathing cycle with a 90-degree phase lead. The strands should brighten as they begin to expand ("charge up").
2.  **Independent Strand Shimmer:** Decouple the opacity of Strand A and Strand B slightly (e.g., `PI/3` offset) to create a "call and response" effect, making them feel like separate entities intertwining.
3.  **Interactive FM Warp:** Amplify the Frequency Modulation (X-axis warping) based on local interaction `intensity`. The waves should visibly "bunch up" or distort more when flowing around a hovered button.


## Timeline

- 2026-01-14T17:18:03Z @tobiu added the `enhancement` label
- 2026-01-14T17:18:03Z @tobiu added the `design` label
- 2026-01-14T17:18:03Z @tobiu added the `ai` label
- 2026-01-14T17:19:50Z @tobiu referenced in commit `aff33c2` - "style: refine header canvas dynamics with linked phase and fm warp (#8641)"
### @tobiu - 2026-01-14T17:20:09Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the architectural refinements suggested by Claude:
> 1.  **Linked Phase:** The breathing and shimmer cycles are now coupled, with shimmer leading by 90 degrees. This creates a "charging up" effect where the strands brighten just before expanding.
> 2.  **Independent Shimmer:** Strand A and Strand B now have independent shimmer phases (offset by PI/3), creating a "call and response" interplay.
> 3.  **Interactive FM Warp:** The frequency modulation (X-axis warping) is now amplified by interaction intensity, causing the waves to visibly bunch up and energize around hovered elements.

- 2026-01-14T17:20:11Z @tobiu assigned to @tobiu
- 2026-01-14T17:20:28Z @tobiu closed this issue
- 2026-01-14T17:21:03Z @tobiu added parent issue #8630
- 2026-01-14T17:40:01Z @tobiu referenced in commit `61c6d87` - "fix: restore missing globalAlpha setup for strand A in header canvas (#8641)"
- 2026-01-14T17:53:40Z @tobiu cross-referenced by #8644

