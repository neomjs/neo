---
id: 8894
title: Restore Grid Stability (Fix/Revert Teleportation)
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-27T12:04:27Z'
updatedAt: '2026-01-30T23:51:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8894'
author: tobiu
commentsCount: 1
parentIssue: 8891
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy:
  - '[x] 8893 Create Unit Test for Grid VDOM Deltas'
  - '[ ] 8892 Create Component Test for Grid Teleportation Artifacts'
blocking: []
closedAt: '2026-01-30T23:51:23Z'
---
# Restore Grid Stability (Fix/Revert Teleportation)

Based on the findings from the reproduction tests, implement a fix for the VDOM Teleportation logic or provide a mechanism to disable it for the Grid.

**Options:**
1. **Fix:** Correct the `TreeBuilder`/`VDomUpdate` logic to handle recycled components correctly during disjoint updates.
2. **Opt-Out:** Add a config to `Neo.grid.Container` (or globally) to disable Teleportation/Disjoint Updates for specific subtrees.
3. **Revert:** (Last resort) Revert the Teleportation changes if a fix is not feasible within the timeframe.

**Performance Context:**
The Buffered Grid is already highly optimized. Teleportation is expected to offer **zero performance benefit** in this context. Therefore, the **Opt-Out** strategy is a high-priority candidate as it restores stability without sacrificing performance. Any contrary claim regarding performance gains must be proven with benchmarks.

**Goal:** Restore Buffered Grid stability.


## Timeline

- 2026-01-27T12:04:28Z @tobiu added the `bug` label
- 2026-01-27T12:04:28Z @tobiu added the `ai` label
- 2026-01-27T12:04:29Z @tobiu added the `core` label
- 2026-01-27T12:04:55Z @tobiu added parent issue #8891
- 2026-01-27T12:04:58Z @tobiu marked this issue as being blocked by #8892
- 2026-01-27T12:05:03Z @tobiu marked this issue as being blocked by #8893
- 2026-01-30T23:51:19Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-30T23:51:24Z

we did update the grid inside separate tickets already, closing this one.

- 2026-01-30T23:51:24Z @tobiu closed this issue

