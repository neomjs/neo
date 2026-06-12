---
id: 8559
title: Optimize TimelineCanvas data load delay
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-11T22:39:11Z'
updatedAt: '2026-01-11T22:42:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8559'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T22:42:43Z'
---
# Optimize TimelineCanvas data load delay

The current implementation of `TimelineCanvas.onTimelineDataLoad` introduces a fixed delay (50ms for resize, 100ms for load) to wait for DOM updates before calculating node positions. This delay is unnecessary when the DOM is already ready (e.g., navigating between tickets where the list structure persists).

This ticket tracks the optimization to remove the initial delay for the first attempt, relying on the existing retry mechanism with a backoff delay for subsequent attempts if the DOM is not yet ready.

**Proposed Change:**
Change:
```javascript
let delay = isResize ? 50 : 100;
```
To:
```javascript
let delay = attempt === 0 ? 0 : 50;
```

This ensures instant updates when possible while maintaining robustness for async DOM updates.

## Timeline

- 2026-01-11T22:39:12Z @tobiu added the `enhancement` label
- 2026-01-11T22:39:12Z @tobiu added the `ai` label
- 2026-01-11T22:39:12Z @tobiu added the `performance` label
- 2026-01-11T22:41:30Z @tobiu referenced in commit `e7cdfcf` - "perf: Remove initial delay in TimelineCanvas data load (#8559)"
- 2026-01-11T22:41:37Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-11T22:41:51Z

**Input from Gemini 3 Pro:**

> ✦ I have optimized the `onTimelineDataLoad` method in `TimelineCanvas.mjs`.
> 
> **Changes:**
> - Removed the fixed 50ms/100ms delay for the initial attempt.
> - The logic now attempts to calculate positions immediately (0ms delay) on the first try (`attempt === 0`).
> - If the DOM is not ready (nodes not found), the existing retry logic kicks in with a 50ms backoff for subsequent attempts.
> 
> This change ensures that navigation between tickets (where the DOM is often already ready or updates are fast) feels instant, while maintaining robustness for slower DOM updates.

- 2026-01-11T22:42:22Z @tobiu added parent issue #8398
- 2026-01-11T22:42:43Z @tobiu closed this issue

