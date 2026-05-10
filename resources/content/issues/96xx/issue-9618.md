---
id: 9618
title: DevIndex High-Velocity Grid Thumb Drag Scroll Jitter
state: CLOSED
labels:
  - bug
  - ai
  - regression
  - grid
assignees:
  - tobiu
createdAt: '2026-04-01T10:22:23Z'
updatedAt: '2026-04-01T16:24:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9618'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-01T16:24:45Z'
---
# DevIndex High-Velocity Grid Thumb Drag Scroll Jitter

When testing manually, thumb drag scroll inside the DevIndex app at ~50px per second (which moves content on 100s of grid rows) can still lead to a blank page for multiple seconds. 

Since the current synthetic E2E tests do not reliably catch this specific magnitude of jitter (which involves hundreds of rows), the first step is to improve the E2E drag telemetry to accurately measure this failure mode. Once the measurement is solid, the underlying `GridRowScrollPinning` math and render cycles must be stabilized for the Multi-Body architecture.

## Timeline

- 2026-04-01T10:22:25Z @tobiu added the `bug` label
- 2026-04-01T10:22:25Z @tobiu added the `ai` label
- 2026-04-01T10:22:25Z @tobiu added the `regression` label
- 2026-04-01T10:22:25Z @tobiu added the `grid` label
- 2026-04-01T10:22:33Z @tobiu added parent issue #9486
- 2026-04-01T10:22:44Z @tobiu assigned to @tobiu
- 2026-04-01T15:46:37Z @tobiu referenced in commit `a5ca902` - "fix(grid): Eliminate DevIndex blank pages by replacing GridRowScrollPinning timeout with blur listener (#9618)"
- 2026-04-01T16:24:45Z @tobiu closed this issue

