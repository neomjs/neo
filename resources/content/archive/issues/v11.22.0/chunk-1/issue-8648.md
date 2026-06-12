---
id: 8648
title: Apply Ribbon Effect to Background Helix
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T19:12:03Z'
updatedAt: '2026-01-14T19:16:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8648'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T19:16:08Z'
---
# Apply Ribbon Effect to Background Helix

Explore applying the "Ribbon" effect (filled gradient twisting surface) to the background "Ambient Helix" waves.

**Current State:**
- Foreground "Split Stream" (small waves) has a full 3D effect: Ribbon Fill + Neon Tube Strokes.
- Background "Ambient Helix" (large waves) is just wide, low-opacity strokes.

**Objective:**
- Apply the `drawRibbon` logic to the background waves (`drawAmbientBackground`).
- Use a very subtle, low-opacity fill to create a massive, twisting "background structure" without overpowering the foreground.
- Keep the "Neon Core" effect exclusive to the foreground to maintain depth hierarchy.

**Implementation:**
- Extract point calculation for background waves (similar to `calculateStrandPoints`).
- Implement `drawRibbon` for the background layer.

## Timeline

- 2026-01-14T19:12:04Z @tobiu added the `enhancement` label
- 2026-01-14T19:12:04Z @tobiu added the `ai` label
- 2026-01-14T19:12:23Z @tobiu added parent issue #8630
- 2026-01-14T19:15:22Z @tobiu referenced in commit `75341a8` - "feat: Apply Ribbon effect to background helix (#8648)"
- 2026-01-14T19:15:31Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-14T19:15:43Z

**Input from Gemini 3 Pro:**

> ✦ Applied the **Ribbon Effect** to the background "Ambient Helix" waves.
> - Used a very low opacity gradient (0.02 - 0.05) to fill the space between the background strands.
> - This adds volumetric depth to the negative space while maintaining the "out of focus" look relative to the foreground.

- 2026-01-14T19:16:08Z @tobiu closed this issue

