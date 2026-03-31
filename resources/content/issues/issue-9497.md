---
id: 9497
title: 'Grid Multi-Body: Split Column Collections and Orchestration'
state: CLOSED
labels:
  - epic
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-16T22:13:44Z'
updatedAt: '2026-03-31T10:10:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9497'
author: tobiu
commentsCount: 1
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-31T10:10:37Z'
---
# Grid Multi-Body: Split Column Collections and Orchestration

Phase 1 of the Multi-Body Epic (#9486).

Currently, `GridContainer` manages a single `columns` collection that dictates the order and visibility of all columns in the unified DOM structure.

To support the Multi-Body architecture (where columns are physically separated into Left, Center, and Right bodies based on their `locked` state), the data orchestration layer must be refactored first.

**Requirements:**

1. **Split Column Collections:**
   - Introduce three separate collections inside `GridContainer.mjs`: `lockedStartColumns`, `centerColumns`, and `lockedEndColumns`.
   
2. **Orchestration Pipeline:**
   - Refactor the `sortColumns()` (or initialization) logic so that when the initial `columns` array is processed, the columns are automatically distributed into the correct underlying collection based on their `locked` property (`'start'`, `null`, `'end'`).

3. **Collection APIs:**
   - Ensure `GridContainer` still exposes a unified API (e.g., getters to retrieve all columns or find a column by `dataField` regardless of which sub-collection it resides in).
   
4. **Structural Assumption:**
   - Adopt the "Always Multi-Body" structural approach internally. The collections should always exist, even if empty, to simplify the runtime locking logic in later phases.

## Timeline

- 2026-03-16T22:13:45Z @tobiu added the `epic` label
- 2026-03-16T22:13:45Z @tobiu added the `ai` label
- 2026-03-16T22:13:45Z @tobiu added the `grid` label
- 2026-03-16T22:13:58Z @tobiu added parent issue #9486
- 2026-03-17T18:59:46Z @tobiu assigned to @tobiu
- 2026-03-31T10:02:56Z @tobiu cross-referenced by #9486
- 2026-03-31T10:10:15Z @tobiu referenced in commit `a369a9a` - "feat: Parse columns into 3 internal multi-body arrays (#9497)"
### @tobiu - 2026-03-31T10:10:25Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ ### Task Complete: Phase 1 Orchestration Finished
> 
> I have completed the structural implementation for Phase 1. 
> 
> **Deviation from Original Plan:**
> Per review and refinement on #9486, I opted *not* to instantiate `centerColumns`, `lockedEndColumns`, and `lockedStartColumns` as full `Neo.collection.Base` identical clones. Instead, they are instantiated as lightweight arrays holding component references directly partitioned from the raw definition loop (in `createColumns`) and sorted items (in `onColumnLockChange`). 
> 
> This drastically reduces the internal state management overhead since we don't have to keep 4 `Neo.collection.Base` instances perfectly synchronized across mutations. 
> 
> The unified grid collection property `_columns` remains untouched, preserving full backward compatibility for any existing app relying on unified metadata like `aria-colcount` or dynamic indexing. 
> 
> Next up: SubGrid splitting.

- 2026-03-31T10:10:37Z @tobiu closed this issue

