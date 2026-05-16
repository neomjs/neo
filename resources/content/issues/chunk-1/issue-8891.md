---
id: 8891
title: Restore Buffered Grid Stability
state: CLOSED
labels:
  - epic
  - stale
  - ai
  - regression
assignees: []
createdAt: '2026-01-27T12:02:59Z'
updatedAt: '2026-05-12T04:54:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8891'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - '[x] 8892 Create Component Test for Grid Teleportation Artifacts'
  - '[x] 8893 Create Unit Test for Grid VDOM Deltas'
  - '[x] 8894 Restore Grid Stability (Fix/Revert Teleportation)'
  - '[x] 8898 Fix VDOM ID Corruption during Component Recycling (Structural Shifts)'
subIssuesCompleted: 4
subIssuesTotal: 4
blockedBy: []
blocking: []
closedAt: '2026-05-12T04:54:54Z'
---
# Restore Buffered Grid Stability

The Buffered Grid component is experiencing severe visual artifacts (duplicate text nodes, empty cells) and range painting issues due to the recent introduction of VDOM Teleportation and Disjoint Updates.

This Epic tracks the work to:
1. Reproduce the issues reliably with Component and Unit tests.
2. Analyze the VDOM deltas to understand the root cause.
3. Fix the underlying logic or provide a robust opt-out mechanism to restore stability.

The Grid is a flagship component, and its stability is critical.

## Timeline

- 2026-01-27T12:03:00Z @tobiu added the `epic` label
- 2026-01-27T12:03:00Z @tobiu added the `ai` label
- 2026-01-27T12:03:01Z @tobiu added the `regression` label
- 2026-01-27T12:04:48Z @tobiu added sub-issue #8892
- 2026-01-27T12:04:52Z @tobiu added sub-issue #8893
- 2026-01-27T12:04:55Z @tobiu added sub-issue #8894
- 2026-01-27T21:20:53Z @tobiu added sub-issue #8898
### @github-actions - 2026-04-28T04:50:27Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-04-28T04:50:28Z @github-actions added the `stale` label
### @github-actions - 2026-05-12T04:54:53Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2026-05-12T04:54:54Z @github-actions closed this issue

