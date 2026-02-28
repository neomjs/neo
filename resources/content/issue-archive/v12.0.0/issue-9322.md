---
id: 9322
title: 'Docs: Provide empirical Delta Log proof for Grid Row Pooling in v12 Release Notes'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-02-26T23:50:02Z'
updatedAt: '2026-02-27T23:07:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9322'
author: tobiu
commentsCount: 1
parentIssue: 9339
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-27T23:07:20Z'
---
# Docs: Provide empirical Delta Log proof for Grid Row Pooling in v12 Release Notes

This ticket serves as an "Information Escrow" to provide empirical, mathematical proof of the Grid's architecture for the upcoming v12 release notes.

When documenting the new Grid Rewrite and its performance inside the DevIndex Flagship App (handling 50,000 records without a Data Worker), use these delta logs to prove the efficacy of the "Row Pooling" architecture.

### The Physics of "Zero-Latency" Scrolling

During maximum-velocity vertical scrolling stress tests, we enabled internal delta logging to observe the communication between the VDOM Worker and the Main Thread. The results validate the core architectural bets of Neo.mjs.

#### 1. The Holy Grail of Virtualization: Zero DOM Operations
The most revealing insight came from analyzing the vertical scrolling payloads (peaking at **784 deltas** per frame).

We analyzed the exact composition of the 784 operations sent to the browser during a rapid 135-row vertical scroll. The payload contained:
*   **0 `insertNode` commands.**
*   **0 `removeNode` commands.**
*   **784 `updateNode` commands.**

This is the definition of a perfectly functioning **DOM Pool**.

When a physical DOM row goes out of bounds, the Grid does not destroy it. It reassigns it to a new logical data index and physically moves it to the other side of the viewport using hardware-accelerated CSS transforms (`translate3d(0px, 4250px, 0px)`).

#### 2. The Architectural Trade-off
Why send 784 individual updates (row transforms, text changes, class toggles) instead of a few massive HTML string replacements?

We intentionally traded cheap JavaScript cycles to completely eliminate Native DOM Layout Thrashing. Generating and parsing 800 JSON objects in our highly optimized pipeline takes **< 3ms**. Forcing the browser to parse new HTML and recalculate the layout tree for ~50 rows would easily blow past the 16.6ms frame budget.

#### Appendix: Raw Delta Logs for Reference

**The Catch-Up Batching Profile (Horizontal Scroll):**
```text
Total Frames: 6
Frame 2: 168 deltas
Frame 3: 560 deltas (Max Velocity)
Frame 4: 588 deltas (Max Velocity)
Frame 5: 504 deltas
```

**The Vertical Scroll Peak (784 Deltas):**
*Note the absence of insert/remove commands. Only structural updates are sent.*
```javascript
0: {
    id: "neo-grid-body-1__row-1",
    attributes: { 'aria-rowindex': "87", 'data-record-id': "neo-record-50839", 'data-row-id': 85 },
    style: { transform: "translate3d(0px, 4250px, 0px)" }
}
1: { id: "neo-grid-body-1__row-1__cell-0", innerHTML: "86", attributes: { 'data-record-id': '...' } }
...
10: { id: "neo-vnode-353", textContent: "🏛️", cls: {add: [...], remove: [...]}, attributes: {title: '...'} }
```

## Timeline

- 2026-02-26T23:50:04Z @tobiu added the `documentation` label
- 2026-02-26T23:50:04Z @tobiu added the `ai` label
- 2026-02-26T23:52:23Z @tobiu assigned to @tobiu
- 2026-02-27T19:57:40Z @tobiu added parent issue #9339
### @tobiu - 2026-02-27T23:07:19Z

Empirical Delta Log proof has been successfully integrated into the v12.0.0 release notes under Hero Story 2.

- 2026-02-27T23:07:20Z @tobiu closed this issue

