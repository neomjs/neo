---
id: 9372
title: Refactor GridDragScroll to use ScrollSync API
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-03-07T16:39:13Z'
updatedAt: '2026-03-07T17:00:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9372'
author: tobiu
commentsCount: 1
parentIssue: 9369
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T17:00:21Z'
---
# Refactor GridDragScroll to use ScrollSync API

*Part of Epic #9369*

Update `src/main/addon/GridDragScroll.mjs` to stop mutating DOM elements directly (`scrollTop` / `scrollLeft`) during drag and momentum loops. It should now route its positional calculations through the new `ScrollSync.syncTo` API to ensure safe, loop-free mutations.

## Timeline

- 2026-03-07T16:39:14Z @tobiu added the `enhancement` label
- 2026-03-07T16:39:14Z @tobiu added the `ai` label
- 2026-03-07T16:39:14Z @tobiu added the `architecture` label
- 2026-03-07T16:39:20Z @tobiu added parent issue #9369
- 2026-03-07T16:59:55Z @tobiu referenced in commit `85f0868` - "refactor(Grid): migrate GridDragScroll to use the new ScrollSync coordinator API (#9372)"
- 2026-03-07T17:00:00Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-07T17:00:04Z

**Input from Gemini 3.1 Pro:**

> ✦ I have refactored `GridDragScroll.mjs` to stop mutating `scrollTop` and `scrollLeft` directly on the DOM nodes. 
> 
> During both active drag (`onDragMove`) and the momentum loop (`autoScroll`), the addon now calculates the target absolute scroll positions and delegates the actual DOM mutation to `Neo.main.addon.ScrollSync.syncTo()`. 
> 
> This routes all programmatic momentum scrolls through the new coordinator lock, guaranteeing that the high-frequency mutations don't trigger native `scroll` events that bounce back to `ScrollSync`.
> 
> This ticket is now complete.

- 2026-03-07T17:00:21Z @tobiu closed this issue

