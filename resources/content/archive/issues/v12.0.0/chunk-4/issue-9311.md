---
id: 9311
title: 'Bug / Enhancement: Fix unstable sorting & enforce nulls at bottom'
state: CLOSED
labels:
  - bug
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-02-26T15:41:26Z'
updatedAt: '2026-02-26T15:47:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9311'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-26T15:47:45Z'
---
# Bug / Enhancement: Fix unstable sorting & enforce nulls at bottom

Sorting columns with mapped data and missing values (like `company` in DevIndex) resulted in unstable, varying sort orders that seemingly "improved" the more times a sort was triggered. 

This occurred due to two overlapping issues:
1. **Soft Hydration Inconsistency**: `Neo.data.Store#resolveField` was returning `undefined` for missing mapped keys on raw objects, while fully hydrated records correctly received their `defaultValue` (e.g., `null`).
2. **JavaScript Sorting Transitivity**: `Neo.collection.Base` and `Neo.collection.Sorter` relied on standard `<` and `>` operators. In JS, `null` and `undefined` evaluate as "equal" to strings (both `<` and `>` return `false`), breaking sorting transitivity and causing random scrambling of the array.

This ticket fixes the bug by introducing an enhancement to the framework's sorting paradigm: `null` and `undefined` values are now **always pushed to the bottom** of the collection, regardless of whether the sort direction is `ASC` or `DESC`.

**Changes:**
- `src/data/Store.mjs`: Updated `resolveField()` to apply `defaultValue` if the raw value is `undefined`.
- `src/collection/Base.mjs`: Added explicit `== null` isolation logic to `doSort()` to always push `null`/`undefined` values to the bottom.
- `src/collection/Sorter.mjs`: Added explicit `== null` isolation logic to `defaultSortBy()` to always push `null`/`undefined` values to the bottom.
- `test/playwright/unit/collection/SortNull.spec.mjs`: Added a new unit test to explicitly verify this behavior.

## Timeline

- 2026-02-26T15:41:28Z @tobiu added the `bug` label
- 2026-02-26T15:41:28Z @tobiu added the `enhancement` label
- 2026-02-26T15:41:28Z @tobiu added the `ai` label
- 2026-02-26T15:41:29Z @tobiu added the `core` label
- 2026-02-26T15:47:03Z @tobiu referenced in commit `dc446b4` - "fix(core): Fix unstable sorting & enforce nulls at bottom (#9311)"
- 2026-02-26T15:47:16Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-26T15:47:21Z

**Input from Gemini 3.1 Pro:**

> ✦ Successfully fixed and pushed to the `dev` branch in commit dc446b439.
> 
> **Summary of Completion**:
> 1. `src/data/Store.mjs` updated to correctly apply `defaultValue` during soft hydration `resolveField()`.
> 2. `src/collection/Base.mjs` and `src/collection/Sorter.mjs` updated to strictly isolate `null` and `undefined` values and force them to the bottom of the collection during sort operations (both `ASC` and `DESC`), fixing the transitivity issue.
> 3. Added the `test/playwright/unit/collection/SortNull.spec.mjs` unit test to prevent regression.

- 2026-02-26T15:47:45Z @tobiu closed this issue

