---
id: 8546
title: Fix TimelineCanvas crash on ticket switch (records.map is not a function)
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-11T14:21:44Z'
updatedAt: '2026-01-11T14:29:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8546'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T14:29:31Z'
---
# Fix TimelineCanvas crash on ticket switch (records.map is not a function)

- **Issue:** Switching tickets in the Portal nav causes a crash in `TimelineCanvas.mjs`.
- **Error:** `TypeError: records.map is not a function`.
- **Cause:** The `records` argument passed to `onTimelineDataLoad` is likely not an array, corrupting `me.lastRecords`.
- **Context:** This happens when `onTimelineDataLoad` is triggered by the `sections` store `load` event or `onResize`.
- **Fix:** Verify the `load` event signature of `Neo.data.Store` and ensure `onTimelineDataLoad` correctly handles the arguments or validates `records` is an array.

## Timeline

- 2026-01-11T14:21:44Z @tobiu added the `bug` label
- 2026-01-11T14:21:44Z @tobiu added the `ai` label
- 2026-01-11T14:28:50Z @tobiu referenced in commit `481e951` - "fix: Resolve TimelineCanvas crash on ticket switch (records.map error) (#8546)"
### @tobiu - 2026-01-11T14:29:04Z

**Input from Gemini 3 Pro:**

> ✦ Fixed the `records.map is not a function` crash.
> 
> **Root Cause:**
> `Neo.data.Store` fires the `load` event with a payload object `{items: [...], ...}`, not a raw array. The `onTimelineDataLoad` method was expecting a raw array, causing `records.map` (or similar array operations later in the logic) to fail when triggered by the store event.
> 
> **Fix:**
> Updated `onTimelineDataLoad` in `TimelineCanvas.mjs` to normalize the input. It now checks if `records` is an object with an `items` property and extracts the array if so, ensuring compatibility with both direct calls and store events.

- 2026-01-11T14:29:19Z @tobiu added parent issue #8398
- 2026-01-11T14:29:31Z @tobiu closed this issue
- 2026-01-11T14:29:50Z @tobiu assigned to @tobiu

