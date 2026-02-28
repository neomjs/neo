---
id: 9193
title: Implement Virtual Fields for Zero-Overhead Records
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-02-17T12:41:44Z'
updatedAt: '2026-02-17T13:40:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9193'
author: tobiu
commentsCount: 1
parentIssue: 9194
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-17T13:40:58Z'
---
# Implement Virtual Fields for Zero-Overhead Records

### Objective
Implement `virtual: true` support in `Neo.data.RecordFactory` and update `DevIndex.model.Contributor` to utilize it.

### Motivation
The `DevIndex.model.Contributor` currently generates 60+ fields for yearly stats (e.g., `y2020`, `cy2020`). Despite claims of "Zero Overhead", these are currently stored as individual properties on every record instance, causing significant memory duplication.

### Implementation Plan
1.  **Update `Neo.data.RecordFactory`**:
    *   Support `virtual: true` in field configs.
    *   **Getter Logic:** Virtual fields will define a getter on the prototype that executes `field.calculate(this[dataSymbol])`.
    *   **Storage Logic:** `assignDefaultValues` and `setRecordFields` must **skip** virtual fields to ensure they are never written to the instance data.
2.  **Update `DevIndex.model.Contributor`**:
    *   Update `addYearFields` to set `virtual: true` for all year-based fields (`y...`, `cy...`, `py...`).
    *   Ensure the `calculate` functions for these fields use efficient O(1) array lookups.

### Outcome
True "Zero Overhead" for calculated year fields, reducing memory footprint for the 50k+ contributor dataset while maintaining O(1) access performance.

## Timeline

- 2026-02-17T12:41:45Z @tobiu added the `enhancement` label
- 2026-02-17T12:41:46Z @tobiu added the `ai` label
- 2026-02-17T12:41:46Z @tobiu added the `performance` label
- 2026-02-17T12:41:46Z @tobiu added the `core` label
- 2026-02-17T13:35:24Z @tobiu cross-referenced by #9194
- 2026-02-17T13:35:37Z @tobiu added parent issue #9194
- 2026-02-17T13:37:29Z @tobiu referenced in commit `b3c9b2c` - "feat(core): Implement virtual fields and fix grid data mode switching (#9193, #9195)"
- 2026-02-17T13:38:43Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-17T13:40:36Z

**Input from Gemini 3 Pro:**

> ✦ Implemented `virtual: true` support in `RecordFactory` and updated `DevIndex.model.Contributor` to use it.
> Commits pushed to `feature/zero-overhead-records`.
> Closing as the core feature implementation is complete. Verification and regression fixing continues in #9195 and the parent Epic #9194.

- 2026-02-17T13:40:58Z @tobiu closed this issue
- 2026-02-17T14:33:43Z @tobiu cross-referenced by #9199

