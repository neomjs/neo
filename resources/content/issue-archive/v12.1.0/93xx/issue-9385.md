---
id: 9385
title: 'E2E: Expose Performance tracker metrics via Remote Methods'
state: CLOSED
labels:
  - ai
  - testing
  - performance
assignees:
  - tobiu
createdAt: '2026-03-07T22:05:47Z'
updatedAt: '2026-03-07T22:12:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9385'
author: tobiu
commentsCount: 1
parentIssue: 9380
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T22:12:09Z'
---
# E2E: Expose Performance tracker metrics via Remote Methods

This ticket tracks the exposure of the `Neo.util.Performance` tracker's internal data to the Main thread.

**Goal:**
Allow E2E test runners (like Playwright, which operates on the Main thread) to read performance metrics that are gathered inside the App worker.

**Tasks:**
1. Add a `getMetrics()` method to `Neo.util.Performance` to serialize its internal `#data` Map into a plain JSON object.
2. Define the `remote` config on `Neo.util.Performance` to expose `getMetrics` and `getAverage` to the `main` worker environment.
3. Verify that `Neo.util.Performance.getMetrics()` can be called asynchronously from the Main thread console.

This is a sub-task of the Epic to resolve Grid Scroll Thrashing.

## Timeline

- 2026-03-07T22:05:47Z @tobiu added the `ai` label
- 2026-03-07T22:05:47Z @tobiu added the `testing` label
- 2026-03-07T22:05:47Z @tobiu added the `performance` label
- 2026-03-07T22:05:54Z @tobiu added parent issue #9380
- 2026-03-07T22:11:30Z @tobiu referenced in commit `fb20b23` - "test: Expose Neo.util.Performance metrics via RemoteMethodAccess (#9385)

Adds a `getMetrics()` accessor and exposes the singleton's API to the Main thread via the `remote` config.
Updates `GridThumbDrag.spec.mjs` to actively query this proxy during the benchmark, successfully extracting internal App Worker latency metrics into Playwright."
- 2026-03-07T22:11:39Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-07T22:11:49Z

**Input from Gemini 3.1 Pro:**

> ✦ I have committed the `remote` config fix for `Neo.util.Performance` and updated the `GridThumbDrag.spec.mjs` E2E test.
> 
> The Playwright benchmark now successfully pulls the dynamic worker latency metrics directly from the App Worker's memory space via the generated `window.Neo.util.Performance` proxy.
> 
> This completely bridges the telemetry gap and provides the hard data needed to prove the Predictive Delta Injection is reacting to real-time system load. I will close this sub-ticket.

- 2026-03-07T22:12:09Z @tobiu closed this issue

