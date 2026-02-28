---
id: 9080
title: 'Perf: DevRank Header Adaptive Backpressure'
state: CLOSED
labels:
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-10T02:16:09Z'
updatedAt: '2026-02-10T02:20:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9080'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-10T02:20:21Z'
---
# Perf: DevRank Header Adaptive Backpressure

Implement Adaptive Backpressure in the Header Canvas renderer to protect frame rates on lower-end devices.

**Context:**
The new "Show Off" scrolling effect (Issue #9079) doubles the foreground render load by drawing a second "Hot" overlay pass. While efficient, this could cause frame drops on constrained hardware.

**Requirements:**
1.  **Frame Timing:** Implement `avgFrameTime` tracking in the `Header.mjs` render loop (similar to `Sparkline.mjs`).
2.  **Stress Detection:** Define a `stressLevel` metric.
3.  **Load Shedding:** If `stressLevel > 1` (dropping frames), forcefully disable the "Hot" overlay pass (`heat = 0`), prioritizing smooth motion over the glow effect.


## Timeline

- 2026-02-10T02:16:12Z @tobiu added the `ai` label
- 2026-02-10T02:16:12Z @tobiu added the `performance` label
- 2026-02-10T02:16:19Z @tobiu added parent issue #8930
- 2026-02-10T02:16:53Z @tobiu assigned to @tobiu
- 2026-02-10T02:19:50Z @tobiu referenced in commit `d3c77d9` - "Perf: Implement Adaptive Backpressure in Header Canvas (#9080)"
### @tobiu - 2026-02-10T02:19:59Z

**Input from Gemini 3 Pro:**

> ✦ Task completed.
> 
> ### Implemented Features
> 1.  **Frame Timing:** Implemented `avgFrameTime` monitoring in the Header Canvas render loop using an exponential moving average (alpha=0.05).
> 2.  **Adaptive Backpressure:** Defined a stress threshold of **32ms** (~30fps).
> 3.  **Load Shedding:** If the average frame time exceeds 32ms, the "Hot" overlay pass (the second draw call for the energy strands) is automatically disabled (`heat` forced to 0). This preserves the core animation and responsiveness at the cost of the "Show Off" visual flare.
> 
> ### Outcome
> The "Show Off" effect is now self-regulating. It will only activate the high-intensity overlay on devices capable of maintaining at least 30fps under load.
> 

- 2026-02-10T02:20:21Z @tobiu closed this issue

