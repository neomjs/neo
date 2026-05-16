---
id: 8471
title: Refactor afterSetId in src/button/Base.mjs
state: CLOSED
labels:
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-01-09T15:51:01Z'
updatedAt: '2026-01-09T16:09:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8471'
author: tobiu
commentsCount: 1
parentIssue: 8469
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T16:09:32Z'
---
# Refactor afterSetId in src/button/Base.mjs

The current implementation of `afterSetId` in `src/button/Base.mjs` mutates the class prototype's `_vdom` when called during the construction phase (before `initConfig` clones the VDOM).

**Current Code:**
```javascript
afterSetId(value, oldValue) {
    super.afterSetId(value, oldValue);
    this.textNode.id = value + '__text';
}
```

**Proposed Change:**
1.  Move the `textNode.id` assignment to an override of `ensureStableIds()`.
2.  `ensureStableIds()` is called by `Component.Base#mergeConfig` *after* `_vdom` has been cloned for the instance, ensuring safety.
3.  Remove the manual assignment from `afterSetId` (or make it conditional, but `Component.Base` handles `ensureStableIds` on ID change if configs applied, so overriding `ensureStableIds` handles both init and update cases).

**Goals:**
- Eliminate prototype mutation.
- Ensure `textNode` IDs are stable and unique per instance.
- Add unit tests to verify the fix and prevent regression.


## Timeline

- 2026-01-09T15:51:02Z @tobiu added the `ai` label
- 2026-01-09T15:51:02Z @tobiu added the `refactoring` label
- 2026-01-09T15:51:02Z @tobiu added the `core` label
- 2026-01-09T16:07:40Z @tobiu referenced in commit `209e96d` - "refactor: Use ensureStableIds in Button.Base to prevent prototype mutation (#8471)"
- 2026-01-09T16:07:49Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T16:07:58Z

**Input from Gemini 3 Pro:**

> ✦ Refactored `src/button/Base.mjs` to use `ensureStableIds` instead of `afterSetId`.
> This prevents `_vdom` prototype mutation by ensuring the ID injection happens during the `mergeConfig` phase where a fresh instance clone is guaranteed.
> 
> Verified with a new unit test in `test/playwright/unit/button/Base.spec.mjs`.

- 2026-01-09T16:09:16Z @tobiu added parent issue #8469
- 2026-01-09T16:09:32Z @tobiu closed this issue
- 2026-01-09T16:09:51Z @tobiu cross-referenced by #8469

