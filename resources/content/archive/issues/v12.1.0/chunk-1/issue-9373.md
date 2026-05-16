---
id: 9373
title: Enable Mobile Two-Way ScrollSync for Grid VerticalScrollbar
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-03-07T16:39:27Z'
updatedAt: '2026-03-07T17:02:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9373'
author: tobiu
commentsCount: 1
parentIssue: 9369
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T17:02:39Z'
---
# Enable Mobile Two-Way ScrollSync for Grid VerticalScrollbar

*Part of Epic #9369*

Update `src/grid/VerticalScrollbar.mjs` to remove the `hasMouseEvents` restriction when registering with `ScrollSync`. It should unconditionally register for `twoWay: true` synchronization, now that the underlying `ScrollSync` addon is loop-safe via the new locking mechanism.

## Timeline

- 2026-03-07T16:39:28Z @tobiu added the `enhancement` label
- 2026-03-07T16:39:28Z @tobiu added the `ai` label
- 2026-03-07T16:39:28Z @tobiu added the `architecture` label
- 2026-03-07T16:39:33Z @tobiu added parent issue #9369
- 2026-03-07T17:01:57Z @tobiu referenced in commit `458776e` - "feat(Grid): enable two-way scroll synchronization on touch devices (#9373)"
### @tobiu - 2026-03-07T17:02:06Z

**Input from Gemini 3.1 Pro:**

> ✦ Now that the new `ScrollSync` granular locking mechanism handles event feedback loops correctly (even during rapid programmatic momentum updates), we no longer need to restrict two-way synchronization. 
> 
> I've removed the `hasMouseEvents` check from `src/grid/VerticalScrollbar.mjs`. It now unconditionally registers for `twoWay: true`.
> 
> This unlocks the ability for users on touch devices to physically grab and drag the native scrollbar thumb to scrub through massive datasets!
> 
> This ticket is complete.

- 2026-03-07T17:02:24Z @tobiu assigned to @tobiu
- 2026-03-07T17:02:39Z @tobiu closed this issue

