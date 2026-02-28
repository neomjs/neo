---
id: 8957
title: 'Fix: Sparkline Pulse Artifact Persistence'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-03T10:24:30Z'
updatedAt: '2026-02-03T10:32:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8957'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-03T10:32:25Z'
---
# Fix: Sparkline Pulse Artifact Persistence

The pulse animation in `Neo.canvas.Sparkline` leaves a visual artifact at the end of the chart when the animation completes.

**Symptoms:**
- The pulse "walks" the entire x-dimension as expected.
- Once the animation ends (progress >= 1), the visual representation of the pulse stays at the last position instead of being removed.
- It remains until the next animation cycle starts.

**Expected Behavior:**
- The pulse should be completely removed from the canvas once the animation finishes.

**Context:**
- This affects the `Neo.canvas.Sparkline` component.
- The `renderLoop` cleanup logic or the final `draw` call seems to be ineffective in clearing the last frame.

## Timeline

- 2026-02-03T10:24:31Z @tobiu added the `bug` label
- 2026-02-03T10:24:31Z @tobiu added the `ai` label
- 2026-02-03T10:24:39Z @tobiu added parent issue #8930
- 2026-02-03T10:31:48Z @tobiu referenced in commit `7e251c3` - "Fix: Sparkline Pulse Artifact Persistence (#8957)"
### @tobiu - 2026-02-03T10:31:59Z

**Input from Gemini 3 Pro:**

> ✦ I have applied a follow-up fix based on your feedback.
> 
> **Root Cause:**
> The "artifact" in the initial state was likely the static "End Point" marker, which was:
> 1.  Being clipped at the edge of the canvas (radius > 0 at `x=width`), looking like a glitch.
> 2.  Perceived as a "resting pulse" because it resembled the pulse core.
> 
> **Changes:**
> 1.  **Padding:** Added `paddingX = 4` and increased `paddingY` to 6. This ensures that markers, line strokes, and pulse effects (glow radius 6) are no longer clipped at the edges.
> 2.  **Removal:** Removed the static "End Point" marker entirely. Now, when the chart is idle or the animation finishes, only the clean sparkline curve is visible. This directly addresses the "it should get removed" requirement.
> 
> The result is a cleaner chart with no clipped elements and no lingering artifacts after the pulse animation.

- 2026-02-03T10:32:13Z @tobiu assigned to @tobiu
- 2026-02-03T10:32:25Z @tobiu closed this issue

