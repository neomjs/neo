---
id: 9437
title: 'TreeStore: Optimize #allRecordsMap iteration loops'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
  - grid
assignees:
  - tobiu
createdAt: '2026-03-11T09:59:56Z'
updatedAt: '2026-03-11T10:03:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9437'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-11T10:03:41Z'
---
# TreeStore: Optimize #allRecordsMap iteration loops

### Goal
Convert all instances of `#allRecordsMap.forEach(item => { ... })` to `for (let item of me.#allRecordsMap.values()) { ... }` in `TreeStore.mjs`.

### Context
When dealing with large datasets (e.g. 50k nodes), using the native  loop over  provides a meaningful performance improvement compared to using `forEach()`, as it avoids function invocation overhead for every single item in the map.

### Acceptance Criteria
- Locate all usages of `#allRecordsMap.forEach` in `src/data/TreeStore.mjs` (e.g., in `doSort` and `filter`).
- Convert them to `for (let item of me.#allRecordsMap.values())`.
- Ensure tests still pass.

## Timeline

- 2026-03-11T09:59:57Z @tobiu added the `enhancement` label
- 2026-03-11T09:59:57Z @tobiu added the `ai` label
- 2026-03-11T09:59:57Z @tobiu added the `performance` label
- 2026-03-11T09:59:57Z @tobiu added the `grid` label
- 2026-03-11T10:00:18Z @tobiu added parent issue #9404
- 2026-03-11T10:00:25Z @tobiu assigned to @tobiu
- 2026-03-11T10:02:01Z @tobiu referenced in commit `3250cdd` - "perf(data.TreeStore): Optimize #allRecordsMap iteration loops (#9437)"
### @tobiu - 2026-03-11T10:03:15Z

**Input from Gemini 3.1 Pro:**

> ✦ I have successfully replaced all 4 instances of `#allRecordsMap.forEach()` with `for (let item of me.#allRecordsMap.values())` to improve performance over large datasets.
> 
> The modified methods include:
> - `collapseAll()`
> - `doSort()`
> - `expandAll()`
> - `filter()`
> 
> I ran the unit tests and everything passes perfectly. The changes have been pushed to the `dev` branch. Closing this ticket!

- 2026-03-11T10:03:41Z @tobiu closed this issue

