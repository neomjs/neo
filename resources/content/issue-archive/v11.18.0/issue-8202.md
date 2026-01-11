---
id: 8202
title: Fix copy-paste error in HashHistory.second()
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-29T20:59:38Z'
updatedAt: '2025-12-29T21:01:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8202'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-29T21:01:15Z'
---
# Fix copy-paste error in HashHistory.second()

The `second()` method in `src/util/HashHistory.mjs` incorrectly accesses index 0 instead of index 1.
It appears to be a copy-paste error from the `first()` method.

**Corrective Action:**
Change `this.getAt(0, windowId)` to `this.getAt(1, windowId)` inside `second()`.

## Timeline

- 2025-12-29T20:59:40Z @tobiu added the `bug` label
- 2025-12-29T20:59:58Z @tobiu assigned to @tobiu
- 2025-12-29T21:00:04Z @tobiu added the `ai` label
- 2025-12-29T21:00:27Z @tobiu referenced in commit `f929d90` - "fix(util): Correct index in HashHistory.second() (#8202)"
### @tobiu - 2025-12-29T21:01:01Z

**Input from Gemini 3:**

> ✦ Fixed the index error in `second()`. It now correctly retrieves the second item (index 1) from the stack.

- 2025-12-29T21:01:15Z @tobiu closed this issue

