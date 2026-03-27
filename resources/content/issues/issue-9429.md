---
id: 9429
title: 'TreeStore: Implement ancestor-aware filtering for filter override'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - grid
assignees:
  - tobiu
createdAt: '2026-03-10T13:15:54Z'
updatedAt: '2026-03-10T14:18:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9429'
author: tobiu
commentsCount: 2
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-10T14:18:50Z'
---
# TreeStore: Implement ancestor-aware filtering for filter override

### Goal
Implement a custom `filter()` override in `Neo.data.TreeStore` that ensures ancestor paths remain visible when a child node matches a filter.

### Context
`TreeStore` inherits `filter()` from `Collection.Base`, which applies filtering rules strictly to individual records in the flat array. If a user searches for a specific child node name, standard filtering will hide its parent (if the parent's name doesn't match), leaving the child visually orphaned or entirely invisible.

### Acceptance Criteria
- Override `filter()` in `TreeStore`.
- The filtering algorithm must be "ancestor-aware":
  - If a child node matches the filter, all of its ancestors (up to the root) MUST be forced visible, even if they themselves do not match the filter text.
  - If a parent node matches the filter, it should ideally show all of its descendants (or collapse them but keep them structurally intact).
- Add a test case verifying that ancestor paths are preserved when filtering deep children.

## Timeline

- 2026-03-10T13:15:55Z @tobiu added the `enhancement` label
- 2026-03-10T13:15:55Z @tobiu added the `ai` label
- 2026-03-10T13:15:55Z @tobiu added the `architecture` label
- 2026-03-10T13:15:56Z @tobiu added the `grid` label
- 2026-03-10T13:16:05Z @tobiu added parent issue #9404
### @tobiu - 2026-03-10T13:36:55Z

**Input from Gemini 3.1 Pro:**

> ✦ **Implementation Guidance for Future Sessions:**
> 
> Please utilize the Playwright unit testing environment established in `test/playwright/unit/data/TreeStore.spec.mjs`. 
> 
> When implementing the ancestor-aware `filter` override, please add a new `test.describe` block to this file.
> 
> **Testing Requirements:**
> 1. Initialize a `TreeStore` with a deep nested hierarchy.
> 2. Apply a Filter targeting a specific child node name.
> 3. Assert that the matched child node is present in the `_items` array.
> 4. **Crucially:** Assert that *all ancestor nodes* of that child remain in the `_items` array (ignoring their own filter mismatch), ensuring the visual tree path isn't broken.
> 5. Ensure the test covers both **Turbo Mode** (`autoInitRecords: false` using raw objects) and standard mode (Records).

- 2026-03-10T14:17:40Z @tobiu referenced in commit `af15a6b` - "feat: TreeStore ancestor-aware filter override (#9429)"
- 2026-03-10T14:18:09Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-10T14:18:17Z

**Input from Gemini 3.1 Pro:**

> ✦ I have successfully implemented the ancestor-aware filtering override for `TreeStore`:
> 
> 1. **Ancestor Preservation:** When evaluating the tree top-down, if a deep descendant matches the active filters, its `isKept` flag bubbles up through the recursive calls. This forces all of its ancestors to remain visible and automatically sets `collapsed = false` so the matched node is immediately visible in the UI.
> 2. **Descendant Preservation:** If an ancestor explicitly matches a filter (e.g. searching for a specific folder), that match cascades down, keeping all of its descendants visible and structurally intact.
> 3. **Turbo Mode Safety:** Inherited the soft-hydration logic, iterating over the `allRecordsMap` to dynamically resolve complex fields before beginning the recursive evaluation, ensuring filtering works optimally without instantiating records.
> 4. **Knowledge Base Documentation:** Detailed JSDoc comments were added to both `doSort()` and `filter()` using the "Architectural Mechanics" pattern, making the underlying tree projection logic highly queryable for future AI sessions. 
> 5. **Testing**: Implemented the "Ancestor-Aware Filtering" test suite in `test/playwright/unit/data/TreeStore.spec.mjs`, proving that ancestors are kept and the `Turbo Mode` correctly handles structural hierarchies during filtering.
> 
> Closing this ticket!

- 2026-03-10T14:18:50Z @tobiu closed this issue

