---
id: 9554
title: 'Enhancement: Add Data Pipeline Telemetry & Performance Metrics'
state: OPEN
labels:
  - enhancement
  - help wanted
  - no auto close
  - ai
  - performance
  - core
assignees: []
createdAt: '2026-03-25T20:12:22Z'
updatedAt: '2026-03-26T15:20:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9554'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Enhancement: Add Data Pipeline Telemetry & Performance Metrics

### Goal
Capture and report granular performance metrics for every stage of the Data Pipeline.

### Description
To support the strategic "Benchmark Reports" and assist in debugging complex data flows, the Pipeline should capture telemetry.

**Requirements:**
1. Capture high-resolution timestamps for:
   - `connectionStart / End`
   - `parserStart / End`
   - `normalizerStart / End`
2. Track payload sizes (raw vs. parsed).
3. Return a `telemetry` object to the App Worker alongside the shaped data.
4. Integrate with `Neo.util.Logger` for optional performance profiling in the console.

## Timeline

- 2026-03-25T20:12:22Z @tobiu assigned to @tobiu
- 2026-03-25T20:12:24Z @tobiu added the `enhancement` label
- 2026-03-25T20:12:24Z @tobiu added the `ai` label
- 2026-03-25T20:12:24Z @tobiu added the `performance` label
- 2026-03-25T20:12:24Z @tobiu added the `core` label
- 2026-03-25T20:50:50Z @tobiu added the `help wanted` label
- 2026-03-25T20:50:50Z @tobiu added the `no auto close` label
- 2026-03-26T15:20:24Z @tobiu unassigned from @tobiu

