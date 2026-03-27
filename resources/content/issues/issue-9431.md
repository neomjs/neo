---
id: 9431
title: 'TreeStore: Fix ARIA desync (siblingIndex and siblingCount) after sort and filter'
state: CLOSED
labels:
  - bug
  - ai
  - architecture
  - grid
assignees:
  - tobiu
createdAt: '2026-03-10T14:26:02Z'
updatedAt: '2026-03-10T15:02:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9431'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-10T15:02:17Z'
---
# TreeStore: Fix ARIA desync (siblingIndex and siblingCount) after sort and filter

### Goal
Ensure `siblingIndex` and `siblingCount` are accurately recalculated when the `TreeStore` is sorted or filtered.

### Context
Currently, `TreeStore.splice()` calculates and writes `siblingIndex` and `siblingCount` directly to the record objects for lightning-fast reads during VDOM rendering (crucial for `aria-posinset` and `aria-setsize`). However, our custom `doSort()` and `filter()` overrides do not trigger this recalculation. 
- After sorting, the visual order changes, but screen readers read the old index order.
- After filtering, the visual count of siblings decreases, but screen readers announce the pre-filtered count.

### Acceptance Criteria
- Ensure `updateSiblingStats()` (or a variant) is called appropriately after sorting to update the indices of siblings.
- Ensure `updateSiblingStats()` (or a variant) is called after filtering so the sibling count strictly reflects only the *visible* siblings.
- Write unit tests in `TreeStore.spec.mjs` verifying that `siblingIndex` and `siblingCount` are correct after sorting and filtering.
- Ensure the fix remains performant and doesn't break Turbo Mode.

---

> ✦ **Implementation Guidance for Future Sessions:**
> You can reuse the testing environment in `test/playwright/unit/data/TreeStore.spec.mjs`. Be aware that updating stats during filtering might require distinguishing between the *structural* sibling count (in `#childrenMap`) and the *filtered* sibling count.

## Timeline

- 2026-03-10T14:26:04Z @tobiu added the `bug` label
- 2026-03-10T14:26:04Z @tobiu added the `ai` label
- 2026-03-10T14:26:04Z @tobiu added the `architecture` label
- 2026-03-10T14:26:04Z @tobiu added the `grid` label
- 2026-03-10T14:26:53Z @tobiu added parent issue #9404
- 2026-03-10T14:29:17Z @tobiu assigned to @tobiu
- 2026-03-10T15:01:21Z @tobiu referenced in commit `efe0bb5` - "TreeStore: Fix ARIA desync (siblingIndex and siblingCount) after sort and filter (#9431)"
### @tobiu - 2026-03-10T15:01:31Z

**Input from Gemini 3.1 Pro:**

> ✦ The ARIA desync issue (#9431) has been fixed!
> 
> I've updated `doSort()` and `filter()` in `TreeStore.mjs` to call `updateSiblingStats()`, which is now capable of correctly ignoring visually hidden nodes (due to filtering). `childCount`, `siblingCount`, and `siblingIndex` are all properly managed. The tests have also been updated to ensure coverage and no regressions. I've pushed the changes to the `dev` branch.

- 2026-03-10T15:02:17Z @tobiu closed this issue

