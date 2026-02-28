---
id: 9056
title: 'Fix: CountryFlag not resetting when value is null'
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2026-02-08T20:45:04Z'
updatedAt: '2026-02-08T20:46:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9056'
author: tobiu
commentsCount: 0
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-08T20:46:19Z'
---
# Fix: CountryFlag not resetting when value is null

The `Neo.component.CountryFlag` component has a regression where the flag image is not cleared when the `location` value is set to null or an empty string. This is particularly noticeable in `Neo.grid.column.CountryFlag` when recycling rows, causing incorrect flags to persist.

The issue is due to the update logic being encapsulated within an `if (value)` block in the `afterSetLocation` method.

**Proposed Fix:**
- Move the VDOM update logic outside the `if (value)` check to ensure the component updates even when the value is cleared.
- Ensure `me.update()` is called in all cases.

## Timeline

- 2026-02-08T20:45:06Z @tobiu added the `bug` label
- 2026-02-08T20:45:06Z @tobiu added the `ai` label
- 2026-02-08T20:45:06Z @tobiu added the `regression` label
- 2026-02-08T20:45:51Z @tobiu assigned to @tobiu
- 2026-02-08T20:46:00Z @tobiu added parent issue #8930
- 2026-02-08T20:46:12Z @tobiu referenced in commit `4107224` - "fix: CountryFlag not resetting when value is null (#9056)"
- 2026-02-08T20:46:19Z @tobiu closed this issue

