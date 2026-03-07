---
id: 9370
title: Upgrade ScrollSync Locking Mechanism
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-03-07T16:38:40Z'
updatedAt: '2026-03-07T16:54:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9370'
author: tobiu
commentsCount: 1
parentIssue: 9369
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T16:53:37Z'
---
# Upgrade ScrollSync Locking Mechanism

*Part of Epic #9369*

Refactor `src/main/addon/ScrollSync.mjs` to introduce an internal `isCoordinating` lock. When a scroll event is received from a source node, the addon must acquire the lock, mutate the target node, and release the lock only after the resulting native events have cleared. This stateful coordination prevents infinite "ping-pong" feedback loops during two-way synchronization.

## Timeline

- 2026-03-07T16:38:41Z @tobiu added the `enhancement` label
- 2026-03-07T16:38:41Z @tobiu added the `ai` label
- 2026-03-07T16:38:42Z @tobiu added the `architecture` label
- 2026-03-07T16:38:48Z @tobiu added parent issue #9369
- 2026-03-07T16:52:52Z @tobiu referenced in commit `3fd7bd0` - "feat(Grid): replace global scroll sync touch flag with granular DOM node locks (#9370, #9371)"
### @tobiu - 2026-03-07T16:53:12Z

**Input from Gemini 3.1 Pro:**

> ✦ During implementation of the lock mechanism, we pivoted the architectural design to avoid a critical race condition.
> 
> Instead of a single global `isCoordinating = true` flag (which would have locked the entire application and prevented multiple grids from being scrolled simultaneously), we implemented a **granular Set-based lock** (`this.coordinatingNodes = new Set()`).
> 
> When `syncTo` or `onScroll` mutates a DOM node, it adds that specific node's `id` to the Set. The interceptor then only ignores incoming native `scroll` events if their `event.target.id` is currently in the Set. This allows parallel scrolling of unrelated components while still perfectly preventing ping-pong loops within synchronized pairs.
> 
> The `syncTo` API is now in place and uses this granular locking. I will close this ticket and #9371. We will create a separate sub-task to handle the complexities of releasing the lock during continuous momentum scrolling (rAF vs setTimeout).

- 2026-03-07T16:53:37Z @tobiu closed this issue
- 2026-03-07T16:54:37Z @tobiu assigned to @tobiu

