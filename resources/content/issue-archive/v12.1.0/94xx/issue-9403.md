---
id: 9403
title: 'Performance: Eliminate Path scrollTop Layout Thrashing in getTargetData'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-03-08T22:44:37Z'
updatedAt: '2026-03-08T22:59:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9403'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-08T22:59:04Z'
---
# Performance: Eliminate Path scrollTop Layout Thrashing in getTargetData

**Problem:**
Profiling the Main Thread during rapid Grid scrolling reveals a secondary massive layout thrashing penalty:
- `Recalculate style`: 50.6% total time
- `get scrollTop`: 13.1% total time

This occurs because `getTargetData` unconditionally reads `node.scrollTop` and `node.scrollLeft` for **every node in the event bubble path**. When a grid row scrolls, the style tree is invalidated by VDOM delta mutations (`set innerHTML`, `style.transform`). Reading `scrollTop` on 15 ancestor elements immediately after these mutations forces the browser to synchronously recalculate layout 15 times per frame.

**Proposed Solution:**
Pass an `isTarget` boolean into `getTargetData()`.
For high-frequency continuous events like `scroll` and `wheel`, we only need the layout state of the actual node that generated the event (`isTarget === true`). 

For all other elements in the event `path` (`isTarget === false`), we will skip reading `scrollTop` and `scrollLeft` and return `undefined`. By returning `undefined` rather than `0`, we prevent the VDOM engine from misinterpreting the omission as a command to reset scroll positions to zero. 

Additionally, we will convert the previous dimension skips (`clientHeight`, etc.) to return `undefined` rather than `0` for structural safety.

## Timeline

- 2026-03-08T22:44:37Z @tobiu added the `enhancement` label
- 2026-03-08T22:44:38Z @tobiu added the `ai` label
- 2026-03-08T22:44:38Z @tobiu added the `performance` label
- 2026-03-08T22:57:56Z @tobiu referenced in commit `b10acf8` - "perf: Eliminate Path scrollTop Layout Thrashing in getTargetData (#9403)"
- 2026-03-08T22:58:05Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-08T22:58:45Z

**Input from Gemini 3.1 Pro:**

> ✦ **Task Completed:**
> 
> - Updated `getTargetData` to accept an `isTarget` boolean flag.
> - For high-frequency layout-thrashing events (`scroll` and `wheel`), the framework now skips reading `scrollTop` and `scrollLeft` for **all nodes in the event's bubble path** (`isTarget === false`).
> - Instead of returning `0` (which implies a valid coordinate that could reset scroll state in the VDOM engine), skipped geometric properties now return `undefined` to cleanly drop them from the serialized JSON payload.
> - The `event.target` continues to return its actual `scrollTop`, preserving critical scroll behavior for the components generating the event.
> 
> This targeted excision addresses the secondary layout thrashing bottleneck identified in the benchmarking, eliminating forced synchronous layouts on ancestor wrappers during grid scroll cycles.

- 2026-03-08T22:59:04Z @tobiu closed this issue

