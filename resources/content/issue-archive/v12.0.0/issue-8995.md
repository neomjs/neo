---
id: 8995
title: 'perf: Increase Grid ScrollManager throttle to prevent worker message flooding'
state: CLOSED
labels:
  - bug
  - ai
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-02-04T23:59:02Z'
updatedAt: '2026-02-05T00:06:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8995'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-05T00:06:02Z'
---
# perf: Increase Grid ScrollManager throttle to prevent worker message flooding

**Context**
The `Neo.grid.ScrollManager` currently uses a 10ms throttle for `syncGridBody`. This is extremely aggressive (targeting 100fps) and exceeds the standard browser frame rate of 60fps (~16ms).

**Problem**
In heavy components like the Grid, a 10ms update frequency floods the message queue between the App Worker, VDom Worker, and Main Thread. This causes a backlog of updates, resulting in severe input lag (1.5 - 2s) during diagonal scrolling, as the Main Thread struggles to catch up with the worker's output ("Death Spiral").

**Solution**
Increase the throttle timer to `48ms` (approximately 20fps). This provides a safe buffer for the worker communication pipeline to clear, ensuring responsive updates without queue flooding.

**Validation**
User testing confirmed that 48ms eliminates the lag and makes updates feel "instant".

**Proposed Change**
Update `src/grid/ScrollManager.mjs`:
```javascript
syncGridBody: {type: 'throttle', timer: 48}
```

## Timeline

- 2026-02-04T23:59:02Z @tobiu assigned to @tobiu
- 2026-02-04T23:59:03Z @tobiu added the `bug` label
- 2026-02-04T23:59:03Z @tobiu added the `ai` label
- 2026-02-04T23:59:04Z @tobiu added the `performance` label
- 2026-02-04T23:59:04Z @tobiu added the `core` label
### @tobiu - 2026-02-05T00:05:31Z

**Input from Gemini 3 Pro:**

> ✦ I have analyzed the bottleneck and applied the fix.
> 
> **The Bottleneck:**
> The 10ms throttle targets a theoretical 100fps update rate. However, the browser's Main Thread typically runs at 60fps (16.6ms per frame). In a worker-based architecture like Neo.mjs, the round-trip latency (AppWorker -> VDomWorker -> MainThread) adds overhead.
> 
> Sending updates every 10ms floods the message queue faster than the Main Thread can process and render them. This creates a backlog of obsolete frames. The 1.5 - 2s lag you experienced is the system churning through this backlog ("Death Spiral").
> 
> **The Fix:**
> Increasing the throttle to `48ms` (approx 20.8fps) ensures that the worker pipeline has enough "breathing room" to process, diff, and render a frame before the next one is queued. This eliminates the backlog and results in the "instant" feel you observed.
> 
> I have updated `src/grid/ScrollManager.mjs` to use `timer: 48`.

- 2026-02-05T00:06:02Z @tobiu closed this issue
- 2026-02-05T00:32:54Z @tobiu referenced in commit `793c341` - "perf: Increase Grid ScrollManager throttle to prevent worker message flooding (#8995)"

