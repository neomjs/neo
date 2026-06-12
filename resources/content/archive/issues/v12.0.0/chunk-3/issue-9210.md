---
id: 9210
title: 'Regression: Unit Test Failures in Teleportation.spec.mjs after #9200'
state: CLOSED
labels:
  - bug
  - ai
  - testing
  - regression
assignees:
  - tobiu
createdAt: '2026-02-19T12:52:00Z'
updatedAt: '2026-02-19T13:12:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9210'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-19T13:12:01Z'
---
# Regression: Unit Test Failures in Teleportation.spec.mjs after #9200

Unit tests in `test/playwright/unit/grid/Teleportation.spec.mjs` are failing with `TypeError: Cannot read properties of undefined (reading '0')` when accessing `cell.cn[0]`.

This started happening after the introduction of `Neo.grid.column.Component` optimization (Issue #9200).

**Hypothesis:**
The optimization relies on `record.version` to short-circuit updates. If `Teleportation.spec.mjs` uses plain objects (where `version` is undefined), the optimization might trigger incorrectly (undefined === undefined), preventing components from rendering or updating when they should.

**Objective:**
1. Investigate `Teleportation.spec.mjs` to understand how it mocks data.
2. Fix `Neo.grid.column.Component` to handle cases where `record.version` is undefined (fallback to standard update).
3. Ensure unit tests pass.

## Timeline

- 2026-02-19T12:52:02Z @tobiu added the `bug` label
- 2026-02-19T12:52:02Z @tobiu added the `ai` label
- 2026-02-19T12:52:02Z @tobiu added the `testing` label
- 2026-02-19T12:52:03Z @tobiu added the `regression` label
### @tobiu - 2026-02-19T13:11:03Z

**Input from Gemini 3 Pro:**

> ✦ Resolved regression in `test/playwright/unit/grid/Teleportation.spec.mjs`.
> 
> **Root Cause:**
> The test failure was unrelated to the new Record Versioning feature. It was a pre-existing fragility in the test code that was exposed by the environment change (possibly test sharding or load).
> 
> The test assumed that `rowComponent.vdom.cn[1]` always corresponded to the second logical column. However, `Neo.grid.column.Component` uses `hideMode: 'visibility'`, which classifies it as a "Permanent Cell" in `Neo.grid.Row`'s architecture. Permanent cells are appended *after* the fixed "Pooled Cells" array.
> 
> In the test scenario:
> - Column 0 (ID): Pooled (Index 0)
> - Column 1 (Component): Permanent (Appended at Index 20, assuming pool size 20)
> - `cn[1]` was actually a hidden placeholder cell from the pool, which naturally had no content, causing `cell.cn[0]` to throw "Cannot read properties of undefined".
> 
> **Fix:**
> Updated `Teleportation.spec.mjs` to robustly locate the component cell by inspecting the VDOM content (`vdom.cn.find(...)`) rather than relying on a hardcoded index. I also added detailed JSDoc to the test file to explain this "Full Pool Rendering" structure for future reference.

### @tobiu - 2026-02-19T13:12:01Z

resolved via https://github.com/neomjs/neo/commit/fe0169af31c9740e5d798d8473783f9b2b1b3867

- 2026-02-19T13:12:01Z @tobiu closed this issue
- 2026-02-19T13:12:03Z @tobiu assigned to @tobiu

