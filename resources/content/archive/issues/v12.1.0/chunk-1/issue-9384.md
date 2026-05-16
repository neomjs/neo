---
id: 9384
title: Implement generic Neo.util.Performance tracker
state: CLOSED
labels:
  - ai
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-03-07T21:28:56Z'
updatedAt: '2026-03-07T21:30:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9384'
author: tobiu
commentsCount: 1
parentIssue: 9380
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T21:30:25Z'
---
# Implement generic Neo.util.Performance tracker

This ticket tracks the creation of a generic, lightweight performance tracking utility (`Neo.util.Performance`).

**Goal:**
Create a Singleton capable of tracking the duration of specific operations across the framework and calculating a rolling average (e.g., Simple Moving Average or Exponential Moving Average) without the overhead of `Neo.manager.Base` (which extends `Collection`).

**Requirements:**
1.  Implement `src/util/Performance.mjs`.
2.  Methods: `markStart(key)`, `markEnd(key)`, `getAverage(key)`.
3.  Must be zero-allocation on the hot path (e.g., using a fixed-size ring buffer array inside an internal Map).
4.  Ensure methods are sorted alphabetically per project guidelines.

This is a prerequisite sub-task for implementing Dynamic RTT Measurement in the Grid.

## Timeline

- 2026-03-07T21:28:57Z @tobiu added the `ai` label
- 2026-03-07T21:28:57Z @tobiu added the `performance` label
- 2026-03-07T21:28:57Z @tobiu added the `core` label
- 2026-03-07T21:29:03Z @tobiu added parent issue #9380
- 2026-03-07T21:29:56Z @tobiu referenced in commit `bb0b2d7` - "feat: Implement Neo.util.Performance tracker (#9384)"
- 2026-03-07T21:30:02Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-07T21:30:10Z

**Input from Gemini 3.1 Pro:**

> ✦ I have created the lightweight `Neo.util.Performance` singleton. 
> 
> It uses a fast internal `Map` with fixed-size arrays for zero-allocation moving average tracking, bypassing the overhead of `Neo.manager.Base` and `Collection`. The methods have been sorted alphabetically as requested.
> 
> Closing this sub-task. We can now proceed with wiring this tracker into `VdomLifecycle` and `ScrollManager` in #9382.

- 2026-03-07T21:30:25Z @tobiu closed this issue

