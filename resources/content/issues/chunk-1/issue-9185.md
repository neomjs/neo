---
id: 9185
title: Implement Telemetry Probe for Worker Saturation Monitoring
state: OPEN
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-16T12:54:05Z'
updatedAt: '2026-02-16T12:54:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9185'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement Telemetry Probe for Worker Saturation Monitoring

To diagnose potential worker thread saturation (which causes scroll lag but is invisible to static analysis), we need a runtime telemetry tool.

**Goal:** Implement a "Heartbeat" probe to measure the Round-Trip Time (RTT) across the worker triangle.

**Architecture:**
1.  **Main Thread Addon:** Sends a timestamped "ping" message.
2.  **App Worker:** Relays the ping to VDOM Worker.
3.  **VDOM Worker:** Relays the ping back to Main Thread.
4.  **Main Thread:** Calculates `RTT = Now - OriginalTimestamp`.

**Usage:**
-   **Low RTT (<16ms):** Healthy.
-   **High RTT (>50ms):** Saturation (VDOM diffing, GC, or Serialization bottleneck).

This provides a definitive "Lag Meter" to identify if performance issues are computational or rendering-based.

## Timeline

- 2026-02-16T12:54:06Z @tobiu added the `enhancement` label
- 2026-02-16T12:54:07Z @tobiu added the `ai` label
- 2026-02-16T12:54:07Z @tobiu added the `performance` label
- 2026-02-16T12:54:25Z @tobiu assigned to @tobiu

