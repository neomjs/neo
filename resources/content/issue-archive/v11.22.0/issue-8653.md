---
id: 8653
title: Throttle MouseMove Events in HeaderCanvas
state: CLOSED
labels:
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-14T19:52:51Z'
updatedAt: '2026-01-14T19:55:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8653'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T19:55:45Z'
---
# Throttle MouseMove Events in HeaderCanvas

Implemented throttling for `onMouseMove` events in `HeaderCanvas.mjs`.

- Added `static delayable` configuration.
- Configured `throttle` with a `delay` of 16ms (approx 60fps) to prevent worker flooding on high-refresh rate displays.

## Timeline

- 2026-01-14T19:52:52Z @tobiu added the `ai` label
- 2026-01-14T19:52:52Z @tobiu added the `performance` label
- 2026-01-14T19:53:23Z @tobiu added parent issue #8630
- 2026-01-14T19:54:18Z @tobiu referenced in commit `0b4c749` - "perf: Throttle onMouseMove in HeaderCanvas (#8653)"
- 2026-01-14T19:54:32Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-14T19:54:36Z

**Input from Gemini 3 Pro:**

> ✦ Implemented throttling for `onMouseMove` events in `HeaderCanvas.mjs`.
> - Added `static delayable` configuration.
> - Configured `throttle` with a `delay` of 16ms (approx 60fps) to prevent worker flooding on high-refresh rate displays.
> - Used `delay` property as instructed (deviating from `timer` seen in `Base.mjs` JSDoc/impl, assuming override/correction).

- 2026-01-14T19:55:45Z @tobiu closed this issue

