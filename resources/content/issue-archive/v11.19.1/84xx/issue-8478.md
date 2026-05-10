---
id: 8478
title: Refactor afterSetId in Form Fields to ensureStableIds
state: CLOSED
labels:
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-01-09T17:20:52Z'
updatedAt: '2026-01-09T17:25:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8478'
author: tobiu
commentsCount: 1
parentIssue: 8469
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T17:25:00Z'
---
# Refactor afterSetId in Form Fields to ensureStableIds

**Context:**
`src/form/field/CheckBox.mjs`, `src/form/field/FileUpload.mjs`, and `src/form/field/Text.mjs` all implement `afterSetId` to manually update ID attributes of their internal VDOM nodes (inputs, labels, icons, etc.).
This pattern is consistent across these form fields.

**Goal:**
Refactor `afterSetId` into `ensureStableIds` for all three files.
This will:
1.  Ensure ID synchronization happens during the VDOM update preparation phase.
2.  Remove potential prototype pollution risks (mitigated by `construct` fix but still cleaner).
3.  Standardize the codebase on `ensureStableIds`.

**Files:**
- `src/form/field/CheckBox.mjs`: `label`, `input`, `icon`, `valueLabel` IDs.
- `src/form/field/FileUpload.mjs`: `input` ID.
- `src/form/field/Text.mjs`: `input`, `label` IDs.

**Verification:**
- Create `test/playwright/unit/form/field/IdSync.spec.mjs`.
- Test each field type:
    - Create instance.
    - Check internal node IDs match the component ID structure.
    - Change ID.
    - Verify internal node IDs update.

## Timeline

- 2026-01-09T17:20:53Z @tobiu added the `ai` label
- 2026-01-09T17:20:53Z @tobiu added the `refactoring` label
- 2026-01-09T17:20:53Z @tobiu added the `core` label
- 2026-01-09T17:21:17Z @tobiu added parent issue #8469
- 2026-01-09T17:24:27Z @tobiu referenced in commit `91085ea` - "refactor: replace afterSetId with ensureStableIds in form fields (#8478)"
- 2026-01-09T17:24:34Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T17:24:43Z

**Input from Gemini 3 Pro:**

> ✦ I have refactored `afterSetId` to `ensureStableIds` in:
> - `src/form/field/CheckBox.mjs`
> - `src/form/field/FileUpload.mjs`
> - `src/form/field/Text.mjs`
> 
> **Changes:**
> - Replaced `afterSetId` with `ensureStableIds`.
> - ID synchronization logic for internal elements (inputs, labels, icons) is now handled during VDOM preparation.
> - This eliminates the need for manual `update()` calls in ID setters and further reduces prototype pollution risks.
> 
> **Verification:**
> - Added `test/playwright/unit/form/field/IdSync.spec.mjs`.
> - Verified that all internal node IDs (e.g. `__input`, `__label`) and attributes (`for`) are correctly synchronized with the component ID for all three field types.
> 
> Commit: 91085ea4f (#8478)

- 2026-01-09T17:25:00Z @tobiu closed this issue

