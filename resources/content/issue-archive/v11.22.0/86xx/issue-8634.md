---
id: 8634
title: Fix HeaderCanvas Invalid Input Data Structure
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T15:29:01Z'
updatedAt: '2026-01-14T15:57:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8634'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T15:57:00Z'
---
# Fix HeaderCanvas Invalid Input Data Structure

Investigation revealed that `updateNavRects` is receiving a single object instead of an array, causing the renderer to abort. The fix is to wrap the array in a data object (e.g. `{rects: [...]}`) to prevent argument spreading/unwrapping issues during remote method invocation and align with the pattern used in `TicketCanvas`.

## Timeline

- 2026-01-14T15:29:02Z @tobiu added the `bug` label
- 2026-01-14T15:29:02Z @tobiu added the `ai` label
- 2026-01-14T15:29:10Z @tobiu added parent issue #8630
- 2026-01-14T15:34:25Z @tobiu changed title from **Debug HeaderCanvas - No Visual Output** to **Fix HeaderCanvas Invalid Input Data Structure**
- 2026-01-14T15:56:43Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-14T15:56:47Z

**Input from Gemini 3 Pro:**

> ✦ I have fixed the input data structure issue (wrapping the array in an object) and cleaned up all debug code. The renderer is now stable and receiving data correctly. Visual tuning will be handled in a separate ticket.

- 2026-01-14T15:57:01Z @tobiu closed this issue

