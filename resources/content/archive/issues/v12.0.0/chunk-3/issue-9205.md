---
id: 9205
title: Debug SyncAligns Layout Thrashing during Grid Scroll
state: CLOSED
labels:
  - ai
  - testing
  - performance
assignees:
  - tobiu
createdAt: '2026-02-18T14:22:59Z'
updatedAt: '2026-02-18T14:31:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9205'
author: tobiu
commentsCount: 1
parentIssue: 9194
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-18T14:31:27Z'
---
# Debug SyncAligns Layout Thrashing during Grid Scroll

### Objective
To determine if `DomAccess.syncAligns` is the cause of synchronous layout thrashing during Grid scrolling.

### Context
Investigation of #9204 revealed a "Forced Reflow" violation (37ms) during scrolling, while VDOM updates themselves were fast (~2-4ms).
Message volume analysis ruled out event flooding.
Code search revealed that `DomAccess.syncAligns` is attached to the global `scroll` event and calls `getBoundingClientRect`, a known layout trigger.

### Task
1.  **Instrument `DomAccess.mjs`:**
    -   Add logging to `syncAligns` to report the number of aligned elements (`this._aligns.size`).
    -   Log *what* components are being aligned (ids/classes) during the benchmark.
2.  **Run Benchmark:** Execute the Desktop Grid Scroll benchmark.
3.  **Analyze:**
    -   If `_aligns` size > 0 during the test, this is the culprit.
    -   Identify the component causing the alignment (e.g., Tooltip, Menu, SortZone).

### Outcome
Confirmation of whether `syncAligns` is the layout thrasher, and identification of the offending component(s) to optimize.

## Timeline

- 2026-02-18T14:23:01Z @tobiu added the `ai` label
- 2026-02-18T14:23:02Z @tobiu added the `testing` label
- 2026-02-18T14:23:02Z @tobiu added the `performance` label
- 2026-02-18T14:23:23Z @tobiu added parent issue #9194
- 2026-02-18T14:23:54Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-18T14:31:12Z

**Input from Gemini 3 Pro:**

> ✦ Investigation complete.
> 
> **Findings:**
> -   Instrumented `DomAccess.syncAligns` to log active alignments.
> -   Manual verification confirmed **zero logs** during grid scrolling.
> -   This definitively rules out layout thrashing caused by `syncAligns` (e.g. from tooltips or popups) as the source of the Desktop performance bottleneck.
> 
> The "Forced Reflow" observed earlier must be coming from another source, or is a secondary symptom of the heavy main thread load.
> 
> Closing this ticket as the hypothesis was proven false. The primary bottleneck remains "Scripting" (#9204).

- 2026-02-18T14:31:27Z @tobiu closed this issue

