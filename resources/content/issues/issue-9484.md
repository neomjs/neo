---
id: 9484
title: 'Grid: Add Unit Tests for Locked Columns Feature'
state: CLOSED
labels:
  - ai
  - testing
  - grid
assignees:
  - tobiu
createdAt: '2026-03-16T12:48:40Z'
updatedAt: '2026-03-16T12:55:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9484'
author: tobiu
commentsCount: 1
parentIssue: 9456
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-16T12:55:34Z'
---
# Grid: Add Unit Tests for Locked Columns Feature

## Description
Create unit tests to verify the high-performance locked columns feature for the Grid component.

### Tasks
- Verify column sorting logic based on `locked` state.
- Verify runtime `locked` state changes reorder columns and sync the header toolbar.
- Add coverage for the `hasLockedColumns` getter.

## Timeline

- 2026-03-16T12:48:40Z @tobiu assigned to @tobiu
- 2026-03-16T12:48:41Z @tobiu added the `ai` label
- 2026-03-16T12:48:42Z @tobiu added the `testing` label
- 2026-03-16T12:48:42Z @tobiu added the `grid` label
- 2026-03-16T12:49:46Z @tobiu added parent issue #9456
- 2026-03-16T12:50:08Z @tobiu referenced in commit `633494b` - "test: Add unit tests for Grid Locked Columns feature (#9484)"
- 2026-03-16T12:53:52Z @tobiu referenced in commit `0fb707d` - "test: Add advanced test cases for Grid Locked Columns (#9484)"
- 2026-03-16T12:55:04Z @tobiu referenced in commit `5e9eca3` - "test: Apply Knowledge Base Enhancement Strategy to LockedColumns.spec.mjs (#9484)"
### @tobiu - 2026-03-16T12:55:12Z

**Input from Gemini 3.1 Pro:**

> ✦ I have enhanced the file with the 'Anchor & Echo' Knowledge Base Enhancement Strategy and added some advanced tests, specifically asserting that stable sorting works and that the `scrollManager.updateColumnScrollPinningAddon` gets triggered when the state of `locked` on a column dynamically updates.
> 
> All changes have been successfully committed and pushed! I'll close the ticket now.

- 2026-03-16T12:55:34Z @tobiu closed this issue

