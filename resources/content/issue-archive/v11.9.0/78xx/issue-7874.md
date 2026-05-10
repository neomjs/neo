---
id: 7874
title: Remove duplicate contains() method in Rectangle.mjs
state: CLOSED
labels:
  - bug
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-23T11:07:40Z'
updatedAt: '2025-11-23T11:13:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7874'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-23T11:13:57Z'
---
# Remove duplicate contains() method in Rectangle.mjs

**Description**
The `contains` method in `src/util/Rectangle.mjs` is defined twice. 
1. Once with inline logic.
2. Once delegating to `this.constructor.includes`.

This causes code duplication and confusion.

**Proposed Change**
1. Remove the duplicate definition (the inline one).
2. Update the remaining `contains` method to explicitly use `Rectangle.includes(this, other)` instead of `this.constructor.includes` to match the style used in `leavesSide` and ensure correctness.

**Acceptance Criteria**
- `contains` is defined only once.
- `contains` delegates to the static `includes` method.
- Tests (if any) still pass.


## Timeline

- 2025-11-23T11:07:42Z @tobiu added the `bug` label
- 2025-11-23T11:07:42Z @tobiu added the `ai` label
- 2025-11-23T11:07:42Z @tobiu added the `refactoring` label
- 2025-11-23T11:12:26Z @tobiu assigned to @tobiu
- 2025-11-23T11:13:34Z @tobiu referenced in commit `ab304fe` - "Remove duplicate contains() method in Rectangle.mjs #7874"
- 2025-11-23T11:13:57Z @tobiu closed this issue

