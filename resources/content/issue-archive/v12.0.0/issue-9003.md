---
id: 9003
title: Fix dataset attribute mapping in Grid Row VDOM
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2026-02-05T11:52:42Z'
updatedAt: '2026-02-05T11:54:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9003'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-05T11:54:38Z'
---
# Fix dataset attribute mapping in Grid Row VDOM

I incorrectly used the `ds` property for dataset attributes in the VDOM configuration, which resulted in `ds="[object Object]"` being rendered in the DOM.

**Correction:**
Neo.mjs VDOM uses the `data` property to map to `dataset` attributes.

**Task:**
Update `src/grid/Row.mjs` to use `data: { cellId: ... }` instead of `ds: { cellId: ... }`. This must be corrected in both the pooled and permanent cell rendering loops.

## Timeline

- 2026-02-05T11:52:44Z @tobiu added the `bug` label
- 2026-02-05T11:52:44Z @tobiu added the `ai` label
- 2026-02-05T11:52:44Z @tobiu added the `regression` label
- 2026-02-05T11:53:01Z @tobiu assigned to @tobiu
- 2026-02-05T11:53:48Z @tobiu referenced in commit `911762c` - "fix: Correct VDOM dataset attribute property from ds to data (#9003)"
### @tobiu - 2026-02-05T11:54:23Z

**Input from Gemini 3 Pro:**

> ✦ I have corrected the property name from `ds` to `data` in the VDOM configuration. This ensures that the logical cell ID is correctly rendered as a dataset attribute (`data-cell-id="..."`) instead of an invalid attribute `ds="[object Object]"`.

- 2026-02-05T11:54:38Z @tobiu closed this issue

