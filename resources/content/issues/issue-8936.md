---
id: 8936
title: 'Fix: RecordFactory mapping logic not triggering for missing source keys'
state: CLOSED
labels:
  - bug
  - core
assignees:
  - tobiu
createdAt: '2026-02-01T16:25:50Z'
updatedAt: '2026-02-01T16:33:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8936'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-01T16:33:03Z'
---
# Fix: RecordFactory mapping logic not triggering for missing source keys

This task fixes a bug in `Neo.data.RecordFactory` where model fields using the `mapping` configuration are not populated if the field name itself is missing from the input data object.

### The Issue
Currently, `setRecordFields` iterates over `Object.entries(fields)` (the input data). If a field like `y2025` relies on a mapping `years.2025`, but `y2025` is not in the input data, `setRecordFields` never processes it, and the mapping logic inside `parseRecordValue` is never triggered.

### The Fix
Modify `Neo.data.RecordFactory.assignDefaultValues` to also handle mapped fields.
- Iterate over the model's fields.
- If a field has a `mapping` and the field key is missing in the data object:
    - Explicitly set `data[fieldName] = undefined` (or the default value).
- This ensures that `setRecordFields` will visit the field, triggering `parseRecordValue`, which then correctly resolves the mapping from the source data.

### Acceptance Criteria
- Fields with `mapping` are correctly populated even if their key is missing in the source data.
- The DevRank grid correctly displays data for the mapped yearly columns.


## Timeline

- 2026-02-01T16:25:51Z @tobiu added the `bug` label
- 2026-02-01T16:25:51Z @tobiu added the `core` label
- 2026-02-01T16:25:59Z @tobiu added parent issue #8930
- 2026-02-01T16:26:10Z @tobiu assigned to @tobiu
- 2026-02-01T16:32:29Z @tobiu referenced in commit `33c939e` - "fix: RecordFactory mapping logic not triggering for missing source keys (#8936)"
### @tobiu - 2026-02-01T16:32:38Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the fix for `RecordFactory` mapping logic.
> 
> ### The Fix
> I modified `assignDefaultValues` in `src/data/RecordFactory.mjs`. It now iterates over mapped fields and, if the field is missing from the input `data` object, it attempts to resolve the value using the `mapping` path from the `data` object itself.
> 
> This effectively "pre-populates" the mapped fields in the config object before `setRecordFields` iterates over them, ensuring that the mapping is applied and the value is set on the record.
> 
> ### Verification
> This change ensures that `y2025` (mapped to `years.2025`) in the DevRank model will be correctly populated from the source JSON, even though `y2025` is not a key in the source JSON.
> 
> I have pushed the changes to `dev`.

- 2026-02-01T16:33:03Z @tobiu closed this issue

