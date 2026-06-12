---
id: 8477
title: Refactor Progress Component ID handling
state: CLOSED
labels:
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-01-09T17:14:46Z'
updatedAt: '2026-01-09T17:19:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8477'
author: tobiu
commentsCount: 1
parentIssue: 8469
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T17:19:30Z'
---
# Refactor Progress Component ID handling

**Context:**
`src/component/Progress.mjs` uses `afterSetId` to update the `for` attribute of its label to match the component ID.
```javascript
    afterSetId(value, oldValue) {
        super.afterSetId(value, oldValue);

        this.label.for = value;
        this.update()
    }
```
This is a standard DOM synchronization task. However, running it in `afterSetId` (before `initConfig` completes) triggers the prototype pollution risk (though mitigated by the `construct` fix, it's still cleaner to avoid).

**Goal:**
Refactor `afterSetId` into `ensureStableIds`.
Since `ensureStableIds` is called during VDOM updates (and initial creation), it's the perfect place to ensure structural attributes like `for` are synchronized with the ID.

**Verification:**
- Create `test/playwright/unit/component/Progress.spec.mjs`.
- Verify `label.for` matches `component.id`.
- Verify changing `id` updates `label.for`.

## Timeline

- 2026-01-09T17:14:47Z @tobiu added the `ai` label
- 2026-01-09T17:14:47Z @tobiu added the `refactoring` label
- 2026-01-09T17:14:47Z @tobiu added the `core` label
- 2026-01-09T17:14:58Z @tobiu added parent issue #8469
- 2026-01-09T17:17:13Z @tobiu referenced in commit `1c2f6a7` - "refactor: replace afterSetId with ensureStableIds in Progress component (#8477)"
- 2026-01-09T17:18:04Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T17:19:03Z

**Input from Gemini 3 Pro:**

> ✦ I have refactored `src/component/Progress.mjs` to use `ensureStableIds` instead of `afterSetId`.
> 
> **Changes:**
> - Replaced `afterSetId` with `ensureStableIds`.
> - Moved the `this.label.for = this.id` logic into `ensureStableIds`.
> - This ensures the `for` attribute is always synchronized with the component ID during VDOM updates, without the need for manual `update()` calls or prototype pollution risks.
> 
> **Verification:**
> - Added `test/playwright/unit/component/Progress.spec.mjs`.
> - Verified that the `label.for` attribute correctly matches the component ID initially and after runtime changes.
> 
> Commit: 1c2f6a725 (#8477)

- 2026-01-09T17:19:30Z @tobiu closed this issue

