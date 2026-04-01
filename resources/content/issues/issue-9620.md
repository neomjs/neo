---
id: 9620
title: 'Grid Multi-Body: Fix Null Data Store and Consolidate Loading Mask'
state: OPEN
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-04-01T17:36:51Z'
updatedAt: '2026-04-01T17:37:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9620'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid Multi-Body: Fix Null Data Store and Consolidate Loading Mask

### Problem
When locked columns are configured (like the recent DevIndex test), `GridContainer` instantiates `bodyStart` and `bodyEnd` but fails to explicitly pass the `store` reference downward. This causes a fatal `TypeError: Cannot read properties of null` inside `GridBody.createViewData()` when it attempts to evaluate `.isLoading`.

Additionally, loading masks historically target the inner `GridBody`. In a Multi-Body layout, this would create fragmented loading spinners across each discrete column body. The mask must be promoted to target the unified `bodyWrapper`.

### Implementation Plan
- **GridContainer:** Update `bodyStart` and `bodyEnd` instantiation loops to explicitly map `store` and `useInternalId`.
- **Loading Mask Promotion:** Re-route `isLoading` behavior so that it masks the `bodyWrapper` instead of fragmenting across all three inner bodies.

## Timeline

- 2026-04-01T17:36:52Z @tobiu added the `bug` label
- 2026-04-01T17:36:52Z @tobiu added the `ai` label
- 2026-04-01T17:36:52Z @tobiu added the `grid` label
- 2026-04-01T17:36:58Z @tobiu added parent issue #9486
- 2026-04-01T17:37:00Z @tobiu assigned to @tobiu

