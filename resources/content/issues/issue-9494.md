---
id: 9494
title: 'Grid Multi-Body: Implement Direct Main-Thread Scroll Sync via MessageChannel'
state: OPEN
labels:
  - epic
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-16T21:40:51Z'
updatedAt: '2026-03-17T18:59:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9494'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid Multi-Body: Implement Direct Main-Thread Scroll Sync via MessageChannel

When SubGrids are split across different browser windows, routing high-frequency scroll events through the App Worker (`Main A -> App Worker -> Main B`) introduces unacceptable latency. 

**Requirements:**
1. **MessageChannel Setup:** Create a mechanism where a Main Thread Addon in Window A creates a `MessageChannel`.
2. **Port Delegation:** Pass `port2` of the channel through the App Worker to the corresponding Main Thread Addon in Window B.
3. **Direct Sync:** Use the direct channel to synchronize vertical `scrollTop` events between the windows. A slight delay is acceptable given the physical separation of monitors.

## Timeline

- 2026-03-16T21:40:52Z @tobiu added the `epic` label
- 2026-03-16T21:40:52Z @tobiu added the `ai` label
- 2026-03-16T21:40:53Z @tobiu added the `grid` label
- 2026-03-16T21:41:23Z @tobiu cross-referenced by #9486
- 2026-03-16T21:41:29Z @tobiu added parent issue #9486
- 2026-03-17T18:59:29Z @tobiu assigned to @tobiu

