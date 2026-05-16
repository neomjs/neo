---
id: 9020
title: Create comprehensive Playwright Unit Tests for Grid Row/Cell Pooling
state: CLOSED
labels:
  - ai
  - testing
  - performance
assignees:
  - tobiu
createdAt: '2026-02-06T18:54:59Z'
updatedAt: '2026-02-07T00:31:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9020'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-07T00:31:58Z'
---
# Create comprehensive Playwright Unit Tests for Grid Row/Cell Pooling

**Objective:**
Create a new Playwright unit test suite (`test/playwright/unit/grid/Pooling.spec.mjs`) dedicated to verifying the correctness and performance of the Grid's Row and Cell Pooling mechanisms ("Fixed-DOM-Order").

**Goals:**
1.  **Strict Delta Verification:**
    -   Validate that scrolling (vertical, horizontal, diagonal) generates **ZERO** structural DOM deltas (`moveNode`, `insertNode`, `removeNode`) for pooled elements (rows/cells).
    -   Confirm that updates are restricted to lightweight attributes (e.g., `transform`, `textContent`, `aria-rowindex`).

2.  **Edge Case Coverage:**
    -   **Vertical Scroll:** Verify row recycling.
    -   **Horizontal Scroll:** Verify cell recycling (especially with locked columns).
    -   **Diagonal Scroll:** Verify simultaneous row/cell recycling.
    -   **Buffer Range:** Verify pooling logic correctly handles the start/end of the dataset (clamping).

3.  **Performance Auditing:**
    -   Assert that the *number* of deltas matches the expected minimum (e.g., if 5 rows recycle, exactly 5 row updates + cell content updates).
    -   Challenge the system to ensure no redundant updates occur (e.g., updating hidden pool rows).

**Why:**
The current `Teleportation.spec.mjs` touches on this but is mixed with other concerns. A dedicated suite will serve as a regression guard for the critical "Fixed-DOM-Order" performance architecture.

## Timeline

- 2026-02-06T18:55:00Z @tobiu added the `ai` label
- 2026-02-06T18:55:00Z @tobiu added the `testing` label
- 2026-02-06T18:55:01Z @tobiu added the `performance` label
- 2026-02-06T18:56:28Z @tobiu assigned to @tobiu
- 2026-02-07T00:31:31Z @tobiu referenced in commit `128fc99` - "test: Add Grid Pooling unit tests (#9020)"
### @tobiu - 2026-02-07T00:31:44Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented and verified the Playwright unit test suite for Grid Pooling (`test/playwright/unit/grid/Pooling.spec.mjs`).
> 
> **Verification Results:**
> - **Vertical Scroll:** Confirmed row recycling with **ZERO** structural deltas. Rows are updated via `transform` and `aria-rowindex`.
> - **Horizontal Scroll:** Confirmed cell recycling with **ZERO** structural deltas. Cells are updated via `left` position and `innerHTML`.
> - **Performance Audit:** Validated O(1) performance. Scrolling 1 row generates exactly 1 row update + 6 cell updates (7 total deltas), proving minimal overhead.
> - **Robustness:** Tests handle buffer thresholds (160px scroll) and verify no duplicate updates or invalid IDs.
> 
> The tests act as a strict regression guard for the "Fixed-DOM-Order" architecture.

- 2026-02-07T00:31:58Z @tobiu closed this issue

